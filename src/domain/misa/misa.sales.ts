import { normalizeVietnamese } from "../customers/customer.province";
import type { MisaDetailRecord } from "./misa.model";

type MisaSalesFields = Pick<
	MisaDetailRecord,
	| "documentKind"
	| "documentNumber"
	| "description"
	| "generalDescription"
	| "productCode"
	| "quantity"
	| "unitPrice"
	| "debit"
	| "credit"
>;

function finite(value: number | null): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function isMisaReturnRecord(row: MisaSalesFields): boolean {
	const description = normalizeVietnamese(
		`${row.description} ${row.generalDescription}`,
	);
	return (
		(row.quantity !== null && row.quantity < 0) ||
		description.includes("tra hang") ||
		description.includes("hang ban bi tra lai")
	);
}

export function isMisaProductMovement(row: MisaSalesFields): boolean {
	return (
		Boolean(row.productCode || row.description) &&
		row.quantity !== null &&
		Number.isFinite(row.quantity) &&
		row.quantity !== 0
	);
}

export function misaNetSalesAmount(row: MisaSalesFields): number {
	const debit = finite(row.debit);
	if (!isMisaReturnRecord(row)) {
		if (debit !== 0) return debit;
		if (row.quantity !== null && row.unitPrice !== null) {
			return row.quantity * Math.abs(row.unitPrice);
		}
		return 0;
	}

	if (debit < 0) return debit;
	const credit = finite(row.credit);
	if (credit !== 0) return -Math.abs(credit);
	if (debit !== 0) return -Math.abs(debit);
	if (row.quantity !== null && row.unitPrice !== null) {
		return row.quantity * Math.abs(row.unitPrice);
	}
	return 0;
}
