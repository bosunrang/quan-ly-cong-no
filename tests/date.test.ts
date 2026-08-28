import { describe, expect, it } from "vitest";
import {
	formatDateOnly,
	formatTimestamp,
	isIsoDate,
	isIsoTimestamp,
	localDateToIso,
	localDateToVietnamese,
	normalizeDateOnly,
	previousDay,
	todayLocal,
} from "../src/shared/lib/date";

describe("date-only utilities", () => {
	it("chuẩn hóa ngày Việt Nam và giữ định dạng ISO nội bộ", () => {
		expect(normalizeDateOnly("1/4/2026")).toBe("2026-04-01");
		expect(normalizeDateOnly("2026-04-01")).toBe("2026-04-01");
		expect(formatDateOnly("2026-04-01")).toBe("01/04/2026");
		expect(isIsoDate("2026-04-01")).toBe(true);
		expect(isIsoDate("01/04/2026")).toBe(false);
	});

	it("từ chối ngày không tồn tại hoặc sai cấu trúc", () => {
		expect(normalizeDateOnly("31/02/2026")).toBeUndefined();
		expect(normalizeDateOnly("2026-13-01")).toBeUndefined();
		expect(formatDateOnly("không hợp lệ")).toBe("—");
		expect(() => previousDay("không hợp lệ")).toThrow(RangeError);
	});

	it("tính ngày liền trước chính xác qua tháng, năm và năm nhuận", () => {
		expect(previousDay("2026-03-01")).toBe("2026-02-28");
		expect(previousDay("2024-03-01")).toBe("2024-02-29");
		expect(previousDay("2026-01-01")).toBe("2025-12-31");
	});

	it("lấy ngày theo lịch cục bộ thay vì cắt chuỗi UTC", () => {
		const localMidnight = new Date(2026, 2, 1, 0, 30);
		expect(localDateToIso(localMidnight)).toBe("2026-03-01");
		expect(localDateToVietnamese(localMidnight)).toBe("01/03/2026");
		expect(todayLocal(localMidnight)).toBe("2026-03-01");
	});

	it("hiển thị timestamp theo dd/mm/yyyy và luôn thêm số 0 đầu", () => {
		const localTimestamp = new Date(2026, 3, 5, 8, 30).toISOString();
		expect(formatTimestamp(localTimestamp)).toBe("05/04/2026");
		expect(formatTimestamp("invalid")).toBe("—");
	});

	it("phân biệt timestamp ISO với chuỗi ngày thuần", () => {
		expect(isIsoTimestamp("2026-01-01T08:00:00.000Z")).toBe(true);
		expect(isIsoTimestamp("2026-01-01")).toBe(false);
		expect(isIsoTimestamp("invalid")).toBe(false);
	});
});
