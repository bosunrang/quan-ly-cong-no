import { describe, expect, it } from "vitest";
import type { Customer } from "../src/domain/customers/customer.model";
import type { MisaSalesLine } from "../src/domain/misa/misa.sales-book";
import {
	buildSalesReceivables,
	salesRowsThrough,
} from "../src/domain/misa/misa.sales-receivables";
import {
	type OpeningBalances,
	type OpeningBalanceSource,
	openingBalanceRemovalLock,
	planOpeningBalanceImport,
	setOpeningBalanceDate,
	setOpeningBalanceEntry,
} from "../src/domain/misa/opening-balances";
import {
	allocateReceipt,
	emptyReceiptLedger,
	getReceiptInvoices,
	type ReceiptLedger,
	recordReceipt,
} from "../src/domain/payments/receipt-ledger";
import { projectReceiptReceivables } from "../src/domain/payments/receipt-receivables";
import {
	invoiceAging,
	summarizeCustomerAging,
} from "../src/domain/payments/receivable-aging";
import { buildDashboardSummary } from "../src/domain/reports/dashboard-summary";
import { buildReceivableStatement } from "../src/domain/reports/statement";
import { validateBusinessBackup } from "../src/domain/settings/business-data.rules.mjs";
import { parseOpeningBalanceRows } from "../src/features/misa/opening-balance.import";

const time = "2026-01-01T00:00:00.000Z";
const customer = (id: string, misaCode: string, name: string): Customer => ({
	id,
	misaCode,
	name,
	group: "unknown",
	taxCode: "",
	province: "",
	address: "",
	status: "active",
	assignments: [],
	createdAt: time,
	updatedAt: time,
});
const debtor = customer("c-a", "KH-A", "Khách A");
const creditor = customer("c-b", "KH-B", "Khách B");
const customers = [debtor, creditor];

const sale = (
	documentNumber: string,
	date: string,
	paymentTotal: number,
	customerCode = debtor.misaCode,
): MisaSalesLine => ({
	rowNumber: Number(documentNumber.replace(/\D/g, "")) || 1,
	date,
	documentNumber,
	invoiceNumber: documentNumber.replace("BH", ""),
	customerName: "Khách",
	productName: "Hàng",
	unit: "Hộp",
	quantity: 1,
	unitPrice: paymentTotal,
	salesAmount: paymentTotal,
	paymentTotal,
	source: {
		customerCode,
		invoiceSeries: "C25",
		invoiceDate: date,
		postingDate: date,
		debitAccount: "131",
	},
});

const opening: OpeningBalances = {
	date: "2025-12-31",
	fileName: "tong-hop-131.xlsx",
	importedAt: time,
	entries: [
		{
			customerId: debtor.id,
			customerCode: debtor.misaCode,
			customerName: debtor.name,
			amount: 1_000,
			rowNumber: 8,
		},
		{
			customerId: creditor.id,
			customerCode: creditor.misaCode,
			customerName: creditor.name,
			amount: -300,
			rowNumber: 9,
		},
	],
};

// Dòng 2025 đã nằm trong số dư đầu kỳ; chỉ dòng 2026 được cộng thêm.
const rows = [sale("BH1", "2025-12-20", 700), sale("BH2", "2026-01-05", 500)];

