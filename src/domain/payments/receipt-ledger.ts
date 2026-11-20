import { isIsoDate, todayLocal } from "../../shared/lib/date";
import { InputError } from "../../shared/lib/inputError";
import { randomId } from "../../shared/lib/randomId";
import type { Customer } from "../customers/customer.model";
import type { MisaSalesBook } from "../misa/misa.sales-book";
import {
	buildSalesReceivables,
	type SalesCustomerGroup,
	type SalesDocumentGroup,
} from "../misa/misa.sales-receivables";

export interface Receipt {
	id: string;
	number: string;
	date: string;
	customerId: string;
	customerName: string;
	customerCode: string;
	amount: number;
	reference: string;
	createdAt: string;
	reversal?: ReceiptReversal;
}

interface ReceiptReversal {
	date: string;
	reason: string;
	createdAt: string;
}

export interface ReceiptInvoice {
	id: string;
	date: string;
	customerId: string;
	invoiceNumber: string;
	invoiceSeries: string;
	documentNumber: string;
	amount: number;
	sourceFile: string;
}

export interface ReceiptInvoiceSource {
	invoice: ReceiptInvoice;
	document: SalesDocumentGroup;
}

interface AllocationLine {
	invoice: ReceiptInvoice;
	amount: number;
}

export interface ReceiptAllocation {
	id: string;
	receiptId: string;
	date: string;
	createdAt: string;
	lines: AllocationLine[];
	reversal?: ReceiptReversal;
}

export interface ReceiptLedger {
	revision: string;
	receipts: Receipt[];
	allocations: ReceiptAllocation[];
}

export const emptyReceiptLedger: ReceiptLedger = {
	revision: "",
	receipts: [],
	allocations: [],
};

export function receiptLedgerAt(
	ledger: ReceiptLedger,
	through: string,
): ReceiptLedger {
	const receipts = ledger.receipts.filter(
		({ date, reversal }) =>
			date <= through && (!reversal || reversal.date > through),
	);
	const receiptIds = new Set(receipts.map(({ id }) => id));
	return {
		...ledger,
		receipts,
		allocations: ledger.allocations
			.filter(
				({ receiptId, date, reversal }) =>
					receiptIds.has(receiptId) &&
					date <= through &&
					(!reversal || reversal.date > through),
			)
			.map((allocation) =>
				allocation.reversal
					? { ...allocation, reversal: undefined }
					: allocation,
			),
	};
}

export type ReceiptDraft = Pick<Receipt, "date" | "amount" | "reference"> & {
	number?: string;
	/** Mã do máy trạm tạo một lần cho mỗi lần nhập; gửi lại cùng mã không ghi thêm khoản thu. */
	id?: string;
};

const identity = (value: string) => value.trim().normalize("NFC").toUpperCase();
const positiveMoney = (value: unknown): value is number =>
	typeof value === "number" && Number.isSafeInteger(value) && value > 0;

function checkDate(date: string, label: string) {
	if (!isIsoDate(date) || date > todayLocal())
		throw new InputError(`${label} phải hợp lệ và không sau hôm nay.`);
}

export function nextReceiptNumber(receipts: readonly Receipt[], date: string) {
	const prefix = `PT-${date.slice(0, 4)}-`;
	let next = 1n;
	for (const receipt of receipts) {
		const number = identity(receipt.number);
		if (!number.startsWith(prefix)) continue;
		const suffix = number.slice(prefix.length);
		if (!/^\d+$/.test(suffix)) continue;
		const sequence = BigInt(suffix);
		if (sequence >= next) next = sequence + 1n;
	}
	return `${prefix}${String(next).padStart(4, "0")}`;
}

export function recordReceipt(
	ledger: ReceiptLedger,
	customer: Customer,
	draft: ReceiptDraft,
) {
	const { date, amount } = draft;
	checkDate(date, "Ngày hạch toán khoản thu");
	const number =
		draft.number?.trim() ?? nextReceiptNumber(ledger.receipts, date);
	if (!number) throw new InputError("Nhập số chứng từ thu.");
	if (!positiveMoney(amount))
		throw new InputError("Số tiền thu phải là số nguyên dương (đồng).");
	if (
		ledger.receipts.some(
			(receipt) =>
				receipt.date.slice(0, 4) === date.slice(0, 4) &&
				identity(receipt.number) === identity(number),
		)
	)
		throw new Error("Số chứng từ thu này đã được ghi trong năm hạch toán.");

	const receipt: Receipt = {
		id: draft.id ?? randomId(),
		number,
		date,
		customerId: customer.id,
		customerName: customer.name,
		customerCode: customer.misaCode,
		amount,
		reference: draft.reference.trim(),
		createdAt: new Date().toISOString(),
	};
	return { ...ledger, receipts: [...ledger.receipts, receipt] };
}

