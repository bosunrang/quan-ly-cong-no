import { isIsoDate } from "../../shared/lib/date";
import { type ReceiptLedger, totalsByReceipt } from "./receipt-ledger";
import type { ReceivableDocument } from "./receipt-receivables";

export const agingBuckets = [
	"current",
	"1-30",
	"31-60",
	"61-90",
	"90+",
	"no-due-date",
] as const;

export type AgingBucket = (typeof agingBuckets)[number];
export type AgingFilter = AgingBucket | "overdue" | "";
export type AgingAmounts = Record<AgingBucket, number>;

export interface InvoiceDueDate {
	customerId: string;
	documentId: string;
	dueDate: string;
}

export interface InvoiceAging {
	dueDate: string | null;
	overrideDueDate: string | null;
	daysOverdue: number | null;
	bucket: AgingBucket | null;
}

const dayMs = 86_400_000;

export function emptyAgingAmounts(): AgingAmounts {
	return {
		current: 0,
		"1-30": 0,
		"31-60": 0,
		"61-90": 0,
		"90+": 0,
		"no-due-date": 0,
	};
}

export function dueDateMap(entries: readonly InvoiceDueDate[]) {
	const customers = new Map<string, Map<string, string>>();
	for (const { customerId, documentId, dueDate } of entries) {
		let dates = customers.get(customerId);
		if (!dates) {
			dates = new Map();
			customers.set(customerId, dates);
		}
		dates.set(documentId, dueDate);
	}
	return customers;
}

type InvoiceDates = Pick<ReceivableDocument, "invoiceDate" | "firstDate">;

export function invoiceTermStartDate({ invoiceDate, firstDate }: InvoiceDates) {
	if (isIsoDate(invoiceDate)) return invoiceDate;
	return isIsoDate(firstDate) ? firstDate : null;
}

export function invoiceDueDateFromTerm(
	document: InvoiceDates,
	days: number | undefined,
) {
	if (days === undefined || !Number.isSafeInteger(days) || days < 0)
		return null;
	const issued = invoiceTermStartDate(document);
	if (!issued) return null;
	const date = new Date(Date.parse(issued) + days * dayMs);
	if (!Number.isFinite(date.getTime())) return null;
	const iso = date.toISOString().split("T")[0];
	return isIsoDate(iso) ? iso : null;
}

function overdueBucket(days: number): AgingBucket {
	if (days === 0) return "current";
	if (days <= 30) return "1-30";
	if (days <= 60) return "31-60";
	if (days <= 90) return "61-90";
	return "90+";
}

export function invoiceAging(
	document: ReceivableDocument,
	termDays: number | undefined,
	overrideDueDate: string | undefined,
	asOf: string,
): InvoiceAging {
	// Số dư đầu kỳ gồm nhiều hóa đơn cũ không rõ ngày: không tính hạn theo kỳ hạn của khách,
	// chỉ dùng hạn sửa tay nếu có.
	const dueDate = document.reduction
		? null
		: (overrideDueDate ??
			(document.balance && !document.openingBalance
				? invoiceDueDateFromTerm(document, termDays)
				: null));
	const remaining = document.balance?.remaining ?? 0;
	const daysOverdue =
		remaining > 0 && dueDate
			? Math.max(0, (Date.parse(asOf) - Date.parse(dueDate)) / dayMs)
			: null;
	return {
		dueDate,
		overrideDueDate: document.reduction ? null : (overrideDueDate ?? null),
		daysOverdue,
		bucket:
			remaining <= 0
				? null
				: daysOverdue === null
					? "no-due-date"
					: overdueBucket(daysOverdue),
	};
}

export function matchesAging(bucket: AgingBucket | null, filter: AgingFilter) {
	if (filter === "") return true;
	return filter === "overdue"
		? bucket !== null && bucket !== "current" && bucket !== "no-due-date"
		: bucket === filter;
}

export interface CustomerAgingSummary {
	/** Số còn lại của từng hóa đơn, chia theo nhóm tuổi nợ (chưa trừ giảm trừ chung). */
	amounts: AgingAmounts;
	/** Giảm trừ chung (hàng bán trả lại, giảm giá) chưa trừ vào hóa đơn nào, ghi số dương. */
	reductionAmount: number;
	earliestDueDate: string | null;
	maxOverdueDays: number | null;
	/** Nợ quá hạn sau khi trừ giảm trừ chung, không âm. */
	overdueAmount: number;
}

/**
 * Tuổi nợ của một khách. Cộng các nhóm rồi trừ `reductionAmount` thì bằng số còn phải thu
 * của khách. Giảm trừ chung được trừ vào phần quá hạn trước vì đó là phần nợ cũ nhất.
 */