describe("đọc báo cáo Tổng hợp công nợ phải thu 131", () => {
	it("đọc tiêu đề hai tầng, lấy ngày chốt trước Từ ngày và bỏ dòng cộng", () => {
		const source = parseOpeningBalanceRows("tong-hop.xlsx", [
			["TỔNG HỢP CÔNG NỢ PHẢI THU KHÁCH HÀNG"],
			["Tài khoản: 131; Từ ngày 01/01/2026 đến ngày 31/03/2026"],
			[],
			[
				"Mã khách hàng",
				"Tên khách hàng",
				"Số dư đầu kỳ",
				null,
				"Phát sinh",
				null,
				"Số dư cuối kỳ",
				null,
			],
			[null, null, "Nợ", "Có", "Nợ", "Có", "Nợ", "Có"],
			["KH-A", "Khách A", 1_000, 0, 500, 0, 1_500, 0],
			["KH-B", "Khách B", null, "300", 0, 0, 0, 300],
			[null, "Nhóm khách lẻ", 5, 0],
			["Tổng cộng", null, 1_000, 300, 500, 0, 1_500, 300],
		]);
		expect(source.date).toBe("2025-12-31");
		expect(source.rows).toEqual([
			{
				rowNumber: 6,
				customerCode: "KH-A",
				customerName: "Khách A",
				debit: 1_000,
				credit: 0,
			},
			{
				rowNumber: 7,
				customerCode: "KH-B",
				customerName: "Khách B",
				debit: 0,
				credit: 300,
			},
		]);
	});

	it("đọc tiêu đề một tầng và chỉ lấy tài khoản 131", () => {
		const source = parseOpeningBalanceRows("tong-hop.xlsx", [
			[
				"Số tài khoản",
				"Mã khách hàng",
				"Tên khách hàng",
				"Dư Nợ đầu kỳ",
				"Dư Có đầu kỳ",
				"Phát sinh Nợ",
			],
			["131", "KH-A", "Khách A", "1.250.000", "", 10],
			["1388", "KH-A", "Khách A", 99, 0, 0],
		]);
		expect(source.date).toBe("");
		expect(source.rows).toEqual([
			{
				rowNumber: 2,
				customerCode: "KH-A",
				customerName: "Khách A",
				debit: 1_250_000,
				credit: 0,
			},
		]);
	});

	it("báo rõ khi file không có cột mã khách hàng", () => {
		expect(() =>
			parseOpeningBalanceRows("chi-tiet.xlsx", [
				["Tên khách hàng", "Ngày chứng từ", "Số dư", "Số dư"],
				[null, null, "Nợ", "Có"],
			]),
		).toThrow(/Mã khách hàng/);
	});
});

describe("lập kế hoạch nhập số dư đầu kỳ", () => {
	const source: OpeningBalanceSource = {
		fileName: "tong-hop.xlsx",
		date: "2025-12-31",
		rows: [
			{
				rowNumber: 6,
				customerCode: " kh-a ",
				customerName: "Khách A",
				debit: 1_000,
				credit: 0,
			},
			{
				rowNumber: 7,
				customerCode: "KH-NEW",
				customerName: "Khách mới",
				debit: 0,
				credit: 50,
			},
			{
				rowNumber: 8,
				customerCode: "KH-B",
				customerName: "Khách B",
				debit: 0,
				credit: 0,
			},
		],
	};
	const plan = (ledger: ReceiptLedger = emptyReceiptLedger, current = null) =>
		planOpeningBalanceImport(source, {
			customers,
			current,
			ledger,
			salesRows: rows,
			newId: () => "new-id",
		});

	it("ghép theo mã, thêm khách chưa có và bỏ số dư bằng 0", () => {
		const result = plan();
		expect(result.issues).toEqual([]);
		expect(result.balances.entries).toEqual([
			{
				customerId: "c-a",
				customerCode: "KH-A",
				customerName: "Khách A",
				amount: 1_000,
				rowNumber: 6,
			},
			{
				customerId: "new-id",
				customerCode: "KH-NEW",
				customerName: "Khách mới",
				amount: -50,
				rowNumber: 7,
			},
		]);
		expect(result.additions).toEqual([
			expect.objectContaining({ id: "new-id", misaCode: "KH-NEW" }),
		]);
		expect(result.counts).toMatchObject({
			customerCount: 2,
			zeroCount: 1,
			debitTotal: 1_000,
			creditTotal: 50,
			excludedSalesRows: 1,
		});
	});

	it("từ chối mã lặp trong báo cáo", () => {
		expect(() =>
			planOpeningBalanceImport(
				{
					...source,
					rows: [source.rows[0], { ...source.rows[0], rowNumber: 9 }],
				},
				{
					customers,
					current: null,
					ledger: emptyReceiptLedger,
					salesRows: [],
					newId: () => "x",
				},
			),
		).toThrow(/lặp ở dòng 6 và 9/);
	});

	it("chặn khi đã có khoản thu đến ngày chốt", () => {
		const ledger = recordReceipt(emptyReceiptLedger, debtor, {
			date: "2025-12-30",
			amount: 100,
			reference: "",
		});
		expect(plan(ledger).issues).toEqual([
			expect.stringMatching(/1 khoản thu ghi ngày đến 31\/12\/2025/),
		]);
	});
});

