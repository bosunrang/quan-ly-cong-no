import { readSheet, type Row, type SheetData } from "read-excel-file/browser";
import type { Customer } from "../../domain/customers/customer.model";
import { normalizeVietnamese } from "../../domain/customers/customer.province";
import type {
	MisaDetailRecord,
	MisaDocumentKind,
	MisaImportResult,
	MisaUnitSummary,
} from "../../domain/misa/misa.model";
import { misaNetSalesAmount } from "../../domain/misa/misa.sales";
import { localDateToIso, normalizeDateOnly } from "../../shared/lib/date";

const headerAliases = {
	customer: ["ten khach hang", "khach hang", "ten don vi"],
	date: ["ngay chung tu", "ngay"],
	document: ["so chung tu", "so don", "chung tu"],
	productCode: ["ma hang", "ma san pham", "ma vat tu"],
	description: ["dien giai", "ten hang", "hang hoa"],
	unit: ["dvt", "don vi tinh"],
	quantity: ["so luong", "sl"],
	unitPrice: ["don gia", "gia ban"],
	generalDescription: ["dien giai chung", "noi dung chung"],
	debtAccount: ["tk cong no", "tai khoan cong no"],
	contraAccount: ["tk doi ung", "tai khoan doi ung"],
	debit: ["phat sinh no", "no"],
	credit: ["phat sinh co", "co"],
	balanceDebit: ["so du no"],
	balanceCredit: ["so du co"],
};

interface ColumnMap {
	customer: number;
	date: number;
	document: number;
	productCode: number;
	description: number;
	unit: number;
	quantity: number;
	unitPrice: number;
	generalDescription: number;
	debtAccount: number;
	contraAccount: number;
	debit: number;
	credit: number;
	balanceDebit: number;
	balanceCredit: number;
}

interface MutableUnit extends MisaUnitSummary {
	salesDocuments: Set<string>;
	receiptDocuments: Set<string>;
	adjustmentDocuments: Set<string>;
}

function cellText(value: unknown): string {
	if (value instanceof Date) return localDateToIso(value);
	return String(value ?? "").trim();
}

function cellNumber(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	const text = cellText(value).replace(/\s/g, "");
	if (!text) return 0;
	const normalized = text.includes(",")
		? text.replace(/\./g, "").replace(",", ".")
		: text.replace(/,/g, "");
	const result = Number(normalized);
	return Number.isFinite(result) ? result : 0;
}

function cellOptionalNumber(value: unknown): number | null {
	return cellText(value) ? cellNumber(value) : null;
}

function cellDate(value: unknown): string | undefined {
	if (value instanceof Date) return localDateToIso(value);
	return normalizeDateOnly(cellText(value));
}

function findColumn(headers: Row, aliases: string[]): number {
	const normalizedAliases = aliases.map(normalizeVietnamese);
	return headers.findIndex((header) =>
		normalizedAliases.includes(normalizeVietnamese(cellText(header))),
	);
}

function resolveColumns(headers: Row): ColumnMap {
	return {
		customer: findColumn(headers, headerAliases.customer),
		date: findColumn(headers, headerAliases.date),
		document: findColumn(headers, headerAliases.document),
		productCode: findColumn(headers, headerAliases.productCode),
		description: findColumn(headers, headerAliases.description),
		unit: findColumn(headers, headerAliases.unit),
		quantity: findColumn(headers, headerAliases.quantity),
		unitPrice: findColumn(headers, headerAliases.unitPrice),
		generalDescription: findColumn(headers, headerAliases.generalDescription),
		debtAccount: findColumn(headers, headerAliases.debtAccount),
		contraAccount: findColumn(headers, headerAliases.contraAccount),
		debit: findColumn(headers, headerAliases.debit),
		credit: findColumn(headers, headerAliases.credit),
		balanceDebit: findColumn(headers, headerAliases.balanceDebit),
		balanceCredit: findColumn(headers, headerAliases.balanceCredit),
	};
}