export function summarizeCustomerAging(
	documents: readonly ReceivableDocument[],
	ageOf: (document: ReceivableDocument) => InvoiceAging,
): CustomerAgingSummary {
	const amounts = emptyAgingAmounts();
	let reductionAmount = 0;
	let earliestDueDate: string | null = null;
	let maxOverdueDays: number | null = null;
	let grossOverdue = 0;
	for (const document of documents) {
		const remaining = document.balance?.remaining ?? 0;
		if (document.reduction) {
			reductionAmount -= Math.min(0, remaining);
			continue;
		}
		if (remaining <= 0) continue;
		const age = ageOf(document);
		if (!age.bucket) continue;
		amounts[age.bucket] += remaining;
		if (age.daysOverdue !== null && age.daysOverdue > 0)
			grossOverdue += remaining;
		if (age.dueDate && (!earliestDueDate || age.dueDate < earliestDueDate))
			earliestDueDate = age.dueDate;
		if (age.daysOverdue !== null)
			maxOverdueDays = Math.max(maxOverdueDays ?? 0, age.daysOverdue);
	}
	return {
		amounts,
		reductionAmount,
		earliestDueDate,
		maxOverdueDays,
		overdueAmount: Math.max(0, grossOverdue - reductionAmount),
	};
}

/** Lọc khách: "Nợ quá hạn" xét nợ quá hạn đã trừ giảm trừ; các nhóm khác xét từng hóa đơn. */
export function matchesCustomerAging(
	summary: CustomerAgingSummary,
	filter: AgingFilter,
) {
	if (filter === "") return true;
	return filter === "overdue"
		? summary.overdueAmount > 0
		: summary.amounts[filter] > 0;
}

export interface AgingPortfolio<T> {
	amounts: AgingAmounts;
	reductionAmount: number;
	/** Nợ quá hạn đã trừ giảm trừ chung của từng khách. */
	overdueAmount: number;
	overdueCount: number;
	/** Số khách còn hóa đơn chưa có hạn thanh toán. */
	noDueDateCount: number;
	/** Khách còn nợ quá hạn, nợ quá hạn nhiều nhất trước, rồi quá hạn lâu nhất. */
	overdue: (T & { overdueAmount: number; maxOverdueDays: number | null })[];
}

/** Tuổi nợ của nhiều khách: cộng các nhóm rồi trừ giảm trừ thì bằng tổng còn phải thu. */
export function summarizeAgingPortfolio<
	T extends { customerId?: string; documents: readonly ReceivableDocument[] },
>(
	rows: readonly T[],
	ageFor: (
		customerId: string | undefined,
	) => (document: ReceivableDocument) => InvoiceAging,
): AgingPortfolio<T> {
	const amounts = emptyAgingAmounts();
	let reductionAmount = 0;
	let overdueAmount = 0;
	let noDueDateCount = 0;
	const overdue: AgingPortfolio<T>["overdue"] = [];
	for (const row of rows) {
		const summary = summarizeCustomerAging(
			row.documents,
			ageFor(row.customerId),
		);
		for (const bucket of agingBuckets)
			amounts[bucket] += summary.amounts[bucket];
		reductionAmount += summary.reductionAmount;
		overdueAmount += summary.overdueAmount;
		if (summary.amounts["no-due-date"] > 0) noDueDateCount += 1;
		if (summary.overdueAmount > 0)
			overdue.push({
				...row,
				overdueAmount: summary.overdueAmount,
				maxOverdueDays: summary.maxOverdueDays,
			});
	}
	overdue.sort(
		(a, b) =>
			b.overdueAmount - a.overdueAmount ||
			(b.maxOverdueDays ?? 0) - (a.maxOverdueDays ?? 0),
	);
	return {
		amounts,
		reductionAmount,
		overdueAmount,
		overdueCount: overdue.length,
		noDueDateCount,
		overdue,
	};
}

/** Tiền khách đã trả nhưng chưa phân bổ vào hóa đơn, theo mã khách trong danh mục. */
export function unallocatedByCustomer(ledger: ReceiptLedger) {
	const allocated = totalsByReceipt(ledger);
	const totals = new Map<string, number>();
	for (const receipt of ledger.receipts) {
		if (receipt.reversal) continue;
		const left = receipt.amount - (allocated.get(receipt.id) ?? 0);
		if (left > 0)
			totals.set(
				receipt.customerId,
				(totals.get(receipt.customerId) ?? 0) + left,
			);
	}
	return totals;
}
