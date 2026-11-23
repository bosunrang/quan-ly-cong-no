import { describe, expect, it } from "vitest";
import {
	findNearReceiptMatches,
	findReceiptMatches,
} from "../src/domain/payments/receipt-matches";

const entries = (...amounts: number[]) =>
	amounts.map((remaining, id) => ({ remaining, id }));

describe("gợi ý nhóm chứng từ khớp khoản thu", () => {
	it("tìm cả chứng từ đơn, cặp và nhóm nhiều chứng từ có cùng tổng", () => {
		const result = findReceiptMatches(
			entries(1000, 900, 500, 300, 200, 1400),
			1400,
		);
		expect(result.matches.map((group) => group.map(({ id }) => id))).toEqual([
			[5],
			[1, 2],
			[1, 3, 4],
		]);
		expect(result.incomplete).toBe(false);
	});

	it("phân biệt chứng từ cùng số tiền và báo khi giới hạn kết quả", () => {
		const result = findReceiptMatches(
			entries(100, 100, 100, 100, 100, 100, 100),
			200,
		);
		expect(result.matches).toHaveLength(5);
		expect(
			new Set(
				result.matches.map((group) => group.map(({ id }) => id).join(",")),
			).size,
		).toBe(5);
		expect(result.incomplete).toBe(true);
	});

	it("không gợi ý làm tròn, bù thiếu hoặc phân bổ một phần", () => {
		expect(findReceiptMatches(entries(250, 400, 0, -1, 499.5), 500)).toEqual({
			matches: [],
			incomplete: false,
		});
	});

	it("giới hạn tìm kiếm với sổ lớn và vẫn nêu rõ kết quả chưa đầy đủ", () => {
		const result = findReceiptMatches(
			entries(...Array<number>(60).fill(2)),
			59,
		);
		expect(result).toEqual({ matches: [], incomplete: true });
	});
});

describe("gợi ý nhóm chứng từ gần khớp", () => {
	it("ưu tiên nhóm ba hóa đơn dư 2.000 đồng hơn hóa đơn đơn lẻ", () => {
		const invoices = entries(775_110_000, 29_568_000, 2_520_000, 100_000);
		const { nearMatches } = findNearReceiptMatches(
			invoices,
			807_200_000,
			(item) => item.remaining,
		);
		expect(nearMatches[0]).toEqual({
			difference: 2_000,
			lines: invoices
				.slice(0, 3)
				.map((item) => ({ item, amount: item.remaining })),
		});
	});

	it("chia phần thiếu trong giới hạn có thể phân bổ, bỏ nhóm không đủ số dư theo ngày", () => {
		const invoices = entries(74, 20, 9);
		const result = findNearReceiptMatches(invoices, 100, (item) =>
			item.id === 0 ? 73 : item.remaining,
		);
		expect(result.nearMatches[0]?.difference).toBe(-3);
		expect(result.nearMatches[0]?.lines.map(({ amount }) => amount)).toEqual([
			73, 20, 7,
		]);
		expect(findNearReceiptMatches(invoices, 100, () => 30).nearMatches).toEqual(
			[],
		);
	});
});
