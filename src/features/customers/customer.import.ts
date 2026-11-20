import type { Row, SheetData } from "read-excel-file/browser";
import { readExcelSheet } from "../../shared/lib/excelSheet";
import type {
	Customer,
	CustomerGroup,
	CustomerImportDraft,
} from "../../domain/customers/customer.model";
import {
	inferProvince,
	normalizeVietnamese,
} from "../../domain/customers/customer.province";
import { customerTaxCodes } from "../../domain/customers/customer.tax-code";
import { localDateToIso } from "../../shared/lib/date";

export type CustomerImportStatus = "ready" | "duplicate" | "invalid";

export interface CustomerImportPreviewRow {
	rowNumber: number;
	draft: CustomerImportDraft;
	status: CustomerImportStatus;
	message: string;
	provinceInferred: boolean;
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
): Promise<CustomerImportPreview> {
	const sheet = file.name.toLocaleLowerCase("vi-VN").endsWith(".csv")
		? parseCsv(await file.text())
		: await readExcelSheet(file);
	return parseCustomerRows(file.name, sheet, existingCustomers);
}

export function parseCustomerRows(
	fileName: string,
	sheet: SheetData,
	existingCustomers: ExistingCustomerForImport[],
): CustomerImportPreview {
	const [headers = [], ...dataRows] = sheet;
	const columns = {
		misaCode: findColumn(headers, headerAliases.misaCode),
		name: findColumn(headers, headerAliases.name),
		group: findColumn(headers, headerAliases.group),
		taxCode: findColumn(headers, headerAliases.taxCode),
		address: findColumn(headers, headerAliases.address),
		province: findColumn(headers, headerAliases.province),
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
		const normalizedCode = misaCode.toLocaleLowerCase("vi-VN");
		const issues: string[] = [];

		if (!misaCode) issues.push("Thiếu mã khách hàng");
		if (!name) issues.push("Thiếu tên khách hàng");
		if (!address) issues.push("Thiếu địa chỉ");
		if (!province) issues.push("Thiếu tỉnh/thành phố");

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
			},
			status,
			message,
			provinceInferred,
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
