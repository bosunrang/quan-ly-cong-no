import { describe, expect, it } from "vitest";
import {
	type InvoiceAging,
	matchesCustomerAging,
	summarizeCustomerAging,
	unallocatedByCustomer,
} from "../src/domain/payments/receivable-aging";
import type { ReceiptLedger } from "../src/domain/payments/receipt-ledger";
import type { ReceivableDocument } from "../src/domain/payments/receipt-receivables";

function document(
	id: string,
	remaining: number,
	extra: Partial<ReceivableDocument> = {},
) {
	return {
		id,
		balance: { received: 0, remaining, allocations: [] },
		...extra,
	} as unknown as ReceivableDocument;
}

const ages: Record<string, InvoiceAging> = {
	old: {
		dueDate: "2026-01-31",
		overrideDueDate: null,
		daysOverdue: 120,
		bucket: "90+",
	},
	late: {
		dueDate: "2026-05-01",
		overrideDueDate: null,
		daysOverdue: 31,
		bucket: "31-60",
	},
	fresh: {
		dueDate: "2026-07-01",
		overrideDueDate: null,
		daysOverdue: 0,
		bucket: "current",
	},
	open: {
		dueDate: null,
		overrideDueDate: null,
		daysOverdue: null,
		bucket: "no-due-date",
	},
};
const ageOf = (item: ReceivableDocument) =>
	ages[item.id] ?? {
		dueDate: null,
		overrideDueDate: null,
		daysOverdue: null,
		bucket: null,
	};

describe("tuổi nợ theo khách", () => {
	it("trừ giảm trừ chung để tổng các nhóm khớp số còn phải thu và giảm nợ quá hạn", () => {
		const documents = [
			document("old", 4_000_000),
			document("late", 3_000_000),
			document("fresh", 3_000_000),
			document("open", 1_000_000),
			document("return", -2_000_000, { reduction: true }),
		];
		const summary = summarizeCustomerAging(documents, ageOf);
		const remaining = documents.reduce(
			(sum, item) => sum + (item.balance?.remaining ?? 0),
			0,
		);
		const buckets = Object.values(summary.amounts).reduce((a, b) => a + b, 0);
		expect(summary.reductionAmount).toBe(2_000_000);
		expect(buckets - summary.reductionAmount).toBe(remaining);
		expect(summary.amounts["90+"]).toBe(4_000_000);
		// Quá hạn 7 triệu, hàng trả lại 2 triệu trừ vào phần nợ cũ nhất.
		expect(summary.overdueAmount).toBe(5_000_000);
		expect(summary.maxOverdueDays).toBe(120);
		expect(summary.earliestDueDate).toBe("2026-01-31");
		expect(matchesCustomerAging(summary, "overdue")).toBe(true);
	});

	it("không còn nợ quá hạn khi giảm trừ đủ bù phần quá hạn", () => {
		const summary = summarizeCustomerAging(
			[
				document("late", 1_500_000),
				document("fresh", 3_000_000),
				document("return", -2_000_000, { reduction: true }),
			],
			ageOf,
		);
		expect(summary.overdueAmount).toBe(0);
		expect(matchesCustomerAging(summary, "overdue")).toBe(false);
		// Nhóm cụ thể vẫn xét theo từng hóa đơn.
		expect(matchesCustomerAging(summary, "31-60")).toBe(true);
		expect(matchesCustomerAging(summary, "90+")).toBe(false);
		expect(matchesCustomerAging(summary, "")).toBe(true);
	});

	it("bỏ qua hóa đơn đã trả hết và chứng từ chưa đối chiếu", () => {
		const summary = summarizeCustomerAging(
			[document("old", 0), { ...document("late", 0), balance: null }],
			ageOf,
		);
		expect(Object.values(summary.amounts).every((amount) => amount === 0)).toBe(
			true,
		);
		expect(summary.overdueAmount).toBe(0);
		expect(summary.maxOverdueDays).toBeNull();
	});
});

describe("tiền thu chưa phân bổ theo khách", () => {
	it("cộng phần chưa phân bổ của khoản thu còn hiệu lực", () => {
		const ledger = {
			revision: "r",
			receipts: [
				{ id: "r1", customerId: "a", amount: 1_000 },
				{ id: "r2", customerId: "a", amount: 500 },
				{
					id: "r3",
					customerId: "b",
					amount: 700,
					reversal: { date: "2026-06-01" },
				},
				{ id: "r4", customerId: "b", amount: 300 },
			],
			allocations: [
				{ receiptId: "r1", lines: [{ amount: 600 }] },
				{
					receiptId: "r1",
					lines: [{ amount: 400 }],
					reversal: { date: "2026-06-02" },
				},
				{ receiptId: "r4", lines: [{ amount: 200 }, { amount: 100 }] },
			],
		} as unknown as ReceiptLedger;
		const totals = unallocatedByCustomer(ledger);
		expect(totals.get("a")).toBe(400 + 500);
		expect(totals.has("b")).toBe(false);
	});
});
