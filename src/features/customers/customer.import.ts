import { readSheet, type Row, type SheetData } from "read-excel-file/browser";
import type {
	Customer,
	CustomerGroup,
	CustomerImportDraft,
} from "../../domain/customers/customer.model";
import {
	inferProvince,
	normalizeVietnamese,
} from "../../domain/customers/customer.province";
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

const headerAliases = {
	misaCode: ["ma khach hang", "ma kh", "ma misa"],
	name: ["ten khach hang", "ten don vi", "khach hang"],
	group: ["nha nuoc tu nhan", "nhom khach hang", "loai khach hang"],
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
	return undefined;
}

export async function parseCustomerWorkbook(
	file: File,
	existingCustomers: Customer[],
): Promise<CustomerImportPreview> {
	return parseCustomerRows(file.name, await readSheet(file), existingCustomers);
}

export function parseCustomerRows(
	fileName: string,
	sheet: SheetData,
	existingCustomers: Customer[],
): CustomerImportPreview {
	const [headers = [], ...dataRows] = sheet;
	const columns = {
		misaCode: findColumn(headers, headerAliases.misaCode),
		name: findColumn(headers, headerAliases.name),
		group: findColumn(headers, headerAliases.group),
		address: findColumn(headers, headerAliases.address),
		province: findColumn(headers, headerAliases.province),
	};
	const missingHeaders = Object.entries(columns)
		.filter(([, index]) => index < 0)
		.map(([key]) => key);
	if (missingHeaders.length) {
		throw new Error(
			"File Excel cần đủ 5 cột: Mã khách hàng, Tên khách hàng, Nhà nước/Tư nhân, Địa chỉ và Tỉnh/Thành phố.",
		);
	}

	const existingCodes = new Set(
		existingCustomers.map((customer) =>
			customer.misaCode.trim().toLocaleLowerCase("vi-VN"),
		),
	);
	const firstRowByCode = new Map<string, number>();
	const rows: CustomerImportPreviewRow[] = [];

	dataRows.forEach((row, index) => {
		if (!row.some((value) => cellText(value))) return;
		const rowNumber = index + 2;
		const misaCode = cellText(row[columns.misaCode]);
		const name = cellText(row[columns.name]);
		const group = parseGroup(cellText(row[columns.group]));
		const address = cellText(row[columns.address]);
		const provinceFromCell = cellText(row[columns.province]);
		const province = provinceFromCell || inferProvince(address);
		const provinceInferred = !provinceFromCell && Boolean(province);
		const normalizedCode = misaCode.toLocaleLowerCase("vi-VN");
		const issues: string[] = [];

		if (!misaCode) issues.push("Thiếu mã khách hàng");
		if (!name) issues.push("Thiếu tên khách hàng");
		if (!group) issues.push("Nhóm phải là Nhà nước hoặc Tư nhân");
		if (!address) issues.push("Thiếu địa chỉ");
		if (!province) issues.push("Thiếu tỉnh/thành phố");

		let status: CustomerImportStatus = issues.length ? "invalid" : "ready";
		let message = issues.join(" · ");
		if (status === "ready" && existingCodes.has(normalizedCode)) {
			status = "duplicate";
			message = "Mã khách hàng đã có trong hệ thống";
		} else if (status === "ready" && firstRowByCode.has(normalizedCode)) {
			status = "duplicate";
			message = `Trùng mã với dòng ${firstRowByCode.get(normalizedCode)}`;
		} else if (status === "ready") {
			firstRowByCode.set(normalizedCode, rowNumber);
			message = provinceInferred
				? "Sẵn sàng · Tỉnh/thành được suy ra từ địa chỉ"
				: "Sẵn sàng nhập";
		}

		rows.push({
			rowNumber,
			draft: { misaCode, name, group: group ?? "state", province, address },
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
