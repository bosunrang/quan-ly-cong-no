import { describe, expect, it } from "vitest";
import type { Customer } from "../src/domain/customers/customer.model";
import {
	allocatedDocumentNumbers,
	allocateReceipt,
	customerLedgerLock,
	emptyReceiptLedger,
	getReceiptInvoices,
	recordReceipt,
	reverseAllocation,
} from "../src/domain/payments/receipt-ledger";
import {
	parseMisaSalesRows,
	parseVietnameseNumber,
	salesColumns,
	salesHeaders,
} from "../src/features/misa/misa.sales-import";
import { planMisaSalesImport } from "../src/features/misa/misa.sales-merge";

const headers = [
	...salesColumns.map((key) => salesHeaders[key]),
	"Mã khách hàng",
	"Mã hàng",
	"TK Nợ",
];
const row = (
	date: string,
	voucher: string,
	product: string,
	total: number | string,
	code = "KH001",
) => [
	date,
	voucher,
	`HD-${voucher}`,
	"Khách A",
	product,
	"Hộp",
	1,
	total,
	total,
	total,
	code,
	product,
	"131",
];
const parse = (fileName: string, rows: unknown[][]) =>
	parseMisaSalesRows(fileName, [headers, ...rows] as never);

describe("Nhập lại sổ bán hàng MISA không làm sai công nợ", () => {
	const november = parse("thang-11.xlsx", [
		row("01/11/2026", "BH0012", "Hàng A", 11_000_000),
		row("01/11/2026", "BH0012", "Hàng B", 1_000_000),
		row("05/11/2026", "BH0013", "Hàng A", 3_000_000),
		row("20/11/2026", "BH0014", "Hàng C", 2_000_000),
	]);
	const saved = planMisaSalesImport(null, november).book;

	it("phát hiện chứng từ bị hủy và dòng bị xóa trong MISA khi nhập lại cùng kỳ", () => {
		// MISA: xóa dòng Hàng B của BH0012 và hủy BH0013.
		const reexport = parse("thang-11-lan-2.xlsx", [
			row("01/11/2026", "BH0012", "Hàng A", 11_000_000),
			row("20/11/2026", "BH0014", "Hàng C", 2_000_000),
		]);
		const plan = planMisaSalesImport(saved, reexport);

		expect(plan.changedVouchers).toBe(1);
		expect(plan.issues.get(2)).toEqual({
			kind: "conflict",
			label: "Chứng từ khác sổ đang lưu",
		});
		expect(plan.missing).toMatchObject({
			from: "2026-11-01",
			to: "2026-11-20",
			vouchers: 1,
			removedVouchers: 0,
		});
		expect(plan.missing.rows.map((line) => line.documentNumber)).toEqual([
			"BH0013",
		]);
		// Mặc định không đổi sổ.
		expect(plan.hasChanges).toBe(false);

		const applied = planMisaSalesImport(saved, reexport, {
			applyChanges: true,
			removeMissing: true,
		});
		const total = applied.book.rows.reduce(
			(sum, line) => sum + (line.paymentTotal ?? 0),
			0,
		);
		expect(total).toBe(13_000_000);
		expect(applied.book.rows.map((line) => line.documentNumber).sort()).toEqual([
			"BH0012",
			"BH0014",
		]);
	});

	it("không coi chứng từ ngoài khoảng ngày của file là đã bị xóa", () => {
		const partial = parse("tuan-3.xlsx", [
			row("20/11/2026", "BH0014", "Hàng C", 2_000_000),
		]);
		const plan = planMisaSalesImport(saved, partial, { removeMissing: true });
		expect(plan.missing.vouchers).toBe(0);
		expect(plan.removedCount).toBe(0);
	});

	it("đưa chứng từ đã lưu được thêm dòng mới vào cần đối chiếu", () => {
		const edited = parse("thang-11-sua.xlsx", [
			row("20/11/2026", "BH0014", "Hàng C", 2_000_000),
			row("20/11/2026", "BH0014", "Hàng D", 500_000),
		]);
		const plan = planMisaSalesImport(saved, edited);
		expect(plan.addedCount).toBe(0);
		expect(plan.conflictCount).toBe(2);

		const applied = planMisaSalesImport(saved, edited, { applyChanges: true });
		expect(
			applied.book.rows
				.filter((line) => line.documentNumber === "BH0014")
				.map((line) => line.paymentTotal),
		).toEqual([2_000_000, 500_000]);
	});

	it("giữ cả chứng từ mới có dòng giống hệt nhau thay vì bỏ một dòng", () => {
		const twins = parse("hai-dong.xlsx", [
			row("21/11/2026", "BH0020", "Hàng A", 400_000),
			row("21/11/2026", "BH0020", "Hàng A", 400_000),
			row("21/11/2026", "BH0020", "Hàng B", 100_000),
		]);
		const held = planMisaSalesImport(saved, twins);
		expect(held.addedCount).toBe(0);
		expect(held.conflictCount).toBe(3);

		const accepted = planMisaSalesImport(saved, twins, { applyChanges: true });
		expect(accepted.addedCount).toBe(3);
		expect(
			accepted.book.rows
				.filter((line) => line.documentNumber === "BH0020")
				.reduce((sum, line) => sum + (line.paymentTotal ?? 0), 0),
		).toBe(900_000);
		// Nhập lại cùng file sau khi đã chấp nhận: không thêm hoặc báo lệch.
		expect(planMisaSalesImport(accepted.book, twins)).toMatchObject({
			addedCount: 0,
			conflictCount: 0,
		});
	});

	it("không thay hoặc gỡ chứng từ đang có phân bổ khoản thu", () => {
		const reexport = parse("thang-11-lan-2.xlsx", [
			row("01/11/2026", "BH0012", "Hàng A", 11_000_000),
			row("20/11/2026", "BH0014", "Hàng C", 2_000_000),
		]);
		const plan = planMisaSalesImport(saved, reexport, {
			applyChanges: true,
			removeMissing: true,
			allocatedDocuments: [" bh0012 ", "BH0013"],
		});
		expect(plan.lockedVouchers).toBe(1);
		expect(plan.missing.lockedVouchers).toBe(1);
		expect(plan.removedCount).toBe(0);
		expect(plan.hasChanges).toBe(false);
		expect(plan.issues.get(2)?.label).toBe("Chứng từ đã phân bổ khoản thu");
	});
});

