import type { Customer } from "../../src/domain/customers/customer.model";
import type { SalesEmployee } from "../../src/domain/employees/employee.model";
import type { MisaSalesBook } from "../../src/domain/misa/misa.sales-book";
import { buildSalesReceivables } from "../../src/domain/misa/misa.sales-receivables";
import {
	agingBuckets,
	type AgingFilter,
	emptyAgingAmounts,
	invoiceAging,
	matchesCustomerAging,
	summarizeCustomerAging,
} from "../../src/domain/payments/receivable-aging";
import type { ReceiptLedger } from "../../src/domain/payments/receipt-ledger";
import { projectReceiptReceivables } from "../../src/domain/payments/receipt-receivables";

export function receivablesView(
	resource: string,
	book: MisaSalesBook,
	customers: Customer[],
	ledger: ReceiptLedger,
	staff: SalesEmployee[] = [],
) {
	const url = new URL(resource, "http://localhost/");
	const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
	const group = projectReceiptReceivables(
		buildSalesReceivables(book.rows, customers, staff),
		book.fileName,
		ledger,
	);
	const page = Number(url.searchParams.get("page") ?? 1);
	const limit = 20;
	const paging = <T>(items: T[]) => ({
		items: items.slice((page - 1) * limit, page * limit),
		total: items.length,
		page,
		limit,
	});
	if (parts.length > 1) {
		const customer = group.customers.find(({ id }) => id === parts[1]);
		const documents = customer?.documents ?? [];
		if (parts[3]) return documents.find(({ id }) => id === parts[3]);
		return {
			...paging(documents.map(({ lines: _lines, ...item }) => item)),
			invoiceCount: customer?.invoiceCount,
			missingInvoiceNumberCount: documents.filter(
				({ invoiceNumber, openingBalance }) =>
					!invoiceNumber && !openingBalance,
			).length,
		};
	}
	const employee = url.searchParams.get("employee");
	const province = url.searchParams.get("province");
	const filtered = group.customers.filter(
		(item) =>
			(!employee || (item.employeeId || "?") === employee) &&
			(!province || (item.province || "?") === province),
	);
	const agingAsOf = "2026-06-01";
	const agingFilter = (url.searchParams.get("aging") || "") as AgingFilter;
	const terms = new Map(
		customers.map(({ id, paymentTermDays }) => [id, paymentTermDays]),
	);
	const summaries = filtered.map((item) => ({
		item,
		aging: summarizeCustomerAging(item.documents, (document) =>
			invoiceAging(
				document,
				item.customerId ? terms.get(item.customerId) : undefined,
				undefined,
				agingAsOf,
			),
		),
	}));
	const agingUnitCounts = {
		...emptyAgingAmounts(),
		all: summaries.length,
		overdue: 0,
	};
	for (const filter of ["overdue", ...agingBuckets] as const) {
		agingUnitCounts[filter] = summaries.filter(({ aging }) =>
			matchesCustomerAging(aging, filter),
		).length;
	}
	const agingAmounts = emptyAgingAmounts();
	for (const { aging } of summaries)
		for (const bucket of agingBuckets)
			agingAmounts[bucket] += aging.amounts[bucket];
	const visible = summaries.filter(({ aging }) =>
		matchesCustomerAging(aging, agingFilter),
	);
	return {
		hasBook: book.rows.length > 0,
		fileName: book.fileName,
		unmatchedAllocationCount: group.unmatchedCount,
		missingTotalCount: filtered.reduce(
			(sum, item) => sum + item.missingTotalCount,
			0,
		),
		agingAsOf,
		agingUnitCounts,
		agingAmounts,
		agingReductionAmount: summaries.reduce(
			(sum, { aging }) => sum + aging.reductionAmount,
			0,
		),
		agingUnallocatedAmount: 0,
		agingOverdueAmount: summaries.reduce(
			(sum, { aging }) => sum + aging.overdueAmount,
			0,
		),
		filterOptions: {
			provinces: [
				...new Set(
					group.customers.map((item) => item.province).filter(Boolean),
				),
			],
			employees: [
				...new Map(
					group.customers
						.filter((item) => item.employeeId)
						.map((item) => [item.employeeId, item.employeeName]),
				),
			],
			unmatchedCount: group.customers.filter((item) => !item.catalogMatch)
				.length,
		},
		rows: paging(
			visible.map(({ item: { documents, ...item } }) => ({
				...item,
				documentCount: documents.length,
				earliestDueDate: null,
				maxOverdueDays: null,
				overdueAmount: 0,
				reductionAmount: 0,
				unallocatedAmount: 0,
			})),
		),
	};
}
