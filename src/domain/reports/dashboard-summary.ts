import type { Customer } from "../customers/customer.model";
import type { SalesEmployee } from "../employees/employee.model";
import type { MisaSalesBook } from "../misa/misa.sales-book";
import {
	buildSalesReceivables,
	type SalesCustomerGroup,
	salesRowsThrough,
} from "../misa/misa.sales-receivables";
import {
	type ReceiptLedger,
	receiptLedgerAt,
	totalsByReceipt,
} from "../payments/receipt-ledger";
import { projectReceiptReceivables } from "../payments/receipt-receivables";

export function buildDashboardSummary(
	book: MisaSalesBook | null,
	ledger: ReceiptLedger,
	customers: readonly Customer[],
	employees: readonly SalesEmployee[],
	from: string,
	through: string,
	/** Nhóm khách đã dựng từ các dòng bán hàng tính đến ngày chốt (máy chủ giữ sẵn để dùng lại). */
	groupsThrough?: readonly SalesCustomerGroup[],
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
	const periodReceipts = receiptRows.filter((receipt) => receipt.date >= from);
	const unallocatedReceipts = receiptRows.filter(
		(receipt) => receipt.unallocated > 0,
	);

	const salesRows = salesRowsThrough(book?.rows ?? [], through);
	const groups =
		groupsThrough ??
		buildSalesReceivables(salesRows, customers, employees, { through });
	const projected = projectReceiptReceivables(
		groups,
		book?.fileName ?? "",
		ledgerAtClose,
	);
	const hasVerifiedDocuments = projected.customers.some(
		(customer) => customer.balance !== null,
	);
	const receivables = projected.customers
		.map((customer) => ({
			id: customer.id,
			name: customer.name,
			customerCode: customer.customerCode,
			employeeName: customer.employeeName,
			province: customer.province,
			documents: customer.documents.filter(
				({ balance }) => (balance?.remaining ?? 0) > 0,
			),
			remaining: customer.balance?.remaining ?? 0,
		}))
		.filter(({ remaining }) => remaining > 0)
		.sort(
			(a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name, "vi"),
		);

	return {
		receivables,
		periodReceipts,
		unallocatedReceipts,
		remaining: receivables.reduce((sum, row) => sum + row.remaining, 0),
		periodReceived: periodReceipts.reduce((sum, row) => sum + row.amount, 0),
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