describe("công nợ có số dư đầu kỳ", () => {
	const groups = buildSalesReceivables(rows, customers, [], { opening });

	it("cộng số dư đầu kỳ, bỏ dòng bán hàng đến ngày chốt và trừ dư có", () => {
		const { customers: projected } = projectReceiptReceivables(
			groups,
			"so.xlsx",
			emptyReceiptLedger,
		);
		const a = projected.find(({ customerId }) => customerId === debtor.id);
		const b = projected.find(({ customerId }) => customerId === creditor.id);
		expect(a?.balance).toEqual({ received: 0, remaining: 1_500 });
		expect(a?.documents.map(({ documentNumbers }) => documentNumbers)).toEqual([
			["BH2"],
			["Số dư đầu kỳ"],
		]);
		expect(b?.balance).toEqual({ received: 0, remaining: -300 });
		expect(b?.documents[0]).toMatchObject({ reduction: true });
	});

	it("chưa có số dư khi xem trước ngày chốt", () => {
		const before = buildSalesReceivables(
			salesRowsThrough(rows, "2025-12-30"),
			customers,
			[],
			{
				opening,
				through: "2025-12-30",
			},
		);
		expect(before).toEqual([]);
	});

	it("số dư đầu kỳ nhận phân bổ khoản thu và nằm ở nhóm chưa có hạn", () => {
		let ledger = recordReceipt(emptyReceiptLedger, debtor, {
			date: "2026-01-10",
			amount: 400,
			reference: "",
		});
		const invoices = getReceiptInvoices(
			{ fileName: "so.xlsx", importedAt: time, rows },
			ledger.receipts[0],
			customers,
			opening,
		);
		const openingInvoice = invoices.find(
			({ documentNumber }) => documentNumber === "Số dư đầu kỳ",
		);
		expect(openingInvoice).toMatchObject({
			date: "2025-12-31",
			amount: 1_000,
			sourceFile: "tong-hop-131.xlsx",
		});
		if (!openingInvoice) throw new Error("missing opening invoice");
		ledger = allocateReceipt(ledger, ledger.receipts[0].id, "2026-01-10", [
			{ invoice: openingInvoice, amount: 400 },
		]);
		const { customers: projected } = projectReceiptReceivables(
			groups,
			"so.xlsx",
			ledger,
		);
		const a = projected.find(({ customerId }) => customerId === debtor.id);
		expect(a?.balance).toEqual({ received: 400, remaining: 1_100 });
		const document = a?.documents.find(({ openingBalance }) => openingBalance);
		if (!document) throw new Error("missing opening document");
		const aging = invoiceAging(document, 30, undefined, "2026-06-01");
		expect(aging).toMatchObject({ dueDate: null, bucket: "no-due-date" });
		expect(
			summarizeCustomerAging(a?.documents ?? [], (item) =>
				invoiceAging(item, 30, undefined, "2026-06-01"),
			).amounts["no-due-date"],
		).toBe(600);
		expect(openingBalanceRemovalLock(ledger)).toMatch(/1 khách hàng/);
	});

	it("Dashboard và biên bản dùng cùng số dư", () => {
		const summary = buildDashboardSummary(
			{ fileName: "so.xlsx", importedAt: time, rows },
			emptyReceiptLedger,
			customers,
			[],
			"2026-01-01",
			"2026-01-31",
			undefined,
			opening,
		);
		expect(summary.remaining).toBe(1_500 - 300);
		expect(summary.creditAmount).toBe(300);

		const book = { fileName: "so.xlsx", importedAt: time, rows };
		const january = buildReceivableStatement(
			book,
			emptyReceiptLedger,
			customers,
			debtor,
			"2026-01-01",
			"2026-01-31",
			opening,
		);
		expect(january).toMatchObject({
			opening: 1_000,
			increase: 500,
			closing: 1_500,
		});
		const fromCutoff = buildReceivableStatement(
			book,
			emptyReceiptLedger,
			customers,
			debtor,
			"2025-12-01",
			"2026-01-31",
			opening,
		);
		expect(fromCutoff.opening).toBe(0);
		expect(fromCutoff.rows[0]).toMatchObject({
			date: "2025-12-31",
			increase: 1_000,
			note: "Số dư đầu kỳ MISA",
		});
	});
});

