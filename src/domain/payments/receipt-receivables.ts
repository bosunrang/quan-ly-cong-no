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
};

export type CustomerReceivables = Omit<SalesCustomerGroup, "documents"> & {
	documents: ReceivableDocument[];
	balance: ReceivableBalance | null;
	unverifiedCount: number;
};

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
