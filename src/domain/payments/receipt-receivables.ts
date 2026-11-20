import type {
	SalesCustomerGroup,
	SalesDocumentGroup,
} from "../misa/misa.sales-receivables";
import {
	activeInvoiceAllocations,
	getGroupReceiptInvoices,
	invoiceBalance,
	type ReceiptLedger,
} from "./receipt-ledger";

export interface ReceivableBalance {
	received: number;
	remaining: number;
}

interface ReceivableAllocation {
	id: string;
	receiptNumber: string;
	receiptDate: string;
	allocationDate: string;
	amount: number;
}

export type ReceivableDocument = SalesDocumentGroup & {
	balance: (ReceivableBalance & { allocations: ReceivableAllocation[] }) | null;
	allocationMismatch: boolean;
	/** Chứng từ giảm trừ (hàng bán trả lại, giảm giá...): số âm trừ thẳng vào công nợ của khách. */
	reduction?: true;
};

export type CustomerReceivables = Omit<SalesCustomerGroup, "documents"> & {
	documents: ReceivableDocument[];
	balance: ReceivableBalance | null;
	unverifiedCount: number;
};

const identity = (value: string) =>
	value.trim().normalize("NFC").toUpperCase();
// Chứng từ âm ghi giảm phải thu: Nợ 5212 (hàng bán trả lại), 5213 (giảm giá), 511 (điều chỉnh giảm
// doanh thu) hoặc âm trên 131. Sổ cũ không có cột TK Nợ vẫn được tính.
const reductionAccount = /^(?:131|511|521)/;

/**
 * Chứng từ giảm trừ của khách: tổng âm, một số chứng từ, mọi dòng cùng mã khách và không dương.
 * Công nợ của khách được trừ thẳng (không phân bổ vào từng hóa đơn) để khớp số dư 131 trên MISA.
 */
export function isSalesReduction(
	document: SalesDocumentGroup,
	customerCode: string,
) {
	const total = document.paymentTotal;
	const code = identity(customerCode);
	return (
		Boolean(code) &&
		typeof total === "number" &&
		Number.isSafeInteger(total) &&
		total < 0 &&
		document.documentNumbers.length === 1 &&
		Boolean(identity(document.documentNumbers[0] ?? "")) &&
		document.lines.length > 0 &&
		document.lines.every(
			(line) =>
				line.paymentTotal !== null &&
				line.paymentTotal <= 0 &&
				identity(line.source?.customerCode ?? "") === code &&
				(!line.source?.debitAccount ||
					reductionAccount.test(line.source.debitAccount)),
		)
	);
}

export function projectReceiptReceivables(
	groups: readonly SalesCustomerGroup[],
	sourceFile: string,
	ledger?: ReceiptLedger,
) {
	const allocations = ledger && activeInvoiceAllocations(ledger);
	const receipts = new Map(
		ledger?.receipts.map((receipt) => [receipt.id, receipt]),
	);
	const unmatched = new Set(allocations?.keys());
	const customers = groups.map<CustomerReceivables>((group) => {
		const candidates = ledger && getGroupReceiptInvoices(group, sourceFile);
		let balance: ReceivableBalance | null = null;
		let unverifiedCount = 0;
		const documents = group.documents.map<ReceivableDocument>((document) => {
			const candidate = candidates?.get(document.id);
			if (
				ledger &&
				!candidate &&
				group.customerId &&
				isSalesReduction(document, group.customerCode)
			) {
				const remaining = document.paymentTotal ?? 0;
				balance ??= { received: 0, remaining: 0 };
				balance.remaining += remaining;
				return {
					...document,
					balance: { received: 0, remaining, allocations: [] },
					allocationMismatch: false,
					reduction: true,
				};
			}
			const result =
				ledger && candidate && invoiceBalance(ledger, candidate, allocations);
			const allocationMismatch = Boolean(
				result && (result.changed || result.remaining < 0),
			);
			if (!candidate || !result || allocationMismatch) {
				if (ledger) unverifiedCount += 1;
				return { ...document, balance: null, allocationMismatch };
			}
			unmatched.delete(candidate.id);
			const { received, remaining } = result;
			balance ??= { received: 0, remaining: 0 };
			balance.received += received;
			balance.remaining += remaining;
			const entries = (allocations?.get(candidate.id) ?? [])
				.map(({ allocation, amount }) => {
					const receipt = receipts.get(allocation.receiptId);
					return {
						id: allocation.id,
						receiptNumber: receipt?.number ?? "",
						receiptDate: receipt?.date ?? "",
						allocationDate: allocation.date,
						amount,
					};
				})
				.reverse()
				.sort((left, right) =>
					right.allocationDate.localeCompare(left.allocationDate),
				);
			return {
				...document,
				balance: { received, remaining, allocations: entries },
				allocationMismatch,
			};
		});
		return { ...group, documents, balance, unverifiedCount };
	});
	return { customers, unmatchedCount: unmatched.size };
}