export function getReceiptInvoices(
	book: MisaSalesBook,
	receipt: Receipt,
	customers: readonly Customer[],
) {
	return getReceiptInvoiceSources(book, receipt, customers).map(
		({ invoice }) => invoice,
	);
}

export function getReceiptInvoiceSources(
	book: MisaSalesBook,
	receipt: Receipt,
	customers: readonly Customer[],
): ReceiptInvoiceSource[] {
	if (!identity(receipt.customerCode)) return [];
	return receiptInvoiceSourcesFromGroups(
		buildSalesReceivables(book.rows, customers, []),
		book.fileName,
		receipt,
	);
}

/**
 * Như getReceiptInvoiceSources nhưng dùng nhóm khách đã dựng sẵn từ sổ, để máy chủ không phải
 * dựng lại toàn bộ sổ mỗi lần tìm hóa đơn cho một khoản thu.
 */
export function receiptInvoiceSourcesFromGroups(
	groups: readonly SalesCustomerGroup[],
	sourceFile: string,
	receipt: Receipt,
): ReceiptInvoiceSource[] {
	const code = identity(receipt.customerCode);
	if (!code) return [];
	const group = groups.find(
		(item) =>
			item.customerId === receipt.customerId &&
			identity(item.customerCode) === code,
	);
	if (!group) return [];
	const invoices = getGroupReceiptInvoices(group, sourceFile);
	return group.documents.flatMap((document) => {
		const invoice = invoices.get(document.id);
		return invoice ? [{ invoice, document }] : [];
	});
}

/**
 * Khóa hóa đơn gồm mã khách hàng, số chứng từ và năm hạch toán, vì MISA có thể
 * đánh lại số chứng từ từ đầu mỗi năm.
 */
export function receiptInvoiceId(code: string, voucher: string, date: string) {
	return JSON.stringify([code, voucher, date.slice(0, 4)]);
}

function documentPostingDate(document: SalesDocumentGroup) {
	return document.lines.reduce((latest, line) => {
		const posting = line.source?.postingDate || line.date;
		return posting > latest ? posting : latest;
	}, document.lastDate);
}

export function getGroupReceiptInvoices(
	group: SalesCustomerGroup,
	sourceFile: string,
) {
	const invoices = new Map<string, ReceiptInvoice>();
	const code = identity(group.customerCode);
	const { customerId, documents } = group;
	if (!customerId || !code) return invoices;
	const voucherKey = (voucher: string, date: string) =>
		JSON.stringify([identity(voucher), date.slice(0, 4)]);
	const voucherCounts = new Map<string, number>();
	for (const document of documents) {
		const date = documentPostingDate(document);
		for (const voucher of document.documentNumbers) {
			const key = voucherKey(voucher, date);
			voucherCounts.set(key, (voucherCounts.get(key) ?? 0) + 1);
		}
	}
	for (const document of documents) {
		const documentNumber = document.documentNumbers[0] ?? "";
		const voucher = identity(documentNumber);
		const date = documentPostingDate(document);
		// Dòng âm (chiết khấu, giảm giá) trong cùng một chứng từ được cộng vào giá trị
		// hóa đơn. Chứng từ có tổng âm (hàng bán trả lại tách riêng) không phải hóa đơn để
		// phân bổ; projectReceiptReceivables trừ thẳng vào công nợ của khách (isSalesReduction).
		if (
			!voucher ||
			voucherCounts.get(voucherKey(documentNumber, date)) !== 1 ||
			document.documentNumbers.length !== 1 ||
			document.firstDate !== document.lastDate ||
			!positiveMoney(document.paymentTotal) ||
			document.lines.some(
				(line) =>
					identity(line.source?.customerCode ?? "") !== code ||
					line.paymentTotal === null ||
					(line.source?.debitAccount &&
						!/^131(?:\b|\d)/.test(line.source.debitAccount)),
			)
		)
			continue;
		if (!isIsoDate(date)) continue;
		invoices.set(document.id, {
			id: receiptInvoiceId(code, voucher, date),
			customerId,
			date,
			invoiceNumber: document.invoiceNumber,
			invoiceSeries: document.invoiceSeries,
			documentNumber,
			amount: document.paymentTotal,
			sourceFile: document.lines[0]?.origin?.fileName ?? sourceFile,
		});
	}
	return invoices;
}

/**
 * Chuyển khóa hóa đơn kiểu cũ [mã, số chứng từ] sang [mã, số chứng từ, năm].
 * Năm lấy từ ngày hạch toán đã lưu trong ảnh chụp hóa đơn nên khớp chính xác.
 */
