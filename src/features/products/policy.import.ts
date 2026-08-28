import { readSheet, type Row, type SheetData } from "read-excel-file/browser";
import type { Customer } from "../../domain/customers/customer.model";
import { normalizeVietnamese } from "../../domain/customers/customer.province";
import { currentRecipient } from "../../domain/customers/customer.selectors";
import {
	addPolicies,
	validatePolicyDraft,
	type PolicyDraft,
} from "../../domain/products/product-policy.service";
import type {
	PolicyCalculationType,
	ProductCatalog,
} from "../../domain/products/product.model";
import { localDateToIso, normalizeDateOnly } from "../../shared/lib/date";

export interface PolicyImportRow {
	rowNumber: number;
	productCode: string;
	customerCode: string;
	customerName: string;
	draft?: PolicyDraft;
	status: "ready" | "invalid";
	message: string;
}

export interface PolicyImportPreview {
	fileName: string;
	rows: PolicyImportRow[];
	readyCount: number;
	invalidCount: number;
}

const aliases = {
	productCode: ["ma san pham", "ma sp", "san pham"],
	customerCode: ["ma don vi", "ma khach hang", "ma kh", "ma misa"],
	calculationType: ["cach tinh", "loai chiet khau"],
	value: ["muc chiet khau", "muc ck", "gia tri"],
	retainedAmount: ["chi phi giu lai", "giu lai", "muc giu lai"],
	effectiveFrom: ["hieu luc tu", "ngay bat dau"],
	effectiveTo: ["hieu luc den", "ngay ket thuc"],
	note: ["ghi chu"],
};

function text(value: unknown): string {
	if (value instanceof Date) return localDateToIso(value);
	return String(value ?? "").trim();
}

function column(headers: Row, names: string[]): number {
	return headers.findIndex((header) =>
		names.includes(normalizeVietnamese(text(header))),
	);
}

function parseType(value: string): PolicyCalculationType | undefined {
	const normalized = normalizeVietnamese(value);
	if (
		normalized.includes("%") ||
		normalized.includes("phan tram") ||
		normalized === "percent"
	)
		return "percent";
	if (
		normalized.includes("so tien") ||
		normalized.includes("dong") ||
		normalized === "fixed"
	)
		return "fixed";
	return undefined;
}

function parseNumber(value: unknown): number | undefined {
	if (typeof value === "number")
		return Number.isFinite(value) ? value : undefined;
	const raw = text(value).replace(/\s|₫|%/g, "");
	const normalized = raw.includes(",")
		? raw.replaceAll(".", "").replace(",", ".")
		: raw;
	const parsed = Number(normalized);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDate(value: unknown): string | undefined {
	if (value instanceof Date) return localDateToIso(value);
	return normalizeDateOnly(text(value));
}

export async function parsePolicyWorkbook(
	file: File,
	catalog: ProductCatalog,
	customers: Customer[],
): Promise<PolicyImportPreview> {
	return parsePolicyRows(file.name, await readSheet(file), catalog, customers);
}

export function parsePolicyRows(
	fileName: string,
	sheet: SheetData,
	catalog: ProductCatalog,
	customers: Customer[],
): PolicyImportPreview {
	const [headers = [], ...dataRows] = sheet;
	const columns = {
		productCode: column(headers, aliases.productCode),
		customerCode: column(headers, aliases.customerCode),
		calculationType: column(headers, aliases.calculationType),
		value: column(headers, aliases.value),
		retainedAmount: column(headers, aliases.retainedAmount),
		effectiveFrom: column(headers, aliases.effectiveFrom),
		effectiveTo: column(headers, aliases.effectiveTo),
		note: column(headers, aliases.note),
	};
	if (
		[
			columns.productCode,
			columns.customerCode,
			columns.calculationType,
			columns.value,
			columns.effectiveFrom,
		].some((index) => index < 0)
	) {
		throw new Error(
			"File cần đủ 5 cột: Mã sản phẩm, Mã đơn vị, Cách tính, Mức chiết khấu và Hiệu lực từ.",
		);
	}

	let staged = structuredClone(catalog);
	const rows: PolicyImportRow[] = [];
	dataRows.forEach((row, index) => {
		if (!row.some((cell) => text(cell))) return;
		const rowNumber = index + 2;
		const productCode = text(row[columns.productCode]);
		const customerCode = text(row[columns.customerCode]);
		const customer = customers.find(
			(item) =>
				item.misaCode.toLocaleLowerCase("vi-VN") ===
				customerCode.toLocaleLowerCase("vi-VN"),
		);
		const product = catalog.products.find(
			(item) =>
				item.code.toLocaleLowerCase("vi-VN") ===
				productCode.toLocaleLowerCase("vi-VN"),
		);
		const recipient = customer ? currentRecipient(customer) : undefined;
		const calculationType = parseType(text(row[columns.calculationType]));
		const value = parseNumber(row[columns.value]);
		const retainedAmount =
			columns.retainedAmount >= 0
				? parseNumber(row[columns.retainedAmount])
				: 0;
		const effectiveFrom = parseDate(row[columns.effectiveFrom]);
		const effectiveToCell =
			columns.effectiveTo >= 0 ? row[columns.effectiveTo] : undefined;
		const effectiveTo = text(effectiveToCell)
			? parseDate(effectiveToCell)
			: null;
		const issues: string[] = [];
		if (!product) issues.push("Không tìm thấy mã sản phẩm");
		if (!customer) issues.push("Không tìm thấy mã đơn vị");
		else if (!recipient) issues.push("Đơn vị chưa có người nhận chiết khấu");
		if (!calculationType)
			issues.push("Cách tính phải là Số tiền hoặc Phần trăm");
		else if (calculationType === "percent")
			issues.push("Chính sách hiện chỉ nhận số tiền trực tiếp theo người nhận");
		if (value === undefined) issues.push("Mức chiết khấu không hợp lệ");
		if (retainedAmount === undefined)
			issues.push("Chi phí giữ lại không hợp lệ");
		if (!effectiveFrom) issues.push("Ngày hiệu lực không hợp lệ");
		if (text(effectiveToCell) && !effectiveTo)
			issues.push("Ngày kết thúc không hợp lệ");

		let draft: PolicyDraft | undefined;
		if (
			product &&
			customer &&
			recipient &&
			calculationType === "fixed" &&
			value !== undefined &&
			retainedAmount !== undefined &&
			effectiveFrom &&
			effectiveTo !== undefined
		) {
			const amount = value;
			const nextDraft: PolicyDraft = {
				productId: product.id,
				customerIds: [customer.id],
				recipientAllocationsByCustomer: {
					[customer.id]: [
						{ recipientId: recipient.id, amount, retainedAmount },
					],
				},
				calculationType: "fixed",
				value: amount,
				effectiveFrom,
				effectiveTo,
				note: columns.note >= 0 ? text(row[columns.note]) : "",
			};
			draft = nextDraft;
			const validation = validatePolicyDraft(staged, nextDraft);
			if (validation) issues.push(validation);
			else staged = addPolicies(staged, nextDraft);
		}
		rows.push({
			rowNumber,
			productCode,
			customerCode,
			customerName: customer?.name ?? "",
			draft,
			status: issues.length ? "invalid" : "ready",
			message: issues.join(" · ") || "Sẵn sàng nhập",
		});
	});
	if (rows.length === 0)
		throw new Error("Không tìm thấy dòng chính sách nào trong file Excel.");
	return {
		fileName,
		rows,
		readyCount: rows.filter((row) => row.status === "ready").length,
		invalidCount: rows.filter((row) => row.status === "invalid").length,
	};
}
