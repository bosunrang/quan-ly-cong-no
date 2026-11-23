import { formatDateOnly, isIsoDate, todayLocal } from "../../shared/lib/date";
import { InputError } from "../../shared/lib/inputError";
import type { Customer, CustomerGroup } from "../customers/customer.model";
import type { ReceiptLedger } from "../payments/receipt-ledger";
import type { MisaSalesLine } from "./misa.sales-book";

/**
 * Số dư công nợ 131 của từng khách tại cuối ngày chốt chuyển sổ (`date`), lấy từ báo cáo MISA.
 * Công nợ trong app = số dư này + phát sinh sau ngày chốt. Dòng sổ bán hàng hạch toán đến ngày
 * chốt đã nằm trong số dư nên không được tính thêm.
 */
export interface OpeningBalances {
	date: string;
	fileName: string;
	importedAt: string;
	entries: OpeningBalanceEntry[];
}

export interface OpeningBalanceEntry {
	customerId: string;
	customerCode: string;
	customerName: string;
	/** Dư Nợ trừ dư Có (đồng). Âm là khách hàng dư có. */
	amount: number;
	/** Dòng trong báo cáo MISA; 0 với số dư nhập tay. */
	rowNumber: number;
	/** Nhân viên điền tay ở màn Công nợ phải thu (không có là lấy từ báo cáo MISA). */
	source?: "manual";
}

/** Một dòng đọc từ báo cáo Tổng hợp công nợ phải thu (TK 131) của MISA. */
export interface OpeningBalanceRow {
	rowNumber: number;
	customerCode: string;
	customerName: string;
	debit: number;
	credit: number;
}

export interface OpeningBalanceSource {
	fileName: string;
	/** Ngày chốt số dư: ngày liền trước "Từ ngày" của báo cáo. */
	date: string;
	rows: OpeningBalanceRow[];
}

export interface OpeningCustomerDraft {
	id: string;
	misaCode: string;
	name: string;
	address: string;
	province: string;
	group: CustomerGroup;
}

/** Nhãn chứng từ số dư đầu kỳ trong công nợ, phân bổ và biên bản. */
export const openingBalanceLabel = "Số dư đầu kỳ";
export const openingBalanceDocumentId = "opening-balance";
export const maxOpeningBalanceRows = 20_000;

const codeKey = (value: string) =>
	value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleUpperCase("vi-VN");

/** Ngày hạch toán của dòng bán hàng (MISA tính số dư 131 theo ngày hạch toán). */
export function salesRowPostingDate(row: MisaSalesLine) {
	return row.source?.postingDate || row.date;
}

/** Dòng sổ bán hàng hạch toán đến ngày chốt đã nằm trong số dư đầu kỳ. */
export function salesRowInOpeningBalance(
	row: MisaSalesLine,
	opening: Pick<OpeningBalances, "date"> | null | undefined,
) {
	return Boolean(opening && salesRowPostingDate(row) <= opening.date);
}

/** Kiểm tra dữ liệu máy trạm gửi lên trước khi lập kế hoạch nhập. */
export function isOpeningBalanceSource(
	value: unknown,
): value is OpeningBalanceSource {
	if (!value || typeof value !== "object") return false;
	const source = value as Partial<OpeningBalanceSource>;
	return (
		typeof source.fileName === "string" &&
		source.fileName.length > 0 &&
		source.fileName.length <= 300 &&
		isIsoDate(source.date) &&
		Array.isArray(source.rows) &&
		source.rows.length > 0 &&
		source.rows.length <= maxOpeningBalanceRows &&
		source.rows.every(
			(row) =>
				!!row &&
				typeof row === "object" &&
				Number.isSafeInteger(row.rowNumber) &&
				typeof row.customerCode === "string" &&
				row.customerCode.trim().length > 0 &&
				row.customerCode.length <= 100 &&
				typeof row.customerName === "string" &&
				row.customerName.length <= 500 &&
				Number.isSafeInteger(row.debit) &&
				Number.isSafeInteger(row.credit),
		)
	);
}

/** Phân bổ còn hiệu lực vào số dư đầu kỳ, theo khách hàng. */
export function openingAllocationsByCustomer(ledger: ReceiptLedger) {
	const totals = new Map<string, { amount: number; date: string }>();
	for (const allocation of ledger.allocations) {
		if (allocation.reversal) continue;
		for (const { invoice } of allocation.lines)
			if (isOpeningInvoice(invoice))
				totals.set(invoice.customerId, {
					amount: invoice.amount,
					date: invoice.date,
				});
	}
	return totals;
}

export function isOpeningInvoice(invoice: {
	documentNumber: string;
	invoiceNumber: string;
}) {
	return (
		invoice.documentNumber === openingBalanceLabel && !invoice.invoiceNumber
	);
}

