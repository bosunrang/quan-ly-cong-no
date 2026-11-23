import type { Customer } from "../customers/customer.model";
import type { SalesEmployee } from "../employees/employee.model";
import type { MisaSalesBook } from "../misa/misa.sales-book";
import {
	buildSalesReceivables,
	type SalesCustomerGroup,
	salesRowsThrough,
} from "../misa/misa.sales-receivables";
import type { OpeningBalances } from "../misa/opening-balances";
import {
	type ReceiptLedger,
	receiptLedgerAt,
	totalsByReceipt,
} from "../payments/receipt-ledger";
import {
	type CustomerReceivables,
	projectReceiptReceivables,
} from "../payments/receipt-receivables";
import { receiptTrend } from "./receipt-trend";

export type CustomerInvoiceTotals = Pick<
	CustomerReceivables,
	"balance" | "unverifiedCount"
>;

export function buildDashboardSummary(
	book: MisaSalesBook | null,
	ledger: ReceiptLedger,
	customers: readonly Customer[],
	employees: readonly SalesEmployee[],
	from: string,
	through: string,
	/** Nhóm khách đã dựng từ các dòng bán hàng tính đến ngày chốt (máy chủ giữ sẵn để dùng lại). */
	groupsThrough?: readonly SalesCustomerGroup[],
	opening?: OpeningBalances | null,
) {
	const ledgerAtClose = receiptLedgerAt(ledger, through);

	const allocations = totalsByReceipt(ledgerAtClose);
	const receiptRows = ledgerAtClose.receipts
		.map((receipt) => ({
			...receipt,
			unallocated: receipt.amount - (allocations.get(receipt.id) ?? 0),
		}))
		.sort(
			(a, b) =>
				b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
		);
	// Khoản thu của kỳ trước bị hủy trong kỳ làm giảm tiền thu của kỳ này (dòng âm theo ngày hủy).
	// Khoản thu ghi và hủy trong cùng kỳ đã bị loại khỏi sổ tại ngày chốt nên không tính hai lần.
	const periodReversals = ledger.receipts
		.filter(
			({ date, reversal }) =>
				date < from &&
				reversal &&
				reversal.date >= from &&
				reversal.date <= through,
		)
		.map((receipt) => ({
			...receipt,
			id: `${receipt.id}:reversal`,
			amount: -receipt.amount,
			unallocated: 0,
			reversedOn: receipt.reversal?.date,
		}));
	const effectiveDate = (row: { date: string; reversedOn?: string }) =>
		row.reversedOn ?? row.date;
	const periodReceipts = [
		...receiptRows
			.filter((receipt) => receipt.date >= from)
			.map((receipt) => ({
				...receipt,
				reversedOn: undefined as string | undefined,
			})),
		...periodReversals,
	].sort(
		(a, b) =>
			effectiveDate(b).localeCompare(effectiveDate(a)) ||
			b.createdAt.localeCompare(a.createdAt),
	);
	const unallocatedReceipts = receiptRows.filter(
		(receipt) => receipt.unallocated > 0,
	);

	const salesRows = salesRowsThrough(book?.rows ?? [], through);
	const groups =
		groupsThrough ??
		buildSalesReceivables(salesRows, customers, employees, {
			opening,
			through,
		});
	const projected = projectReceiptReceivables(
		groups,
		book?.fileName ?? "",
		ledgerAtClose,
	);
	const hasVerifiedDocuments = projected.customers.some(
		(customer) => customer.balance !== null,
	);
	const customerTotals = new Map<string, CustomerInvoiceTotals>(
		projected.customers.map(({ id, balance, unverifiedCount }) => [
			id,
			{ balance, unverifiedCount },
		]),
	);
	const customerRows = projected.customers
		.map((customer) => ({
			id: customer.id,
			customerId: customer.customerId,
			name: customer.name,
			customerCode: customer.customerCode,
			employeeName: customer.employeeName,
			province: customer.province,
			// Hóa đơn còn nợ và chứng từ giảm trừ đã trừ vào công nợ của khách.
			documents: customer.documents.filter(
				({ balance, reduction }) => reduction || (balance?.remaining ?? 0) > 0,
			),
			remaining: customer.balance?.remaining ?? 0,
		}))
		.sort(
			(a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name, "vi"),
		);
	const receivables = customerRows.filter(({ remaining }) => remaining > 0);
	// Khách dư có (hàng trả lại, giảm giá lớn hơn số còn nợ): không vào danh sách còn nợ nhưng
	// vẫn trừ vào tổng còn phải thu, để tổng khớp màn Công nợ phải thu.
	const credits = customerRows.filter(({ remaining }) => remaining < 0);
	const creditAmount = -credits.reduce((sum, row) => sum + row.remaining, 0);

	return {
		customerTotals,
		receivables,
		credits,
		periodReceipts,
		receiptTrend: receiptTrend(periodReceipts, from, through),
		unallocatedReceipts,
		remaining:
			receivables.reduce((sum, row) => sum + row.remaining, 0) - creditAmount,
		creditAmount,
		creditCount: credits.length,
		periodReceived: periodReceipts.reduce((sum, row) => sum + row.amount, 0),
		periodReversalCount: periodReversals.length,
		unallocated: unallocatedReceipts.reduce(
			(sum, row) => sum + row.unallocated,
			0,
		),
		unverifiedCount: projected.customers.reduce(
			(sum, row) => sum + row.unverifiedCount,
			0,
		),
		unmatchedCount: projected.unmatchedCount,
		salesRowCount: salesRows.length,
		hasVerifiedDocuments,
	};
}
