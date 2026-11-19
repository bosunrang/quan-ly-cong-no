import { describe, expect, it } from "vitest";
import {
	parseMisaSalesRows,
	salesColumns,
	salesHeaders,
} from "../src/features/misa/misa.sales-import";
import { planMisaSalesImport } from "../src/features/misa/misa.sales-merge";

describe("Sổ chi tiết bán hàng MISA", () => {
	it("giữ đúng các cột, số hóa đơn có số 0 đầu và dòng thiếu hóa đơn", () => {
		const headers = salesColumns.map((key) => salesHeaders[key]);
		const first = [
			"01/06/2026",
			"BH001",
			"00002060",
			"Khách A",
			"Hàng A",
			"Hộp",
			2.5,
			10.25,
			25.625,
			28,
		];
		const second = [
			"02/06/2026",
			"BH001",
			null,
			"Khách A",
			"Hàng B",
			"Hộp",
			1,
			20,
			20,
			-20,
		];
		const { book } = parseMisaSalesRows("ban-hang.xlsx", [
			["SỔ CHI TIẾT BÁN HÀNG"],
			["Thông tin kỳ"],
			["Ngày hạch toán", ...headers],
			[null, ...first],
			[null, ...second],
			["Tổng cộng", null, null, null, null, null, null, 3.5],
		]);
		expect(book.rows).toHaveLength(2);
		expect(book.rows[0]).toMatchObject({
			date: "2026-06-01",
			invoiceNumber: "00002060",
			quantity: 2.5,
			unitPrice: 10.25,
			salesAmount: 25.625,
			paymentTotal: 28,
		});
		expect(book.rows[1]).toMatchObject({
			date: "2026-06-02",
			invoiceNumber: "",
			paymentTotal: -20,
		});
	});

	it("chỉ đánh dấu lần lặp trùng cả dòng nguồn, kể cả khi các dòng có cùng hóa đơn", () => {
		const headers = salesColumns.map((key) => salesHeaders[key]);
		const first = [
			"01/06/2026",
			"BH001",
			"00002060",
			"Khách A",
			"Hàng A",
			"Hộp",
			2,
			10,
			20,
			22,
		];
		const { book, duplicateOf } = parseMisaSalesRows("ban-hang.xlsx", [
			[...headers, "Mã hàng"],
			[...first, "SKU-1"],
			[...first, "SKU-2"],
			[...first, "SKU-1"],
			[...first.slice(0, 6), 4, 10, 40, 44, "SKU-1"],
			[...first, "SKU-1"],
		]);
		expect(book.rows).toHaveLength(5);
		expect([...duplicateOf]).toEqual([
			[4, 2],
			[6, 2],
		]);
	});

	it("yêu cầu đủ mười cột của sổ bán hàng", () => {
		expect(() =>
			parseMisaSalesRows("cong-no.xlsx", [
				["Ngày chứng từ", "Số chứng từ", "Phát sinh Nợ", "Phát sinh Có"],
			]),
		).toThrow("Không tìm thấy đủ 10 cột");
	});

	it("lưu mã khách hàng và định danh hóa đơn nếu sổ có các cột nguồn", () => {
		const { book } = parseMisaSalesRows("ban-hang.xlsx", [
			[
				...salesColumns.map((key) => salesHeaders[key]),
				"Mã khách hàng",
				"Ký hiệu hóa đơn",
				"Ngày hóa đơn",
			],
			[
				"01/01/2026",
				"BH001",
				"000021",
				"Khách A",
				"Hàng A",
				"Hộp",
				1,
				20,
				20,
				22,
				"KH001",
				"C25TAA",
				"31/12/2025",
			],
		]);
		expect(salesColumns).toHaveLength(10);
		expect(book.rows[0].source).toEqual({
			customerCode: "KH001",
			invoiceSeries: "C25TAA",
			invoiceDate: "2025-12-31",
		});
	});

	it("nhập nối sổ cũ, lọc trùng theo nội dung, giữ nguyên cả chứng từ thay đổi hoặc có dòng giống hệt nhau cho tới khi người dùng chọn cập nhật", () => {
		const headers = [
			...salesColumns.map((key) => salesHeaders[key]),
			"Mã khách hàng",
			"Mã hàng",
			"Số lô",
		];
		const line = [
			"01/06/2026",
			"BH001",
			"000021",
			"Khách A",
			"Hàng A",
			"Hộp",
			1,
			20,
			20,
			22,
			"KH001",
			"SKU1",
			"L1",
		];
		const otherLot = [...line.slice(0, -1), "L2"];
		const oldLine = ["01/06/2026", "BH002", ...line.slice(2)];
		const saved = parseMisaSalesRows("thang-sau.xlsx", [
			headers,
			line,
			oldLine,
		]).book;
		const changed = [...oldLine.slice(0, 9), 44, ...oldLine.slice(10)];
		const newVoucher = ["01/07/2026", "BH003", ...line.slice(2)];
		const current = parseMisaSalesRows("thang-bay.xlsx", [
			headers,
			otherLot,
			changed,
			newVoucher,
			line,
			newVoucher,
		]);
		const plan = planMisaSalesImport(saved, current);

		// BH001 có thêm dòng khác lô, BH002 sửa tiền, BH003 có hai dòng giống hệt nhau:
		// không chứng từ nào được ghi một phần.
		expect(plan.addedCount).toBe(0);
		expect(plan.hasChanges).toBe(false);
		expect(plan.changedVouchers).toBe(3);
		expect(plan.conflictCount).toBe(5);
		expect([...plan.issues.entries()]).toEqual(
			expect.arrayContaining([
				[2, { kind: "conflict", label: "Chứng từ khác sổ đang lưu" }],
				[3, { kind: "conflict", label: "Chứng từ khác sổ đang lưu" }],
				[4, { kind: "conflict", label: "Chứng từ có dòng giống hệt nhau" }],
				[5, { kind: "conflict", label: "Chứng từ khác sổ đang lưu" }],
				[6, { kind: "conflict", label: "Giống hệt dòng 4 trong file" }],
			]),
		);
		expect(plan.book.rows).toEqual(saved.rows.map((row) => ({
			...row,
			origin: { fileName: "thang-sau.xlsx", rowNumber: row.rowNumber },
		})));

		const updated = planMisaSalesImport(saved, current, { applyChanges: true });
		expect(updated.updatedVouchers).toBe(3);
		expect(updated.removedCount).toBe(2);
		expect(updated.book.rows.map((row) => row.origin?.rowNumber)).toEqual([
			2, 5, 3, 4, 6,
		]);
		expect(updated.book.rows.map((row) => row.paymentTotal)).toEqual([
			22, 22, 44, 22, 22,
		]);
		expect(updated.book.rows.map((row) => row.rowNumber)).toEqual([
			4, 5, 6, 7, 8,
		]);
		expect(planMisaSalesImport(updated.book, current)).toMatchObject({
			addedCount: 0,
			conflictCount: 0,
			hasChanges: false,
		});
	});

	it("ghép từng lần xuất với sổ cũ thiếu mã hàng, kể cả khi thứ tự Excel đổi", () => {
		const headers = salesColumns.map((key) => salesHeaders[key]);
		const row = [
			"01/06/2026",
			"BH001",
			"001",
			"Khách A",
			"Hàng A",
			"Hộp",
			1,
			20,
			20,
			22,
		];
		const saved = parseMisaSalesRows("cu.xlsx", [
			headers,
			row,
			["01/06/2026", "BH002", ...row.slice(2)],
		]).book;
		const current = parseMisaSalesRows("moi.xlsx", [
			[...headers, "Mã hàng", "Mã khách hàng"],
			["01/06/2026", "BH002", ...row.slice(2), "SKU1", "KH001"],
			[...row, "SKU1", "KH001"],
		]);
		expect(planMisaSalesImport(saved, current)).toMatchObject({
			addedCount: 0,
			conflictCount: 0,
		});
		expect(planMisaSalesImport(saved, current).issues.size).toBe(2);
	});
});