export function migrateReceiptLedger(ledger: ReceiptLedger): ReceiptLedger {
	let changed = false;
	const allocations = ledger.allocations.map((allocation) => {
		let lineChanged = false;
		const lines = allocation.lines.map((line) => {
			let parts: unknown;
			try {
				parts = JSON.parse(line.invoice.id);
			} catch {
				return line;
			}
			if (
				!Array.isArray(parts) ||
				parts.length !== 2 ||
				!parts.every((part) => typeof part === "string") ||
				!isIsoDate(line.invoice.date)
			)
				return line;
			lineChanged = true;
			return {
				...line,
				invoice: {
					...line.invoice,
					id: receiptInvoiceId(parts[0], parts[1], line.invoice.date),
				},
			};
		});
		if (!lineChanged) return allocation;
		changed = true;
		return { ...allocation, lines };
	});
	return changed ? { ...ledger, allocations } : ledger;
}

export function sameInvoice(left: ReceiptInvoice, right: ReceiptInvoice) {
	return (
		left.id === right.id &&
		left.customerId === right.customerId &&
		left.amount === right.amount &&
		left.date === right.date &&
		identity(left.invoiceNumber) === identity(right.invoiceNumber) &&
		identity(left.invoiceSeries) === identity(right.invoiceSeries)
	);
}

export function receiptAllocated(ledger: ReceiptLedger, receiptId: string) {
	return ledger.allocations.reduce(
		(sum, entry) =>
			entry.receiptId === receiptId && !entry.reversal
				? sum + entry.lines.reduce((total, line) => total + line.amount, 0)
				: sum,
		0,
	);
}

export function totalsByReceipt(ledger: ReceiptLedger) {
	const totals = new Map<string, number>();
	for (const entry of ledger.allocations) {
		if (entry.reversal) continue;
		const total = entry.lines.reduce((sum, line) => sum + line.amount, 0);
		totals.set(entry.receiptId, (totals.get(entry.receiptId) ?? 0) + total);
	}
	return totals;
}

/** Số chứng từ bán hàng đang được phân bổ khoản thu còn hiệu lực. */
export function allocatedDocumentNumbers(ledger: ReceiptLedger) {
	const numbers = new Set<string>();
	for (const entry of ledger.allocations) {
		if (entry.reversal) continue;
		for (const line of entry.lines) numbers.add(line.invoice.documentNumber);
	}
	return numbers;
}

/** Lý do không được xóa hoặc đổi mã MISA của khách hàng, nếu có. */
export function customerLedgerLock(
	ledger: ReceiptLedger,
	customerId: string,
): string | undefined {
	const count = ledger.receipts.filter(
		(receipt) => receipt.customerId === customerId,
	).length;
	return count
		? `Khách hàng đã có ${count} chứng từ thu trong sổ đối soát (kể cả chứng từ đã đảo).`
		: undefined;
}

export function activeInvoiceAllocations(ledger: ReceiptLedger) {
	const index = new Map<
		string,
		(AllocationLine & { allocation: ReceiptAllocation })[]
	>();
	for (const entry of ledger.allocations) {
		if (entry.reversal) continue;
		for (const line of entry.lines) {
			const lines = index.get(line.invoice.id);
			const indexedLine = { ...line, allocation: entry };
			if (lines) lines.push(indexedLine);
			else index.set(line.invoice.id, [indexedLine]);
		}
	}
	return index;
}

export function invoiceBalance(
	ledger: ReceiptLedger,
	invoice: ReceiptInvoice,
	index: ReadonlyMap<
		string,
		readonly AllocationLine[]
	> = activeInvoiceAllocations(ledger),
) {
	const lines = index.get(invoice.id) ?? [];
	const received = lines.reduce((sum, line) => sum + line.amount, 0);
	const changed = lines.some((line) => !sameInvoice(line.invoice, invoice));
	return { received, remaining: invoice.amount - received, changed };
}

// Check the full dated interval so a backdated allocation cannot reuse money
// that was still allocated before a later reversal.
function peakAllocation(
	ledger: ReceiptLedger,
	from: string,
	match: (entry: ReceiptAllocation, line: AllocationLine) => boolean,
) {
	const changes = new Map<string, number>();
	for (const entry of ledger.allocations) {
		const amount = entry.lines.reduce(
			(total, line) => (match(entry, line) ? total + line.amount : total),
			0,
		);
		if (!amount) continue;
		changes.set(entry.date, (changes.get(entry.date) ?? 0) + amount);
		if (entry.reversal)
			changes.set(
				entry.reversal.date,
				(changes.get(entry.reversal.date) ?? 0) - amount,
			);
	}
	if (!changes.has(from)) changes.set(from, 0);
	let balance = 0;
	let peak = 0;
	for (const date of [...changes.keys()].sort()) {
		balance += changes.get(date) ?? 0;
		if (date >= from) peak = Math.max(peak, balance);
	}
	return peak;
}