export interface OpeningBalancePlan {
	balances: Omit<OpeningBalances, "importedAt">;
	additions: OpeningCustomerDraft[];
	/** Lý do không được ghi; rỗng thì có thể xác nhận. */
	issues: string[];
	counts: {
		rowCount: number;
		customerCount: number;
		zeroCount: number;
		debitTotal: number;
		creditTotal: number;
		debitCount: number;
		creditCount: number;
		/** Dòng sổ bán hàng hạch toán đến ngày chốt: đã nằm trong số dư nên không tính thêm. */
		excludedSalesRows: number;
		changedCustomers: number;
		removedCustomers: number;
		/** Số dư nhân viên điền tay sẽ bị thay bằng số trong báo cáo. */
		manualCustomers: number;
	};
}

/**
 * Lập kế hoạch ghi số dư đầu kỳ từ báo cáo MISA: ghép khách theo mã, thêm khách chưa có vào danh
 * mục và chặn những trường hợp làm số liệu bị tính hai lần hoặc phá phân bổ đã có.
 */
export function planOpeningBalanceImport(
	source: OpeningBalanceSource,
	{
		customers,
		current,
		ledger,
		salesRows,
		newId,
	}: {
		customers: readonly Customer[];
		current: OpeningBalances | null;
		ledger: ReceiptLedger;
		salesRows: readonly MisaSalesLine[];
		newId: () => string;
	},
): OpeningBalancePlan {
	const { date } = source;
	if (!isIsoDate(date) || date >= todayLocal())
		throw new InputError("Ngày chốt số dư phải hợp lệ và trước hôm nay.");

	const rowsByCode = new Map<string, OpeningBalanceRow>();
	for (const row of source.rows) {
		const key = codeKey(row.customerCode);
		const previous = rowsByCode.get(key);
		if (previous)
			throw new InputError(
				`Mã khách hàng ${row.customerCode.trim()} lặp ở dòng ${previous.rowNumber} và ${row.rowNumber}. Hãy xuất lại báo cáo theo từng khách hàng.`,
			);
		rowsByCode.set(key, row);
	}

	const catalog = new Map<string, Customer | null>();
	for (const customer of customers) {
		const key = codeKey(customer.misaCode);
		if (key) catalog.set(key, catalog.has(key) ? null : customer);
	}

	const entries: OpeningBalanceEntry[] = [];
	const additions: OpeningCustomerDraft[] = [];
	let zeroCount = 0;
	for (const [key, row] of rowsByCode) {
		const amount = row.debit - row.credit;
		if (!Number.isSafeInteger(amount))
			throw new InputError(`Dòng ${row.rowNumber}: số dư quá lớn.`);
		if (amount === 0) {
			zeroCount += 1;
			continue;
		}
		const customer = catalog.get(key);
		if (customer === null)
			throw new InputError(
				`Mã MISA ${row.customerCode.trim()} đang trùng trong danh mục khách hàng. Cần sửa danh mục trước khi nhập số dư.`,
			);
		if (customer) {
			entries.push({
				customerId: customer.id,
				customerCode: customer.misaCode,
				customerName: customer.name,
				amount,
				rowNumber: row.rowNumber,
			});
			continue;
		}
		const name = row.customerName.trim() || row.customerCode.trim();
		const draft: OpeningCustomerDraft = {
			id: newId(),
			misaCode: row.customerCode.trim(),
			name,
			address: "",
			province: "",
			group: "unknown",
		};
		additions.push(draft);
		entries.push({
			customerId: draft.id,
			customerCode: draft.misaCode,
			customerName: name,
			amount,
			rowNumber: row.rowNumber,
		});
	}
	entries.sort((left, right) => left.rowNumber - right.rowNumber);
	if (!entries.length)
		throw new InputError("Báo cáo không có khách hàng nào còn số dư đầu kỳ.");

	const issues = openingCutoffIssues(date, ledger);

	const nextByCustomer = new Map(
		entries.map((entry) => [entry.customerId, entry]),
	);
	const allocated = openingAllocationsByCustomer(ledger);
	const locked = [...allocated].filter(
		([customerId, invoice]) =>
			nextByCustomer.get(customerId)?.amount !== invoice.amount ||
			invoice.date !== date,
	);
	if (locked.length) {
		const codes = locked
			.slice(0, 5)
			.map(
				([customerId]) =>
					customers.find(({ id }) => id === customerId)?.misaCode ?? customerId,
			);
		issues.push(
			`${locked.length} khách hàng đã phân bổ khoản thu vào số dư đầu kỳ cũ nhưng số dư hoặc ngày chốt mới khác (${codes.join(", ")}${locked.length > 5 ? "…" : ""}). Hãy hoàn tác các phân bổ đó trước.`,
		);
	}

	const previous = new Map(
		(current?.entries ?? []).map((entry) => [entry.customerId, entry.amount]),
	);
	let changedCustomers = 0;
	for (const entry of entries)
		if (current && previous.get(entry.customerId) !== entry.amount)
			changedCustomers += 1;
	const removedCustomers = [...previous.keys()].filter(
		(id) => !nextByCustomer.has(id),
	).length;

	let debitTotal = 0;
	let creditTotal = 0;
	let debitCount = 0;
	let creditCount = 0;
	for (const { amount } of entries) {
		if (amount > 0) {
			debitTotal += amount;
			debitCount += 1;
		} else {
			creditTotal -= amount;
			creditCount += 1;
		}
	}
	return {
		balances: { date, fileName: source.fileName, entries },
		additions,
		issues,
		counts: {
			rowCount: source.rows.length,
			customerCount: entries.length,
			zeroCount,
			debitTotal,
			creditTotal,
			debitCount,
			creditCount,
			excludedSalesRows: salesRows.filter((row) =>
				salesRowInOpeningBalance(row, { date }),
			).length,
			changedCustomers,
			removedCustomers,
			manualCustomers: (current?.entries ?? []).filter(
				({ source }) => source === "manual",
			).length,
		},
	};
}

