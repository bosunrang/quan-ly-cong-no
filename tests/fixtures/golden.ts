// Tính bộ "số tiền chuẩn" từ một bản sao lưu: các con số mà Dashboard, trang Công nợ phải thu
// và Biên bản đối chiếu đang hiển thị. Mọi thay đổi kiến trúc phải giữ nguyên kết quả này.
import type { Customer } from "../../src/domain/customers/customer.model";
import type { SalesEmployee } from "../../src/domain/employees/employee.model";
import type { MisaSalesBook } from "../../src/domain/misa/misa.sales-book";
import { buildSalesReceivables } from "../../src/domain/misa/misa.sales-receivables";
import type { ReceiptLedger } from "../../src/domain/payments/receipt-ledger";
import { projectReceiptReceivables } from "../../src/domain/payments/receipt-receivables";
import { buildDashboardSummary } from "../../src/features/dashboard/dashboard.summary";
import {
	buildReceivableStatement,
	statementBalanceInWords,
} from "../../src/features/reports/report.model";

export interface GoldenData {
	customers: Customer[];
	employees: SalesEmployee[];
	salesBook: MisaSalesBook;
	ledger: ReceiptLedger;
}

export const goldenCloseDates = [
	"2025-06-30",
	"2025-12-31",
	"2026-03-31",
	"2026-06-30",
	"2026-11-30",
	"2026-12-31",
];

export const goldenStatementPeriods = [
	["2025-01-01", "2025-12-31"],
	["2026-01-01", "2026-06-30"],
	["2026-01-01", "2026-11-30"],
] as const;

export function computeGoldenNumbers(data: GoldenData) {
	const { customers, employees, salesBook: book, ledger } = data;

	const dashboard = goldenCloseDates.map((through) => {
		const from = `${through.slice(0, 4)}-01-01`;
		const summary = buildDashboardSummary(
			book,
			ledger,
			customers,
			employees,
			from,
			through,
		);
		return {
			from,
			through,
			remaining: summary.remaining,
			periodReceived: summary.periodReceived,
			unallocated: summary.unallocated,
			unverifiedCount: summary.unverifiedCount,
			receivables: summary.receivables.map((row) => ({
				customerCode: row.customerCode,
				remaining: row.remaining,
				documents: row.documents.map((document) => ({
					id: document.id,
					remaining: document.balance?.remaining ?? null,
				})),
			})),
			unallocatedReceipts: summary.unallocatedReceipts.map((receipt) => ({
				number: receipt.number,
				unallocated: receipt.unallocated,
			})),
		};
	});

	const projected = projectReceiptReceivables(
		buildSalesReceivables(book.rows, customers, employees),
		book.fileName,
		ledger,
	);
	const receivables = {
		unmatchedCount: projected.unmatchedCount,
		customers: projected.customers.map((customer) => ({
			customerCode: customer.customerCode,
			name: customer.name,
			catalogMatch: customer.catalogMatch,
			employeeName: customer.employeeName,
			paymentTotal: customer.paymentTotal,
			balance: customer.balance,
			unverifiedCount: customer.unverifiedCount,
			documents: customer.documents.map((document) => ({
				id: document.id,
				documentNumbers: document.documentNumbers,
				invoiceNumber: document.invoiceNumber,
				paymentTotal: document.paymentTotal,
				received: document.balance?.received ?? null,
				remaining: document.balance?.remaining ?? null,
				allocations:
					document.balance?.allocations.map((allocation) => ({
						receiptNumber: allocation.receiptNumber,
						allocationDate: allocation.allocationDate,
						amount: allocation.amount,
					})) ?? null,
				allocationMismatch: document.allocationMismatch,
			})),
		})),
	};

	const statements = customers.flatMap((customer) =>
		goldenStatementPeriods.map(([from, through]) => {
			const statement = buildReceivableStatement(
				book,
				ledger,
				customers,
				customer,
				from,
				through,
			);
			return {
				customerCode: customer.misaCode,
				from,
				through,
				opening: statement.opening,
				increase: statement.increase,
				payment: statement.payment,
				closing: statement.closing,
				unallocated: statement.unallocated,
				net: statement.net,
				omitted: statement.omitted,
				hasUnmatchedAllocations: statement.hasUnmatchedAllocations,
				words: statementBalanceInWords(statement),
				rows: statement.rows.map((row) => ({
					date: row.date,
					invoiceNumber: row.invoiceNumber,
					increase: row.increase,
					payment: row.payment,
					note: row.note,
				})),
			};
		}),
	);

	return { dashboard, receivables, statements };
}
