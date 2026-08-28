import { isIsoDate } from "../../shared/lib/date";

export type ReconcileStatus = "eligible" | "pending" | "paid" | "review";

export type ReconciliationIssue =
	| "unmatched_customer"
	| "unmatched_product"
	| "missing_quantity"
	| "missing_recipient"
	| "missing_opening_balance";

export interface ReconciliationRecipientAmount {
	recipientId: string;
	recipientName: string;
	grossAmountPerUnit: number;
	retainedAmountPerUnit: number;
	amountPerUnit: number;
	grossTotal: number;
	retainedTotal: number;
	totalAmount: number;
}

export interface ReconciliationProductLine {
	id: string;
	misaRowId: string;
	date: string;
	documentNumber: string;
	productId: string | null;
	productCode: string;
	productName: string;
	unit: string;
	quantity: number | null;
	unitPrice: number | null;
	revenue: number;
	policyId: string | null;
	grossDiscount: number;
	retainedCost: number;
	discount: number;
	recipients: ReconciliationRecipientAmount[];
	issue: ReconciliationIssue | null;
	hasPolicy: boolean;
	isReturn: boolean;
}

export interface ReconciliationProductSummary {
	id: string;
	productId: string | null;
	productCode: string;
	productName: string;
	unit: string;
	unitPrice: number | null;
	soldQuantity: number;
	returnedQuantity: number;
	netQuantity: number;
	netRevenue: number;
}

export interface CalculatedReconciliationRow {
	id: string;
	unitId: string;
	customerId: string | null;
	customerCode: string;
	customer: string;
	region: string;
	salesperson: string;
	revenue: number;
	collected: number;
	rawCollected: number;
	priorDebtSettled: number;
	adjustmentSettled: number;
	unallocatedCollected: number;
	remainingReceivable: number;
	difference: number;
	collectionRate: number;
	expectedDiscount: number;
	status: Exclude<ReconcileStatus, "paid">;
	issues: ReconciliationIssue[];
	warnings: string[];
	productLines: ReconciliationProductLine[];
	productSummaries: ReconciliationProductSummary[];
	openingBalanceKnown: boolean;
}

export interface CalculatedReconciliation {
	dateFrom: string;
	dateTo: string;
	paymentCutoff: string;
	rows: CalculatedReconciliationRow[];
	totals: {
		revenue: number;
		collected: number;
		eligibleCustomers: number;
		eligibleDiscount: number;
		reviewCustomers: number;
	};
}

export interface ReconciliationEntry {
	id: string;
	customerCode: string;
	customerName: string;
	region: string;
	salesperson: string;
	revenue: number;
	collected: number;
	expectedDiscount: number;
	paidDiscount: number;
	status: ReconcileStatus;
}

export interface MonthlySeriesItem {
	label: string;
	revenue: number;
	collected: number;
}

export interface ReconciliationData {
	periodLabel: string;
	updatedThrough: string;
	entries: ReconciliationEntry[];
	monthlySeries: MonthlySeriesItem[];
}

export interface CustomerReconcileRow
	extends Omit<ReconciliationEntry, "customerName"> {
	customer: string;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isEntry(value: unknown): value is ReconciliationEntry {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const row = value as Record<string, unknown>;
	return (
		typeof row.id === "string" &&
		typeof row.customerCode === "string" &&
		typeof row.customerName === "string" &&
		typeof row.region === "string" &&
		typeof row.salesperson === "string" &&
		isFiniteNumber(row.revenue) &&
		isFiniteNumber(row.collected) &&
		isFiniteNumber(row.expectedDiscount) &&
		isFiniteNumber(row.paidDiscount) &&
		(row.status === "eligible" ||
			row.status === "pending" ||
			row.status === "paid" ||
			row.status === "review")
	);
}

export function isReconciliationData(
	value: unknown,
): value is ReconciliationData {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const data = value as Record<string, unknown>;
	return (
		typeof data.periodLabel === "string" &&
		isIsoDate(data.updatedThrough) &&
		Array.isArray(data.entries) &&
		data.entries.every(isEntry) &&
		Array.isArray(data.monthlySeries) &&
		data.monthlySeries.every((item) => {
			if (!item || typeof item !== "object" || Array.isArray(item))
				return false;
			const point = item as Record<string, unknown>;
			return (
				typeof point.label === "string" &&
				isFiniteNumber(point.revenue) &&
				isFiniteNumber(point.collected)
			);
		})
	);
}
