import type { Customer } from "../../src/domain/customers/customer.model";
import type { SalesEmployee } from "../../src/domain/employees/employee.model";
import type { MisaSalesBook } from "../../src/domain/misa/misa.sales-book";
import { buildSalesReceivables } from "../../src/domain/misa/misa.sales-receivables";
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
		const documents =
			group.customers.find(({ id }) => id === parts[1])?.documents ?? [];
		if (parts[3]) return documents.find(({ id }) => id === parts[3]);
		return paging(documents.map(({ lines: _lines, ...item }) => item));
	}
	const employee = url.searchParams.get("employee");
	const province = url.searchParams.get("province");
	const filtered = group.customers.filter(
		(item) =>
			(!employee || (item.employeeId || "?") === employee) &&
			(!province || (item.province || "?") === province),
	);
	return {
		hasBook: book.rows.length > 0,
		fileName: book.fileName,
		unmatchedAllocationCount: group.unmatchedCount,
		missingTotalCount: filtered.reduce(
			(sum, item) => sum + item.missingTotalCount,
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
			filtered.map(({ documents, ...item }) => ({
				...item,
				documentCount: documents.length,
			})),
		),
	};
}
