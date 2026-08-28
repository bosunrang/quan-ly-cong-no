import { readSheet, type Row, type SheetData } from "read-excel-file/browser";
import { normalizeVietnamese } from "../../domain/customers/customer.province";
import type { Product } from "../../domain/products/product.model";

export interface ProductImportDraft {
	code: string;
	name: string;
	unit: string;
	group: string;
	existingProductId?: string;
}

export type ProductImportStatus = "ready" | "update" | "duplicate" | "invalid";

export interface ProductImportRow {
	rowNumber: number;
	draft: ProductImportDraft;
	status: ProductImportStatus;
	message: string;
}

export interface ProductImportPreview {
	fileName: string;
	rows: ProductImportRow[];
	readyCount: number;
	updateCount: number;
	duplicateCount: number;
	invalidCount: number;
}

const aliases = {
	code: ["ma hang", "ma san pham", "ma sp"],
	name: ["ten hang", "ten san pham"],
	unit: ["dvt", "don vi tinh"],
	group: ["nhom", "nhom san pham", "nhom hang"],
};

function text(value: unknown): string {
	return String(value ?? "").trim();
}

function comparable(value: unknown): string {
	return text(value)
		.replace(/\s+/g, " ")
		.normalize("NFC")
		.toLocaleLowerCase("vi-VN");
}

function isUnchangedProduct(
	existing: Product,
	draft: Pick<ProductImportDraft, "name" | "unit" | "group">,
): boolean {
	return (
		comparable(existing.name) === comparable(draft.name) &&
		comparable(existing.unit) === comparable(draft.unit) &&
		comparable(existing.group) === comparable(draft.group)
	);
}

function column(headers: Row, names: string[]): number {
	return headers.findIndex((header) =>
		names.includes(normalizeVietnamese(text(header))),
	);
}

export async function parseProductWorkbook(
	file: File,
	products: Product[],
): Promise<ProductImportPreview> {
	return parseProductRows(file.name, await readSheet(file), products);
}

export function parseProductRows(
	fileName: string,
	sheet: SheetData,
	products: Product[],
): ProductImportPreview {
	const [headers = [], ...dataRows] = sheet;
	const columns = {
		code: column(headers, aliases.code),
		name: column(headers, aliases.name),
		unit: column(headers, aliases.unit),
		group: column(headers, aliases.group),
	};
	if (Object.values(columns).some((index) => index < 0)) {
		throw new Error("File Excel cần đủ 4 cột: Mã hàng, Tên hàng, ĐVT và Nhóm.");
	}

	const existingByCode = new Map(
		products.map((product) => [
			product.code.trim().toLocaleUpperCase("vi-VN"),
			product,
		]),
	);
	const firstRowByCode = new Map<string, number>();
	const rows: ProductImportRow[] = [];

	dataRows.forEach((row, index) => {
		if (!row.some((cell) => text(cell))) return;
		const rowNumber = index + 2;
		const code = text(row[columns.code]).toLocaleUpperCase("vi-VN");
		const name = text(row[columns.name]);
		const unit = text(row[columns.unit]);
		const group = text(row[columns.group]);
		const issues: string[] = [];
		if (!code) issues.push("Thiếu mã hàng");
		if (!name) issues.push("Thiếu tên hàng");
		if (!unit) issues.push("Thiếu ĐVT");

		let status: ProductImportStatus = issues.length ? "invalid" : "ready";
		let message = issues.join(" · ");
		const existing = existingByCode.get(code);
		if (status === "ready" && firstRowByCode.has(code)) {
			status = "duplicate";
			message = `Trùng mã với dòng ${firstRowByCode.get(code)}`;
		} else if (status === "ready") {
			firstRowByCode.set(code, rowNumber);
			if (existing) {
				if (isUnchangedProduct(existing, { name, unit, group })) {
					status = "duplicate";
					message = "Trùng với sản phẩm đã có";
				} else {
					status = "update";
					message = "Thông tin sản phẩm có thay đổi";
				}
			} else {
				message = "Sẵn sàng thêm mới";
			}
		}
		rows.push({
			rowNumber,
			draft: { code, name, unit, group, existingProductId: existing?.id },
			status,
			message,
		});
	});

	if (!rows.length)
		throw new Error("Không tìm thấy dòng sản phẩm nào trong file Excel.");
	return {
		fileName,
		rows,
		readyCount: rows.filter((row) => row.status === "ready").length,
		updateCount: rows.filter((row) => row.status === "update").length,
		duplicateCount: rows.filter((row) => row.status === "duplicate").length,
		invalidCount: rows.filter((row) => row.status === "invalid").length,
	};
}