describe("sao lưu số dư đầu kỳ", () => {
	const backup = (openingBalances: unknown) => ({
		format: "cong-no-backup",
		version: 1,
		companyId: null,
		createdAt: time,
		data: {
			customers,
			employees: [],
			salesBook: null,
			ledger: null,
			settings: null,
			openingBalances,
		},
	});

	it("nhận số dư của khách có trong danh mục", () => {
		expect(() => validateBusinessBackup(backup(opening))).not.toThrow();
	});

	it("từ chối số dư của khách không có trong danh mục", () => {
		expect(() =>
			validateBusinessBackup(
				backup({
					...opening,
					entries: [{ ...opening.entries[0], customerId: "missing" }],
				}),
			),
		).toThrow();
	});
});

describe("điền tay số dư đầu kỳ", () => {
	it("đặt ngày chốt chung khi chưa có số dư", () => {
		expect(
			setOpeningBalanceDate(null, "2025-12-31", emptyReceiptLedger),
		).toEqual({ date: "2025-12-31", fileName: "", entries: [] });
		expect(() =>
			setOpeningBalanceDate(opening, "2025-11-30", emptyReceiptLedger),
		).toThrow(/Đã có số dư đầu kỳ/);
		const ledger = recordReceipt(emptyReceiptLedger, debtor, {
			date: "2025-12-15",
			amount: 10,
			reference: "",
		});
		expect(() => setOpeningBalanceDate(null, "2025-12-31", ledger)).toThrow(
			/1 khoản thu/,
		);
	});

	it("thêm, sửa và bỏ số dư của một khách theo ngày chốt chung", () => {
		const empty = { ...opening, entries: [] };
		const added = setOpeningBalanceEntry(
			empty,
			creditor,
			-120,
			emptyReceiptLedger,
		);
		expect(added.entries).toEqual([
			{
				customerId: creditor.id,
				customerCode: creditor.misaCode,
				customerName: creditor.name,
				amount: -120,
				rowNumber: 0,
				source: "manual",
			},
		]);
		const changed = setOpeningBalanceEntry(
			{ ...added, importedAt: time },
			creditor,
			80,
			emptyReceiptLedger,
		);
		expect(changed.entries.map(({ amount }) => amount)).toEqual([80]);
		expect(
			setOpeningBalanceEntry(
				{ ...changed, importedAt: time },
				creditor,
				0,
				emptyReceiptLedger,
			).entries,
		).toEqual([]);
		const groups = buildSalesReceivables([], customers, [], {
			opening: { ...changed, importedAt: time },
		});
		expect(
			groups.map(({ customerId, paymentTotal }) => [customerId, paymentTotal]),
		).toEqual([[creditor.id, 80]]);
	});

	it("không sửa được khi đã phân bổ khoản thu vào số dư của khách", () => {
		let ledger = recordReceipt(emptyReceiptLedger, debtor, {
			date: "2026-01-10",
			amount: 100,
			reference: "",
		});
		const [invoice] = getReceiptInvoices(
			{ fileName: "so.xlsx", importedAt: time, rows: [] },
			ledger.receipts[0],
			customers,
			opening,
		);
		ledger = allocateReceipt(ledger, ledger.receipts[0].id, "2026-01-10", [
			{ invoice, amount: 100 },
		]);
		expect(() =>
			setOpeningBalanceEntry(opening, debtor, 2_000, ledger),
		).toThrow(/hoàn tác/);
		expect(() =>
			setOpeningBalanceEntry(opening, creditor, 50, ledger),
		).not.toThrow();
	});

	it("tạo nhóm cho khách chưa có chứng từ để tìm và điền số dư", () => {
		const groups = buildSalesReceivables([], customers, [], {
			includeEmptyCustomers: true,
		});
		expect(groups.map(({ id, documents }) => [id, documents.length])).toEqual([
			["catalog:c-a", 0],
			["catalog:c-b", 0],
		]);
	});
});
