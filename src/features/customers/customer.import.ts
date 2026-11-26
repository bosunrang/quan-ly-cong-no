import type { Row, SheetData } from "read-excel-file/browser";
import { readExcelSheet } from "../../shared/lib/excelSheet";
import type {
	Customer,
	CustomerGroup,
	CustomerImportDraft,
	CustomerStatus,
} from "../../domain/customers/customer.model";
import {
	inferProvince,
	normalizeVietnamese,
} from "../../domain/customers/customer.province";
import { customerTaxCodes } from "../../domain/customers/customer.tax-code";
import { resolveCustomerImportEmployee } from "../../domain/customers/customer-import-employee";
import type { SalesEmployee } from "../../domain/employees/employee.model";
import { localDateToIso, normalizeDateOnly } from "../../shared/lib/date";

export type CustomerImportStatus = "ready" | "duplicate" | "invalid";

export interface CustomerImportPreviewRow {
	rowNumber: number;
	draft: CustomerImportDraft;
	status: CustomerImportStatus;
	message: string;
	provinceInferred: boolean;
	employeeMessage?: string;
}

interface CustomerImportOptions {
	employees?: SalesEmployee[];
	canImportAssignments?: boolean;
}

export interface CustomerImportPreview {
	fileName: string;
	rows: CustomerImportPreviewRow[];
	readyCount: number;
	duplicateCount: number;
	invalidCount: number;
}

type ExistingCustomerForImport = Pick<
	Customer,
	"misaCode" | "name" | "taxCode"
>;

const headerAliases = {
	misaCode: ["ma khach hang", "ma kh", "ma misa"],
	name: ["ten khach hang", "ten don vi", "khach hang"],
	group: ["nha nuoc tu nhan", "nhom", "nhom khach hang", "loai khach hang"],
	taxCode: ["ma so thue", "ma thue", "mst"],
	address: ["dia chi"],
	province: ["tinh thanh pho", "tinh thanh", "tinh", "thanh pho"],
	status: ["trang thai", "trang thai khach hang"],
	paymentTermDays: ["thoi han cong no ngay", "thoi han cong no"],
	employeeCode: ["ma nhan vien phu trach", "ma nhan vien", "ma nv phu trach"],
	employeeName: [
		"nhan vien phu trach",
		"ten nhan vien phu trach",
		"ten nhan vien",
	],
	assignmentFrom: ["ngay bat dau phu trach", "ngay bat dau phan cong"],
};

function cellText(value: unknown): string {
	if (value instanceof Date) return localDateToIso(value);
	return String(value ?? "").trim();
}

function findColumn(headers: Row, aliases: string[]): number {
	const normalizedAliases = aliases.map(normalizeVietnamese);
	return headers.findIndex((header) =>
		normalizedAliases.includes(normalizeVietnamese(cellText(header))),
	);
}

function parseGroup(value: string): CustomerGroup | undefined {
	const normalized = normalizeVietnamese(value);
	if (normalized.includes("nha nuoc")) return "state";
	if (normalized.includes("tu nhan")) return "private";
	if (normalized === "chua phan loai") return "unknown";
	return undefined;
}

function parseCustomerStatus(value: string): CustomerStatus | undefined {
	switch (normalizeVietnamese(value)) {
		case "":
		case "active":
		case "dang hoat dong":
			return "active";
		case "paused":
		case "tam ngung":
			return "paused";
		default:
			return undefined;
	}
}

function parseCsv(source: string): SheetData {
	const rows: string[][] = [];
	let row: string[] = [];
	let value = "";
	let quoted = false;
	const text = source.replace(/^\uFEFF/, "");

	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];
		if (character === '"') {
			if (quoted && text[index + 1] === '"') {
				value += '"';
				index += 1;
			} else {
				quoted = !quoted;
			}
		} else if (character === "," && !quoted) {
			row.push(value);
			value = "";
		} else if ((character === "\n" || character === "\r") && !quoted) {
			if (character === "\r" && text[index + 1] === "\n") index += 1;
			row.push(value);
			rows.push(row);
			row = [];
			value = "";
		} else {
			value += character;
		}
	}
	if (value || row.length) {
		row.push(value);
		rows.push(row);
	}
	return rows;
}

export async function parseCustomerWorkbook(
	file: File,
	existingCustomers: Customer[],
	options: CustomerImportOptions = {},
): Promise<CustomerImportPreview> {
	const sheet = file.name.toLocaleLowerCase("vi-VN").endsWith(".csv")
		? parseCsv(await file.text())
		: await readExcelSheet(file);
	return parseCustomerRows(file.name, sheet, existingCustomers, options);
}