function hasAllColumns(columns: ColumnMap): boolean {
	const {
		productCode: _optionalProductCode,
		balanceDebit: _optionalBalanceDebit,
		balanceCredit: _optionalBalanceCredit,
		...requiredColumns
	} = columns;
	return Object.values(requiredColumns).every((column) => column >= 0);
}

function findHeaders(sheet: SheetData): {
	dataStartIndex: number;
	columns: ColumnMap;
} {
	for (let index = 0; index < Math.min(sheet.length, 12); index += 1) {
		const row = sheet[index] ?? [];
		const directColumns = resolveColumns(row);
		if (hasAllColumns(directColumns))
			return { dataStartIndex: index + 1, columns: directColumns };

		const nextRow = sheet[index + 1] ?? [];
		let parentHeader = "";
		const combinedHeaders = Array.from(
			{ length: Math.max(row.length, nextRow.length) },
			(_, column) => {
				const currentHeader = cellText(row[column]);
				if (currentHeader) parentHeader = currentHeader;
				return [currentHeader || parentHeader, cellText(nextRow[column])]
					.filter(Boolean)
					.join(" ");
			},
		) as Row;
		const combinedColumns = resolveColumns(combinedHeaders);
		if (hasAllColumns(combinedColumns))
			return { dataStartIndex: index + 2, columns: combinedColumns };
	}
	throw new Error(
		"Không nhận ra cấu trúc file. File MISA cần có các cột Tên khách hàng, Ngày chứng từ, Số chứng từ, diễn giải, số lượng, đơn giá và Phát sinh Nợ/Có.",
	);
}

function customerLookup(customers: Customer[]): Map<string, Customer | null> {
	const lookup = new Map<string, Customer | null>();
	for (const customer of customers) {
		const key = normalizeVietnamese(customer.name);
		if (!key) continue;
		lookup.set(key, lookup.has(key) ? null : customer);
	}
	return lookup;
}

function documentKind(input: {
	documentNumber: string;
	description: string;
	generalDescription: string;
	quantity: number | null;
}): MisaDocumentKind | "opening" {
	const { documentNumber, description, generalDescription, quantity } = input;
	const normalized = normalizeVietnamese(documentNumber).replace(/\s/g, "");
	if (!normalized && normalizeVietnamese(description).includes("so du dau ky"))
		return "opening";
	if (quantity !== null && Number.isFinite(quantity) && quantity !== 0)
		return "sale";
	const transactionText = normalizeVietnamese(
		`${description} ${generalDescription}`,
	);
	if (transactionText.includes("thu tien")) return "receipt";
	if (normalized.startsWith("bh")) return "sale";
	if (normalized.startsWith("nt") || normalized.startsWith("pt"))
		return "receipt";
	return "adjustment";
}

function earliestDate(current: string | null, candidate: string): string {
	return current === null || candidate.localeCompare(current) < 0
		? candidate
		: current;
}

function latestDate(current: string | null, candidate: string): string {
	return current === null || candidate.localeCompare(current) > 0
		? candidate
		: current;
}

function createUnit(
	key: string,
	name: string,
	match: Customer | null | undefined,
): MutableUnit {
	return {
		id: key,
		name,
		customerId: match?.id ?? null,
		customerCode: match?.misaCode ?? null,
		sourceRowCount: 0,
		salesLineCount: 0,
		salesDocumentCount: 0,
		receiptDocumentCount: 0,
		adjustmentDocumentCount: 0,
		salesAmount: 0,
		receiptAmount: 0,
		openingBalance: null,
		lastTransactionDate: null,
		salesDocuments: new Set(),
		receiptDocuments: new Set(),
		adjustmentDocuments: new Set(),
	};
}

export async function parseMisaWorkbook(
	file: File,
	customers: Customer[],
): Promise<MisaImportResult> {
	return parseMisaRows(file.name, await readSheet(file), customers);
}

