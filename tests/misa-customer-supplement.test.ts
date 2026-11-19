import { expect, it } from "vitest";
import { seedCustomers } from "./fixtures/seed-customers";
import { createCustomerFromImport } from "../src/domain/customers/customer.service";
import { buildSalesReceivables } from "../src/domain/misa/misa.sales-receivables";
import { planMisaCustomerSupplement } from "../src/features/misa/misa.customer-supplement";
import {
	parseMisaSalesRows,
	salesColumns,
	salesHeaders,
} from "../src/features/misa/misa.sales-import";
import { planMisaSalesImport } from "../src/features/misa/misa.sales-merge";

const account = seedCustomers[0];
const preview = parseMisaSalesRows("MISA.xlsx", [
	[...salesColumns.map((key) => salesHeaders[key]), "Mã khách hàng", "Địa chỉ"],
	[
		"01/06/2026",
		"BH001",
		"000021",
		"Tên từ MISA",
		"Hàng A",
		"Hộp",
		1,
		20,
		20,
		22,
		account.misaCode,
		"Hà Nội",
	],
	[
		"02/06/2026",
		"BH002",
		"000022",
		"Tên cũ",
		"Hàng B",
		"Hộp",
		1,
		20,
		20,
		22,
		"KH-MOI",
		"Nghệ An",
	],
	[
		"03/06/2026",
		"BH003",
		"000023",
		"Tên hiện tại",
		"Hàng C",
		"Hộp",
		1,
		20,
		20,
		22,
		"KH-MOI",
		"Số 2, Hà Nội, Việt Nam",
	],
]);
const saved = {
	...preview.book,
	rows: preview.book.rows.map(({ source: _source, ...row }) => row),
};

it("giữ hồ sơ đã có, ghép mã theo từng dòng và dùng tên địa chỉ gần nhất cho mã mới", () => {
	const plan = planMisaCustomerSupplement(saved, preview, [account]);
	expect(plan.matched).toBe(1);
	expect(plan.linkedRows).toBe(3);
	expect(plan.book.importedAt).toBe(saved.importedAt);
	expect(plan.book.rows.map(({ source: _source, ...row }) => row)).toEqual(
		saved.rows,
	);
	expect(plan.additions).toEqual([
		{
			misaCode: "KH-MOI",
			name: "Tên hiện tại",
			address: "Số 2, Hà Nội, Việt Nam",
			province: "Hà Nội",
			group: "unknown",
		},
	]);
	const catalog = [account, ...plan.additions.map(createCustomerFromImport)];
	const groups = buildSalesReceivables(plan.book.rows, catalog, []);
	expect(groups).toHaveLength(2);
	expect(
		groups.find((group) => group.customerCode === account.misaCode)?.employeeId,
	).toBe(account.assignments[0].employeeId);
	expect(groups.find((group) => group.customerCode === "KH-MOI")).toMatchObject(
		{ employeeId: "", invoiceCount: 2, province: "Hà Nội" },
	);
	expect(planMisaCustomerSupplement(plan.book, preview, catalog)).toMatchObject(
		{ additions: [], matched: 2, linkedRows: 0 },
	);
});

it("dừng nếu dòng trong file gốc khác dữ liệu đã lưu", () => {
	expect(() =>
		planMisaCustomerSupplement(
			{ ...saved, rows: [{ ...saved.rows[0], paymentTotal: 1 }] },
			preview,
			[account],
		),
	).toThrow("chưa khớp với sổ bán hàng đang lưu");
});

it("bổ sung khách hàng từ một file tháng trong sổ tích lũy", () => {
	const month = {
		...preview,
		book: {
			...preview.book,
			fileName: "thang-sau.xlsx",
			rows: [{ ...preview.book.rows[2], rowNumber: 2 }],
		},
		customerAddresses: new Map([[2, "Số 2, Hà Nội, Việt Nam"]]),
	};
	const first = planMisaSalesImport(null, {
		...preview,
		book: { ...preview.book, rows: [preview.book.rows[0]] },
	});
	const combined = planMisaSalesImport(first.book, month);
	const plan = planMisaCustomerSupplement(combined.book, month, [account]);
	expect(plan.matchedRows).toBe(1);
	expect(plan.additions).toMatchObject([
		{ misaCode: "KH-MOI", address: "Số 2, Hà Nội, Việt Nam" },
	]);
	expect(plan.book.rows).toEqual(combined.book.rows);
});