export function receiptAvailableOn(
	ledger: ReceiptLedger,
	receipt: Receipt,
	date: string,
) {
	const used = peakAllocation(
		ledger,
		date,
		(entry) => entry.receiptId === receipt.id,
	);
	return receipt.amount - used;
}

export function invoiceAvailableOn(
	ledger: ReceiptLedger,
	invoice: ReceiptInvoice,
	date: string,
) {
	const used = peakAllocation(
		ledger,
		date,
		(_, line) => line.invoice.id === invoice.id,
	);
	return invoice.amount - used;
}

export function allocateReceipt(
	ledger: ReceiptLedger,
	receiptId: string,
	date: string,
	lines: AllocationLine[],
) {
	checkDate(date, "Ngày phân bổ");
	const receipt = ledger.receipts.find((item) => item.id === receiptId);
	if (receipt?.reversal) throw new Error("Khoản thu đã hủy.");
	if (!receipt) throw new Error("Khoản thu không còn trong sổ.");
	if (date < receipt.date)
		throw new InputError("Ngày phân bổ phải từ ngày hạch toán khoản thu.");
	if (
		!lines.length ||
		new Set(lines.map(({ invoice }) => invoice.id)).size !== lines.length
	)
		throw new InputError(
			"Chọn ít nhất một chứng từ. Mỗi chứng từ chỉ xuất hiện một lần.",
		);
	let total = 0;
	const index = activeInvoiceAllocations(ledger);
	for (const { invoice, amount } of lines) {
		if (
			invoice.customerId !== receipt.customerId ||
			date < invoice.date ||
			!positiveMoney(amount)
		)
			throw new InputError(
				"Kiểm tra lại khách hàng, ngày chứng từ và số tiền từng dòng.",
			);
		const { changed } = invoiceBalance(ledger, invoice, index);
		if (changed)
			throw new Error(
				`Chứng từ ${invoice.documentNumber} đã đổi trong sổ MISA. Hoàn tác phân bổ liên quan sau khi đối chiếu.`,
			);
		if (amount > invoiceAvailableOn(ledger, invoice, date))
			throw new Error(
				`Số phân bổ vượt số còn lại của chứng từ ${invoice.documentNumber} theo ngày đã chọn.`,
			);
		total += amount;
	}
	if (
		!positiveMoney(total) ||
		total > receiptAvailableOn(ledger, receipt, date)
	)
		throw new Error("Tổng phân bổ vượt số dư khoản thu theo ngày đã chọn.");
	return {
		...ledger,
		allocations: [
			...ledger.allocations,
			{
				id: randomId(),
				receiptId,
				date,
				lines,
				createdAt: new Date().toISOString(),
			},
		],
	};
}

export function reverseAllocation(
	ledger: ReceiptLedger,
	allocationId: string,
	date: string,
	reason: string,
) {
	checkDate(date, "Ngày hoàn tác");
	const entry = ledger.allocations.find((item) => item.id === allocationId);
	if (!entry || entry.reversal)
		throw new Error("Đợt phân bổ không còn hiệu lực.");
	if (date < entry.date || !reason.trim())
		throw new InputError(
			"Nhập lý do và chọn ngày hoàn tác từ ngày phân bổ trở đi.",
		);
	return {
		...ledger,
		allocations: ledger.allocations.map((item) =>
			item.id === allocationId
				? {
						...item,
						reversal: {
							date,
							reason: reason.trim(),
							createdAt: new Date().toISOString(),
						},
					}
				: item,
		),
	};
}

export function reverseReceipt(
	ledger: ReceiptLedger,
	receiptId: string,
	date: string,
	reason: string,
) {
	checkDate(date, "Ngày hủy khoản thu");
	const receipt = ledger.receipts.find((item) => item.id === receiptId);
	if (!receipt || receipt.reversal)
		throw new Error("Khoản thu không còn hiệu lực.");
	const history = ledger.allocations.filter(
		(entry) => entry.receiptId === receiptId,
	);
	if (
		!reason.trim() ||
		date < receipt.date ||
		history.some((entry) => date < (entry.reversal?.date ?? entry.date))
	)
		throw new InputError(
			"Nhập lý do và chọn ngày hủy từ ngày hạch toán và ngày xử lý phân bổ gần nhất trở đi.",
		);
	const reversal = {
		date,
		reason: reason.trim(),
		createdAt: new Date().toISOString(),
	};
	return {
		...ledger,
		receipts: ledger.receipts.map((item) =>
			item.id === receiptId ? { ...item, reversal } : item,
		),
		allocations: ledger.allocations.map((entry) =>
			entry.receiptId === receiptId && !entry.reversal
				? { ...entry, reversal }
				: entry,
		),
	};
}