export function parseMisaRows(
	fileName: string,
	sheet: SheetData,
	customers: Customer[],
	now = new Date(),
): MisaImportResult {
	const { dataStartIndex, columns } = findHeaders(sheet);
	const matches = customerLookup(customers);
	const units = new Map<string, MutableUnit>();
	let periodFrom: string | null = null;
	let periodTo: string | null = null;
	let sourceRowCount = 0;
	const detailRows: MisaDetailRecord[] = [];

	for (const [offset, row] of sheet.slice(dataStartIndex).entries()) {
		const name = cellText(row[columns.customer]);
		if (!name || normalizeVietnamese(name).startsWith("so dong")) continue;
		const key = normalizeVietnamese(name);
		if (!key) continue;
		const documentNumber = cellText(row[columns.document]);
		const description = cellText(row[columns.description]);
		const generalDescription = cellText(row[columns.generalDescription]);
		const quantity = cellOptionalNumber(row[columns.quantity]);
		const kind = documentKind({
			documentNumber,
			description,
			generalDescription,
			quantity,
		});
		const unit = units.get(key) ?? createUnit(key, name, matches.get(key));
		units.set(key, unit);
		if (kind === "opening") {
			const openingDebit =
				columns.balanceDebit >= 0 ? cellNumber(row[columns.balanceDebit]) : 0;
			const openingCredit =
				columns.balanceCredit >= 0 ? cellNumber(row[columns.balanceCredit]) : 0;
			unit.openingBalance = openingDebit - openingCredit;
			continue;
		}
		unit.sourceRowCount += 1;
		sourceRowCount += 1;

		const date = cellDate(row[columns.date]);
		if (date) {
			periodFrom = earliestDate(periodFrom, date);
			periodTo = latestDate(periodTo, date);
			unit.lastTransactionDate = latestDate(unit.lastTransactionDate, date);
		}

		const detail: MisaDetailRecord = {
			id: `${key}:${dataStartIndex + offset + 1}`,
			unitId: key,
			rowNumber: dataStartIndex + offset + 1,
			date: date ?? null,
			documentNumber,
			productCode:
				columns.productCode >= 0 ? cellText(row[columns.productCode]) : "",
			description,
			unit: cellText(row[columns.unit]),
			quantity,
			unitPrice: cellOptionalNumber(row[columns.unitPrice]),
			generalDescription,
			debtAccount: cellText(row[columns.debtAccount]),
			contraAccount: cellText(row[columns.contraAccount]),
			debit: cellOptionalNumber(row[columns.debit]),
			credit: cellOptionalNumber(row[columns.credit]),
			balanceDebit:
				columns.balanceDebit >= 0
					? cellOptionalNumber(row[columns.balanceDebit])
					: null,
			balanceCredit:
				columns.balanceCredit >= 0
					? cellOptionalNumber(row[columns.balanceCredit])
					: null,
			documentKind: kind,
		};
		detailRows.push(detail);
		if (!documentNumber) continue;
		if (kind === "sale") {
			unit.salesLineCount += 1;
			unit.salesAmount += misaNetSalesAmount(detail);
			unit.salesDocuments.add(documentNumber);
		} else if (kind === "receipt") {
			unit.receiptAmount += cellNumber(row[columns.credit]);
			unit.receiptDocuments.add(documentNumber);
		} else {
			unit.adjustmentDocuments.add(documentNumber);
		}
	}

	if (!units.size) {
		throw new Error("Không tìm thấy dữ liệu đơn vị nào trong file MISA.");
	}

	const summaries = [...units.values()]
		.map(
			({ salesDocuments, receiptDocuments, adjustmentDocuments, ...unit }) => ({
				...unit,
				salesDocumentCount: salesDocuments.size,
				receiptDocumentCount: receiptDocuments.size,
				adjustmentDocumentCount: adjustmentDocuments.size,
			}),
		)
		.sort((left, right) =>
			left.name.localeCompare(right.name, "vi-VN", { sensitivity: "base" }),
		);

	return {
		fileName,
		importedAt: now.toISOString(),
		periodFrom,
		periodTo,
		sourceRowCount,
		detailsAvailable: true,
		units: summaries,
		rows: detailRows,
	};
}
