import { describe, expect, it } from "vitest";
import { findReceiptMatches } from "../src/domain/payments/receipt-matches";

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
