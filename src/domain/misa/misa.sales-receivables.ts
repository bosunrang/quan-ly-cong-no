import type { Customer } from "../customers/customer.model";
import { currentAssignment } from "../customers/customer.selectors";
import type { SalesEmployee } from "../employees/employee.model";
import type { MisaSalesLine } from "./misa.sales-book";
import {
	type OpeningBalances,
	openingBalanceDocumentId,
	openingBalanceLabel,
	salesRowInOpeningBalance,
} from "./opening-balances";

export interface SalesDocumentGroup {
	id: string;
	invoiceNumber: string;
	invoiceSeries: string;
	invoiceDate: string;
	firstDate: string;
	lastDate: string;
	documentNumbers: string[];
	lines: MisaSalesLine[];
	lineCount: number;
	paymentTotal: number | null;
	/** Số dư công nợ tại ngày chốt chuyển sổ, nhập từ báo cáo MISA (không có dòng hàng). */
	openingBalance?: { fileName: string };
}

export interface SalesCustomerGroup {
	id: string;
	customerId: string | undefined;
	name: string;
	customerCode: string;
	catalogMatch: boolean;
	province: string;
	employeeId: string;
	employeeName: string;
	documents: SalesDocumentGroup[];
	invoiceCount: number;
	paymentTotal: number | null;
	missingTotalCount: number;
}

type DocumentAccumulator = Omit<
	SalesDocumentGroup,
	"documentNumbers" | "lineCount"
> & {
	documentNumbers: Set<string>;
};

type CustomerAccumulator = Omit<
	SalesCustomerGroup,
	"documents" | "invoiceCount" | "paymentTotal"
> & { documents: Map<string, DocumentAccumulator> };

function identity(value: string) {
	return value
		.normalize("NFC")
		.trim()
		.replace(/\s+/g, " ")
		.toLocaleUpperCase("vi-VN");
}

function indexCustomers(
	customers: readonly Customer[],
	key: (customer: Customer) => string,
) {
	const index = new Map<string, Customer | null>();
	for (const customer of customers) {
		const value = identity(key(customer));
		if (value) index.set(value, index.has(value) ? null : customer);
	}
	return index;
}

export function salesRowsThrough(rows: readonly MisaSalesLine[], date: string) {
	return rows.filter(
		(row) =>
			row.date <= date &&
			(!row.source?.postingDate || row.source.postingDate <= date),
	);
}

export interface SalesReceivablesOptions {
	/** Số dư đầu kỳ: dòng bán hàng hạch toán đến ngày chốt đã nằm trong số dư nên bị bỏ qua. */
	opening?: OpeningBalances | null;
	/** Ngày chốt đang xem: số dư đầu kỳ chỉ có hiệu lực từ ngày chốt chuyển sổ. */
	through?: string;
	/** Tạo nhóm cho mọi khách trong danh mục, kể cả khách chưa có chứng từ. */
	includeEmptyCustomers?: boolean;
}

