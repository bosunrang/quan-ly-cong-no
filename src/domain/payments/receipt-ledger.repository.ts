import { api } from "../../shared/api/client";
import type { Customer } from "../customers/customer.model";
import type { Receipt, ReceiptDraft, ReceiptInvoice } from "./receipt-ledger";

/**
 * Khoản thu đã ghi theo mã yêu cầu, nếu có. Dùng sau khi lưu lỗi: yêu cầu có thể đã tới máy
 * chủ dù phản hồi bị mất. Lỗi khi đọc (vẫn mất kết nối, không tìm thấy) trả về undefined.
 */
export async function findReceipt(id: string) {
	try {
		return (
			await api<{ receipt: Receipt }>(
				"GET",
				`receipts/${encodeURIComponent(id)}`,
			)
		).receipt;
	} catch {
		return undefined;
	}
}

export function saveReceipt(customer: Customer, draft: ReceiptDraft) {
	return api<string>("POST", "receipts", {
		...draft,
		customerId: customer.id,
		customerCode: customer.misaCode,
	});
}

export function saveAllocation(
	id: string,
	date: string,
	lines: { invoice: ReceiptInvoice; amount: number }[],
	revision: string,
	bookStamp: string | null,
	advance: boolean,
) {
	return api<string>("POST", `receipts/${encodeURIComponent(id)}/allocations`, {
		date,
		lines,
		revision,
		bookStamp,
		advance,
	});
}

export function saveReversal(
	kind: "receipts" | "allocations",
	id: string,
	date: string,
	reason: string,
	revision: string,
) {
	return api<string>("POST", `${kind}/${encodeURIComponent(id)}/reversal`, {
		date,
		reason,
		revision,
	});
}