export function parseCustomerRows(
	fileName: string,
	sheet: SheetData,
	existingCustomers: ExistingCustomerForImport[],
	options: CustomerImportOptions = {},
): CustomerImportPreview {
	const [headers = [], ...dataRows] = sheet;
	const columns = {
		misaCode: findColumn(headers, headerAliases.misaCode),
		name: findColumn(headers, headerAliases.name),
		group: findColumn(headers, headerAliases.group),
		taxCode: findColumn(headers, headerAliases.taxCode),
		address: findColumn(headers, headerAliases.address),
		province: findColumn(headers, headerAliases.province),
		status: findColumn(headers, headerAliases.status),
		paymentTermDays: findColumn(headers, headerAliases.paymentTermDays),
		employeeCode: findColumn(headers, headerAliases.employeeCode),
		employeeName: findColumn(headers, headerAliases.employeeName),
		assignmentFrom: findColumn(headers, headerAliases.assignmentFrom),
	};
	const requiredColumns = {
		misaCode: columns.misaCode,
		name: columns.name,
		address: columns.address,
		province: columns.province,
	};
	const missingHeaders = Object.entries(requiredColumns)
		.filter(([, index]) => index < 0)
		.map(([key]) => key);
	if (missingHeaders.length) {
		throw new Error(
			"File Excel cần đủ 4 cột: Mã khách hàng, Tên khách hàng, Địa chỉ và Tỉnh/Thành phố.",
		);
	}

	const existingCodes = new Set(
		existingCustomers.map((customer) =>
			customer.misaCode.trim().toLocaleLowerCase("vi-VN"),
		),
	);
	const firstRowByCode = new Map<string, number>();
	const taxCodes = customerTaxCodes(existingCustomers);
	const rows: CustomerImportPreviewRow[] = [];
	const employees = [...(options.employees ?? [])];

	dataRows.forEach((row, index) => {
		if (!row.some((value) => cellText(value))) return;
		const rowNumber = index + 2;
		const misaCode = cellText(row[columns.misaCode]);
		const name = cellText(row[columns.name]);
		const group = parseGroup(cellText(row[columns.group]));
		const taxCode = cellText(row[columns.taxCode]);
		const address = cellText(row[columns.address]);
		const provinceFromCell = cellText(row[columns.province]);
		const province = provinceFromCell || inferProvince(address);
		const provinceInferred = !provinceFromCell && Boolean(province);
		const customerStatus = parseCustomerStatus(cellText(row[columns.status]));
		const termText = cellText(row[columns.paymentTermDays]);
		const paymentTermDays =
			/^\d+$/.test(termText) && Number.isSafeInteger(Number(termText))
				? Number(termText)
				: undefined;
		const normalizedCode = misaCode.toLocaleLowerCase("vi-VN");
		const issues: string[] = [];
		const employeeCode = cellText(row[columns.employeeCode]);
		const employeeName = cellText(row[columns.employeeName]);
		const assignmentDate = cellText(row[columns.assignmentFrom]);
		const assignmentFrom = assignmentDate
			? normalizeDateOnly(assignmentDate)
			: undefined;
		const hasEmployee = Boolean(employeeCode || employeeName);
		const employeeMatch = resolveCustomerImportEmployee(
			{ employeeCode, employeeName },
			employees,
		);
		let employeeMessage: string | undefined;
		if (hasEmployee && options.canImportAssignments === false)
			issues.push("Cần quản trị viên nhập danh mục có nhân viên phụ trách");
		if (employeeMatch.error) issues.push(employeeMatch.error);
		if (assignmentDate && !assignmentFrom)
			issues.push("Ngày bắt đầu phụ trách không hợp lệ");
		if (assignmentDate && !hasEmployee)
			issues.push("Có ngày bắt đầu nhưng thiếu nhân viên phụ trách");
		if (employeeMatch.employee)
			employeeMessage = `Phụ trách: ${employeeMatch.employee.name}${employeeMatch.employee.code ? ` (${employeeMatch.employee.code})` : ""}`;
		else if (employeeMatch.create)
			employeeMessage = `Sẽ tạo nhân viên: ${employeeMatch.create.name}${employeeCode ? ` (${employeeCode})` : ""}`;

		if (!misaCode) issues.push("Thiếu mã khách hàng");
		if (!name) issues.push("Thiếu tên khách hàng");
		if (!address) issues.push("Thiếu địa chỉ");
		if (!province) issues.push("Thiếu tỉnh/thành phố");
		if (!customerStatus)
			issues.push("Trạng thái phải là Đang hoạt động hoặc Tạm ngưng");
		if (termText && paymentTermDays === undefined)
			issues.push("Thời hạn công nợ phải là số nguyên không âm");

		let status: CustomerImportStatus = issues.length ? "invalid" : "ready";
		let message = issues.join(" · ");
		if (status === "ready" && firstRowByCode.has(normalizedCode)) {
			status = "duplicate";
			message = `Trùng mã với dòng ${firstRowByCode.get(normalizedCode)}`;
		} else if (status === "ready" && existingCodes.has(normalizedCode)) {
			firstRowByCode.set(normalizedCode, rowNumber);
			status = "duplicate";
			message = "Mã khách hàng đã có trong danh mục";
		} else if (
			status === "ready" &&
			taxCodes.conflicts({ taxCode, name }, true)
		) {
			status = "invalid";
			message = "Mã số thuế đã dùng cho một tên khách hàng khác";
		} else if (status === "ready") {
			firstRowByCode.set(normalizedCode, rowNumber);
			taxCodes.add({ taxCode, name });
			message = provinceInferred
				? "Sẵn sàng · Tỉnh/thành được suy ra từ địa chỉ"
				: "Sẵn sàng nhập";
			if (employeeMatch.create)
				employees.push({
					id: `preview-${rowNumber}`,
					code: employeeMatch.create.code ?? "",
					name: employeeMatch.create.name,
					phone: "",
					email: "",
					status: "active",
					createdAt: "",
				});
		}

		rows.push({
			rowNumber,
			draft: {
				misaCode,
				name,
				group: group ?? "unknown",
				taxCode,
				province,
				address,
				status: customerStatus ?? "active",
				...(paymentTermDays === undefined ? {} : { paymentTermDays }),
				...(employeeCode ? { employeeCode } : {}),
				...(employeeName ? { employeeName } : {}),
				...(assignmentFrom ? { assignmentFrom } : {}),
			},
			status,
			message,
			provinceInferred,
			...(employeeMessage ? { employeeMessage } : {}),
		});
	});

	if (!rows.length)
		throw new Error("Không tìm thấy dòng khách hàng nào trong file Excel.");
	return {
		fileName,
		rows,
		readyCount: rows.filter((row) => row.status === "ready").length,
		duplicateCount: rows.filter((row) => row.status === "duplicate").length,
		invalidCount: rows.filter((row) => row.status === "invalid").length,
	};
}