export function buildSalesReceivables(
	rows: readonly MisaSalesLine[],
	customers: readonly Customer[],
	employees: readonly SalesEmployee[],
	{
		opening,
		through,
		includeEmptyCustomers = false,
	}: SalesReceivablesOptions = {},
): SalesCustomerGroup[] {
	const byCode = indexCustomers(customers, (customer) => customer.misaCode);
	const byName = indexCustomers(customers, (customer) => customer.name);
	const employeeNames = new Map(employees.map(({ id, name }) => [id, name]));
	const groups = new Map<string, CustomerAccumulator>();
	function groupFor(
		id: string,
		customer: Customer | null | undefined,
		name: string,
		code: string,
	) {
		let group = groups.get(id);
		if (!group) {
			const assignment = customer ? currentAssignment(customer) : undefined;
			group = {
				id,
				customerId: customer?.id,
				name: customer?.name ?? (name || "Chưa rõ khách hàng"),
				customerCode: customer?.misaCode ?? code,
				catalogMatch: Boolean(customer),
				province: customer?.province.trim() ?? "",
				employeeId: assignment?.employeeId ?? "",
				employeeName: assignment
					? (employeeNames.get(assignment.employeeId) ??
						assignment.employeeName)
					: "",
				documents: new Map(),
				missingTotalCount: 0,
			};
			groups.set(id, group);
		}
		return group;
	}

	if (includeEmptyCustomers)
		for (const customer of customers)
			groupFor(
				`catalog:${customer.id}`,
				customer,
				customer.name,
				customer.misaCode,
			);

	if (opening && (!through || opening.date <= through)) {
		const catalog = new Map(
			customers.map((customer) => [customer.id, customer]),
		);
		for (const entry of opening.entries) {
			const customer = catalog.get(entry.customerId);
			if (!customer || !entry.amount) continue;
			const group = groupFor(
				`catalog:${customer.id}`,
				customer,
				customer.name,
				customer.misaCode,
			);
			group.documents.set(openingBalanceDocumentId, {
				id: openingBalanceDocumentId,
				invoiceNumber: "",
				invoiceSeries: "",
				invoiceDate: "",
				firstDate: opening.date,
				lastDate: opening.date,
				documentNumbers: new Set([openingBalanceLabel]),
				lines: [],
				paymentTotal: entry.amount,
				openingBalance: { fileName: opening.fileName },
			});
		}
	}

	for (const row of rows) {
		if (salesRowInOpeningBalance(row, opening)) continue;
		const customerCode = row.source?.customerCode ?? "";
		const code = identity(customerCode);
		const name = identity(row.customerName);
		// Only use a unique name for older sales rows that have no MISA customer code.
		const customer = code ? byCode.get(code) : byName.get(name);
		const id = customer
			? `catalog:${customer.id}`
			: code
				? `code:${code}`
				: `name:${name}`;
		const group = groupFor(id, customer, row.customerName, customerCode);

		const number = identity(row.invoiceNumber);
		const series = identity(row.source?.invoiceSeries ?? "");
		const invoiceDate = row.source?.invoiceDate ?? "";
		const year = (invoiceDate || row.date).slice(0, 4);
		const documentNumber = identity(row.documentNumber);
		// Without a series, distinct vouchers can refer to separate invoices with the same number.
		const key = JSON.stringify(
			number
				? ["invoice", year, number, series, series ? "" : documentNumber]
				: ["document", row.date, documentNumber],
		);
		let document = group.documents.get(key);
		if (!document) {
			document = {
				id: key,
				invoiceNumber: row.invoiceNumber,
				invoiceSeries: row.source?.invoiceSeries ?? "",
				invoiceDate,
				firstDate: row.date,
				lastDate: row.date,
				documentNumbers: new Set(),
				lines: [],
				paymentTotal: null,
			};
			group.documents.set(key, document);
		}
		document.firstDate =
			row.date < document.firstDate ? row.date : document.firstDate;
		document.lastDate =
			row.date > document.lastDate ? row.date : document.lastDate;
		document.documentNumbers.add(row.documentNumber);
		document.lines.push(row);
		if (row.paymentTotal === null) group.missingTotalCount += 1;
		else
			document.paymentTotal = (document.paymentTotal ?? 0) + row.paymentTotal;
	}

	return [...groups.values()]
		.map((group) => {
			const documents = Array.from(group.documents.values(), (document) => ({
				...document,
				documentNumbers: [...document.documentNumbers],
				lineCount: document.lines.length,
			})).sort((left, right) => right.lastDate.localeCompare(left.lastDate));
			let invoiceCount = 0;
			let paymentTotal: number | null = null;
			for (const document of documents) {
				if (document.invoiceNumber) invoiceCount += 1;
				if (document.paymentTotal !== null)
					paymentTotal = (paymentTotal ?? 0) + document.paymentTotal;
			}
			return { ...group, documents, invoiceCount, paymentTotal };
		})
		.sort(
			(left, right) =>
				(right.paymentTotal ?? 0) - (left.paymentTotal ?? 0) ||
				left.name.localeCompare(right.name, "vi"),
		);
}