describe("Đọc số tiền dạng chữ theo định dạng Việt Nam", () => {
	it.each([
		["15.000", 15_000],
		["1.200", 1_200],
		["12.345.678", 12_345_678],
		["1.234,5", 1_234.5],
		["1,5", 1.5],
		["1500000", 1_500_000],
		["1,200.50", 1_200.5],
		["2.5", 2.5],
		["-15.000", -15_000],
		["(15.000)", -15_000],
		["15.000 đ", 15_000],
	])("%s → %d", (text, expected) => {
		expect(parseVietnameseNumber(text)).toBe(expected);
	});

	it.each(["12.34.5", "1,2,3", "abc", "15.000,00,0"])("từ chối %s", (text) => {
		expect(parseVietnameseNumber(text)).toBeUndefined();
	});

	it("không ghi ô chữ \"15.000\" thành 15 đồng khi nhập sổ", () => {
		const book = parse("chu.xlsx", [
			row("01/11/2026", "BH0030", "Hàng A", "15.000"),
		]).book;
		expect(book.rows[0].paymentTotal).toBe(15_000);
		expect(() =>
			parse("loi.xlsx", [row("01/11/2026", "BH0031", "Hàng A", "15.00.0")]),
		).toThrow("không đúng định dạng số");
	});
});

describe("Khóa dữ liệu khách hàng đã có khoản thu", () => {
	const customer: Customer = {
		id: "customer-a",
		misaCode: "KH001",
		name: "Khách A",
		group: "unknown",
		taxCode: "",
		province: "",
		address: "",
		status: "active",
		assignments: [],
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
	const book = parseMisaSalesRows("ban-hang.xlsx", [
		headers,
		row("01/11/2026", "BH0012", "Hàng A", 1_000_000),
	] as never).book;

	it("báo khóa khi khách hàng có chứng từ thu và liệt kê chứng từ bán đang phân bổ", () => {
		expect(customerLedgerLock(emptyReceiptLedger, customer.id)).toBeUndefined();
		const ledger = recordReceipt(emptyReceiptLedger, customer, {
			number: "PT-01",
			date: "2026-11-02",
			amount: 400_000,
			reference: "",
		});
		expect(customerLedgerLock(ledger, customer.id)).toContain("1 chứng từ thu");
		expect(customerLedgerLock(ledger, "khac")).toBeUndefined();

		const [invoice] = getReceiptInvoices(book, ledger.receipts[0], [customer]);
		expect(invoice).toBeDefined();
		const allocated = allocateReceipt(
			ledger,
			ledger.receipts[0].id,
			"2026-11-02",
			[{ invoice, amount: 400_000 }],
		);
		expect([...allocatedDocumentNumbers(allocated)]).toEqual(["BH0012"]);
		const undone = reverseAllocation(
			allocated,
			allocated.allocations[0].id,
			"2026-11-03",
			"Nhầm",
		);
		expect(allocatedDocumentNumbers(undone).size).toBe(0);
	});
});
