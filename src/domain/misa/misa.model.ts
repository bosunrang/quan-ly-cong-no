import { isIsoDate, isIsoTimestamp } from "../../shared/lib/date";

export interface MisaUnitSummary {
	id: string;
	name: string;
	customerId: string | null;
	customerCode: string | null;
	sourceRowCount: number;
	salesLineCount: number;
	salesDocumentCount: number;
	receiptDocumentCount: number;
	adjustmentDocumentCount: number;
	salesAmount: number;
	receiptAmount: number;
	openingBalance: number | null;
	lastTransactionDate: string | null;
}

export function isMisaUnitDiscountEligible(
	unit: Pick<MisaUnitSummary, "salesAmount" | "receiptAmount">,
): boolean {
	return (
		Number.isFinite(unit.salesAmount) &&
		Number.isFinite(unit.receiptAmount) &&
		unit.salesAmount > 0 &&
		unit.receiptAmount >= unit.salesAmount
	);
}

export interface MisaDataset {
	fileName: string;
	importedAt: string;
	periodFrom: string | null;
	periodTo: string | null;
	sourceRowCount: number;
	detailsAvailable: boolean;
	units: MisaUnitSummary[];
}

export type MisaDocumentKind = "sale" | "receipt" | "adjustment";

export interface MisaDetailRecord {
	id: string;
	unitId: string;
	rowNumber: number;
	date: string | null;
	documentNumber: string;
	productCode: string;
	description: string;
	unit: string;
	quantity: number | null;
	unitPrice: number | null;
	generalDescription: string;
	debtAccount: string;
	contraAccount: string;
	debit: number | null;
	credit: number | null;
	balanceDebit: number | null;
	balanceCredit: number | null;
	documentKind: MisaDocumentKind;
}

export interface MisaImportResult extends MisaDataset {
	rows: MisaDetailRecord[];
}

export interface MisaDetailQuery {
	unitId: string;
	query: string;
	documentKind: MisaDocumentKind | "all";
	page: number;
	pageSize: number;
}

export interface MisaRangeQuery {
	dateFrom: string;
	dateTo: string;
}

export interface MisaDetailPage {
	rows: MisaDetailRecord[];
	filteredCount: number;
	page: number;
	pageCount: number;
	firstVisible: number;
	lastVisible: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
	return typeof value === "string" || value === null;
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isMisaUnitSummary(value: unknown): value is MisaUnitSummary {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.name === "string" &&
		isNullableString(value.customerId) &&
		isNullableString(value.customerCode) &&
		isNonNegativeInteger(value.sourceRowCount) &&
		isNonNegativeInteger(value.salesLineCount) &&
		isNonNegativeInteger(value.salesDocumentCount) &&
		isNonNegativeInteger(value.receiptDocumentCount) &&
		isNonNegativeInteger(value.adjustmentDocumentCount) &&
		typeof value.salesAmount === "number" &&
		Number.isFinite(value.salesAmount) &&
		typeof value.receiptAmount === "number" &&
		Number.isFinite(value.receiptAmount) &&
		isNullableNumber(value.openingBalance) &&
		(value.lastTransactionDate === null || isIsoDate(value.lastTransactionDate))
	);
}

function isNullableNumber(value: unknown): value is number | null {
	return (
		(typeof value === "number" && Number.isFinite(value)) || value === null
	);
}

export function isMisaDetailRecord(value: unknown): value is MisaDetailRecord {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.unitId === "string" &&
		isNonNegativeInteger(value.rowNumber) &&
		(value.date === null || isIsoDate(value.date)) &&
		typeof value.documentNumber === "string" &&
		typeof value.productCode === "string" &&
		typeof value.description === "string" &&
		typeof value.unit === "string" &&
		isNullableNumber(value.quantity) &&
		isNullableNumber(value.unitPrice) &&
		typeof value.generalDescription === "string" &&
		typeof value.debtAccount === "string" &&
		typeof value.contraAccount === "string" &&
		isNullableNumber(value.debit) &&
		isNullableNumber(value.credit) &&
		isNullableNumber(value.balanceDebit) &&
		isNullableNumber(value.balanceCredit) &&
		["sale", "receipt", "adjustment"].includes(String(value.documentKind))
	);
}

export function isMisaDetailRecordList(
	value: unknown,
): value is MisaDetailRecord[] {
	return Array.isArray(value) && value.every(isMisaDetailRecord);
}

export function isMisaDetailPage(value: unknown): value is MisaDetailPage {
	return (
		isRecord(value) &&
		Array.isArray(value.rows) &&
		value.rows.every(isMisaDetailRecord) &&
		isNonNegativeInteger(value.filteredCount) &&
		isNonNegativeInteger(value.page) &&
		isNonNegativeInteger(value.pageCount) &&
		isNonNegativeInteger(value.firstVisible) &&
		isNonNegativeInteger(value.lastVisible)
	);
}

export function isMisaDataset(value: unknown): value is MisaDataset {
	return (
		isRecord(value) &&
		typeof value.fileName === "string" &&
		isIsoTimestamp(value.importedAt) &&
		(value.periodFrom === null || isIsoDate(value.periodFrom)) &&
		(value.periodTo === null || isIsoDate(value.periodTo)) &&
		isNonNegativeInteger(value.sourceRowCount) &&
		typeof value.detailsAvailable === "boolean" &&
		Array.isArray(value.units) &&
		value.units.every(isMisaUnitSummary)
	);
}

export function isNullableMisaDataset(
	value: unknown,
): value is MisaDataset | null {
	return value === null || isMisaDataset(value);
}