/** Lý do không được xóa số dư đầu kỳ, nếu có. */
export function openingBalanceRemovalLock(ledger: ReceiptLedger) {
	const count = openingAllocationsByCustomer(ledger).size;
	return count
		? `${count} khách hàng đã phân bổ khoản thu vào số dư đầu kỳ. Hãy hoàn tác các phân bổ đó trước.`
		: undefined;
}

/**
 * Những gì làm số liệu bị tính hai lần nếu chốt số dư tại `date`: khoản thu đến ngày chốt và
 * phân bổ vào chứng từ bán hàng hạch toán đến ngày chốt (đã nằm trong số dư).
 */
export function openingCutoffIssues(date: string, ledger: ReceiptLedger) {
	const issues: string[] = [];
	const earlyReceipts = ledger.receipts.filter(
		(receipt) => !receipt.reversal && receipt.date <= date,
	);
	if (earlyReceipts.length)
		issues.push(
			`Có ${earlyReceipts.length} khoản thu ghi ngày đến ${formatDateOnly(date)}. Số dư đầu kỳ đã trừ các khoản thu này: hãy hủy chúng ở Đối soát khoản thu hoặc chọn ngày chốt sớm hơn.`,
		);
	let earlyInvoices = 0;
	for (const allocation of ledger.allocations)
		if (!allocation.reversal)
			for (const { invoice } of allocation.lines)
				if (!isOpeningInvoice(invoice) && invoice.date <= date)
					earlyInvoices += 1;
	if (earlyInvoices)
		issues.push(
			`Có ${earlyInvoices} dòng phân bổ vào chứng từ bán hàng hạch toán đến ${formatDateOnly(date)}. Các chứng từ này đã nằm trong số dư đầu kỳ: hãy hoàn tác phân bổ trước.`,
		);
	return issues;
}

/** Đặt ngày chốt khi chưa có số dư nào (để nhân viên điền tay theo cùng một ngày). */
export function setOpeningBalanceDate(
	current: OpeningBalances | null,
	date: string,
	ledger: ReceiptLedger,
): Omit<OpeningBalances, "importedAt"> {
	if (!isIsoDate(date) || date >= todayLocal())
		throw new InputError("Ngày chốt số dư phải hợp lệ và trước hôm nay.");
	if (current?.entries.length)
		throw new Error(
			"Đã có số dư đầu kỳ theo ngày chốt hiện tại. Muốn đổi ngày, hãy xóa số dư hoặc nhập lại báo cáo MISA.",
		);
	const [issue] = openingCutoffIssues(date, ledger);
	if (issue) throw new Error(issue);
	return { date, fileName: current?.fileName ?? "", entries: [] };
}

/**
 * Điền tay số dư của một khách theo ngày chốt chung. `amount` 0 là bỏ số dư của khách.
 * Không sửa được khi đã phân bổ khoản thu vào số dư đầu kỳ của khách.
 */
export function setOpeningBalanceEntry(
	current: OpeningBalances,
	customer: Pick<Customer, "id" | "misaCode" | "name">,
	amount: number,
	ledger: ReceiptLedger,
): Omit<OpeningBalances, "importedAt"> {
	if (!Number.isSafeInteger(amount))
		throw new InputError("Số dư phải là số nguyên (đồng).");
	if (openingAllocationsByCustomer(ledger).has(customer.id))
		throw new Error(
			"Khách hàng đã có khoản thu phân bổ vào số dư đầu kỳ. Hãy hoàn tác các phân bổ đó trước khi sửa.",
		);
	const entries = current.entries.filter(
		({ customerId }) => customerId !== customer.id,
	);
	if (amount)
		entries.push({
			customerId: customer.id,
			customerCode: customer.misaCode,
			customerName: customer.name,
			amount,
			rowNumber: 0,
			source: "manual",
		});
	return { date: current.date, fileName: current.fileName, entries };
}
