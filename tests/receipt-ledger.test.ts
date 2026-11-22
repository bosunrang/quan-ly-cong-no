import { describe, expect, it } from "vitest";
import type { Customer } from "../src/domain/customers/customer.model";
import type { MisaSalesLine } from "../src/domain/misa/misa.sales-book";
import { buildSalesReceivables } from "../src/domain/misa/misa.sales-receivables";
import {
	allocateReceipt as allocateReceiptOnLedger,
	emptyReceiptLedger,
	getReceiptInvoices,
	invoiceBalance,
	nextReceiptNumber,
	receiptAllocated,
	recordReceipt,
	reverseAllocation,
	reverseReceipt,
} from "../src/domain/payments/receipt-ledger";
import { projectReceiptReceivables } from "../src/domain/payments/receipt-receivables";
import { buildDashboardSummary } from "../src/features/dashboard/dashboard.summary";
import { buildReceivableStatement } from "../src/domain/reports/statement";

// Dữ liệu mẫu ghi khoản thu trước ngày chứng từ: đây là các ca khách trả trước.
const allocateReceipt = (
	...[ledger, receiptId, date, lines]: Parameters<
		typeof allocateReceiptOnLedger
	>
) =>
	allocateReceiptOnLedger(ledger, receiptId, date, lines, {
		allowAdvance: true,
	});

const customer: Customer = {
	id: "customer-a",
	misaCode: "0001",
	name: "Khách A",
	group: "unknown",
	taxCode: "",
	province: "",
	address: "",
	status: "active",
	assignments: [],
	createdAt: "2024-01-01T00:00:00.000Z",
	updatedAt: "2024-01-01T00:00:00.000Z",
};
const draft = {
	number: "PT01",
	date: "2024-06-01",
	amount: 1200,
	reference: "00010",
};
const record = () => recordReceipt(emptyReceiptLedger, customer, draft);
const lineSource = {
	customerCode: "0001",
	invoiceSeries: "A",
	invoiceDate: "2024-06-02",
	postingDate: "2024-06-03",
	debitAccount: "1311",
};
const line: MisaSalesLine = {
	rowNumber: 2,
	date: "2024-06-02",
	documentNumber: "BH01",
	invoiceNumber: "00010",
	customerName: customer.name,
	productName: "Hàng A",
	unit: "Hộp",
	quantity: 2,
	unitPrice: 250,
	salesAmount: 500,
	paymentTotal: 500,
	source: lineSource,
};
const book = {
	fileName: "ban-hang.xlsx",
	importedAt: "2024-06-08T00:00:00.000Z",
	rows: [
		line,
		{ ...line, rowNumber: 3, productName: "Hàng B", paymentTotal: 300 },
		{
			...line,
			rowNumber: 4,
			documentNumber: "BH02",
			invoiceNumber: "00011",
			paymentTotal: 600,
		},
	],
};
const invoices = (rows = book.rows) =>
	getReceiptInvoices({ ...book, rows }, record().receipts[0], [customer]);

describe("Dashboard công nợ theo ngày chốt", () => {
	it("trừ khách dư có vào tổng còn phải thu nhưng không đưa vào danh sách còn nợ", () => {
		const other: Customer = {
			...customer,
			id: "customer-b",
			misaCode: "0002",
			name: "Khách B",
		};
		const otherLine = {
			...line,
			customerName: other.name,
			source: { ...lineSource, customerCode: "0002" },
		};
		const rows = [
			...book.rows,
			{
				...otherLine,
				rowNumber: 5,
				documentNumber: "BH10",
				invoiceNumber: "00020",
				paymentTotal: 500,
			},
			{
				...otherLine,
				rowNumber: 6,
				documentNumber: "TL01",
				invoiceNumber: "",
				productName: "Hàng trả lại",
				paymentTotal: -800,
				source: { ...otherLine.source, debitAccount: "" },
			},
		];
		const summary = buildDashboardSummary(
			{ ...book, rows },
			emptyReceiptLedger,
			[customer, other],
			[],
			"2024-06-01",
			"2024-06-30",
		);
		expect(summary.receivables.map(({ name }) => name)).toEqual(["Khách A"]);
		expect(summary.credits.map(({ name }) => name)).toEqual(["Khách B"]);
		expect(summary).toMatchObject({
			remaining: 1100,
			creditAmount: 300,
			creditCount: 1,
		});
	});

	it("tính theo ngày hạch toán và tái hiện khoản thu trước khi hoàn tác hoặc hủy", () => {
		const ledger = record();
		const receiptId = ledger.receipts[0].id;
		const invoice = getReceiptInvoices(book, ledger.receipts[0], [customer])[0];
		const withAllocation = allocateReceipt(ledger, receiptId, "2024-06-04", [
			{ invoice, amount: 200 },
		]);
		const withReversal = reverseAllocation(
			withAllocation,
			withAllocation.allocations[0].id,
			"2024-06-06",
			"Hoàn tác phân bổ",
		);
		const cancelled = reverseReceipt(
			withReversal,
			receiptId,
			"2024-06-07",
			"Hủy",
		);
		const at = (through: string, from = "2024-06-01") =>
			buildDashboardSummary(book, cancelled, [customer], [], from, through);

		expect(at("2024-06-02")).toMatchObject({
			salesRowCount: 0,
			periodReceived: 1200,
		});
		expect(at("2024-06-03")).toMatchObject({
			remaining: 1400,
			unallocated: 1200,
		});
		expect(at("2024-06-05")).toMatchObject({
			remaining: 1200,
			periodReceived: 1200,
			unallocated: 1000,
			receivables: [{ name: customer.name, remaining: 1200 }],
		});
		expect(at("2024-06-05").receivables[0].documents).toHaveLength(2);
		expect(at("2024-06-06", "2024-06-05")).toMatchObject({
			remaining: 1400,
			unallocated: 1200,
			periodReceived: 0,
			periodReceipts: [],
			unallocatedReceipts: [{ number: draft.number }],
		});
		expect(at("2024-06-07")).toMatchObject({
			remaining: 1400,
			periodReceived: 0,
			unallocated: 0,
			periodReversalCount: 0,
		});
		// Khoản thu ngày 01/06 bị hủy ngày 07/06: kỳ bắt đầu sau ngày thu phải trừ số tiền đó.
		const later = at("2024-06-08", "2024-06-02");
		expect(later).toMatchObject({
			periodReceived: -1200,
			periodReversalCount: 1,
			periodReceipts: [
				{
					number: draft.number,
					date: draft.date,
					amount: -1200,
					unallocated: 0,
					reversedOn: "2024-06-07",
				},
			],
			unallocated: 0,
		});
		const trend = later.receiptTrend.buckets;
		expect(trend.reduce((sum, bucket) => sum + bucket.amount, 0)).toBe(-1200);
		expect(trend.find(({ reversals }) => reversals)).toMatchObject({
			from: "2024-06-07",
			amount: -1200,
			count: 0,
			reversals: 1,
		});
		// Kỳ kết thúc trước ngày hủy chưa thấy phiếu hủy; kỳ chứa ngày thu thì đã loại khoản thu.
		expect(at("2024-06-06", "2024-06-02").periodReceived).toBe(0);
		expect(
			at("2024-06-30", "2024-06-01").periodReceived +
				at("2024-07-31", "2024-07-01").periodReceived,
		).toBe(0);
	});

	it("chỉ trả hóa đơn còn nợ của khách tại ngày chốt", () => {
		const salesBook = {
			...book,
			rows: [
				...book.rows,
				{
					...line,
					rowNumber: 5,
					documentNumber: "BH03",
					invoiceNumber: "00012",
					source: { ...lineSource, postingDate: "2024-06-05" },
				},
				{
					...line,
					rowNumber: 6,
					documentNumber: "BH04",
					invoiceNumber: "00013",
					paymentTotal: null,
				},
			],
		};
		const ledger = record();
		const receipt = ledger.receipts[0];
		const invoice = getReceiptInvoices(salesBook, receipt, [customer]).find(
			(item) => item.documentNumber === "BH01",
		);
		if (!invoice) throw new Error("Thiếu hóa đơn BH01.");
		const paid = allocateReceipt(ledger, receipt.id, "2024-06-04", [
			{ invoice, amount: invoice.amount },
		]);
		const at = (through: string) =>
			buildDashboardSummary(
				salesBook,
				paid,
				[customer],
				[],
				"2024-06-01",
				through,
			);

		expect(
			at("2024-06-03").receivables[0].documents.map((doc) => doc.invoiceNumber),
		).toEqual(expect.arrayContaining(["00010", "00011"]));
		const afterPayment = at("2024-06-04");
		expect(afterPayment.receivables[0]).toMatchObject({
			remaining: 600,
			documents: [
				{ invoiceNumber: "00011", balance: { received: 0, remaining: 600 } },
			],
		});
		expect(afterPayment.customerTotals.get(`catalog:${customer.id}`)).toEqual({
			balance: { received: 800, remaining: 600 },
			unverifiedCount: 1,
		});
	});

	it("vẫn tổng hợp khoản thu khi chưa có sổ bán hàng", () => {
		expect(
			buildDashboardSummary(
				null,
				record(),
				[customer],
				[],
				"2024-06-01",
				"2024-06-01",
			),
		).toMatchObject({
			salesRowCount: 0,
			hasVerifiedDocuments: false,
			receivables: [],
			periodReceived: 1200,
			unallocated: 1200,
		});
	});
});

describe("Sổ đối soát khoản thu", () => {
	it("không trừ phân bổ khỏi chứng từ đã đổi giá trị hoặc chứng từ thu tiền ngay", () => {
		const ledger = record();
		const [invoice] = invoices();
		const booked = allocateReceipt(
			ledger,
			ledger.receipts[0].id,
			"2024-06-03",
			[{ invoice, amount: 100 }],
		);
		const groups = buildSalesReceivables(
			[
				{ ...line, paymentTotal: 950 },
				{
					...line,
					documentNumber: "BH-TM",
					invoiceNumber: "TM",
					source: { ...lineSource, debitAccount: "1111" },
				},
			],
			[customer],
			[],
		);
		const view = projectReceiptReceivables(groups, book.fileName, booked);
		expect(view.unmatchedCount).toBe(1);
		expect(view.customers[0]).toMatchObject({
			balance: null,
			unverifiedCount: 2,
			documents: [
				{ balance: null, allocationMismatch: true },
				{ balance: null, allocationMismatch: false },
			],
		});
	});

	it("dùng mã khách hàng và loại chứng từ thiếu căn cứ hoặc ghi Nợ ngoài 131", () => {
		const candidates = invoices([
			...book.rows,
			{
				...line,
				documentNumber: "PT01",
				invoiceNumber: "12",
				source: { ...lineSource, debitAccount: "1111" },
			},
			{
				...line,
				documentNumber: "PT02",
				invoiceNumber: "13",
				source: { ...lineSource, customerCode: "0002" },
			},
			{
				...line,
				documentNumber: "TL01",
				invoiceNumber: "14",
				paymentTotal: -100,
			},
			{
				...line,
				documentNumber: "BH03",
				invoiceNumber: "15",
				paymentTotal: null,
			},
			{
				...line,
				documentNumber: "BH04",
				invoiceNumber: "16",
				source: undefined,
			},
		]);
		expect(
			candidates.map((invoice) => [
				invoice.documentNumber,
				invoice.amount,
				invoice.date,
			]),
		).toEqual([
			["BH01", 800, "2024-06-03"],
			["BH02", 600, "2024-06-03"],
		]);
		expect(
			getReceiptInvoices(book, record().receipts[0], [
				customer,
				{ ...customer, id: "duplicate" },
			]),
		).toEqual([]);
	});

	it("phân bổ nhiều chứng từ và giữ lại tiền chưa phân bổ", () => {
		const ledger = record();
		const receipt = ledger.receipts[0];
		const [first, second] = invoices();
		const booked = allocateReceipt(ledger, receipt.id, "2024-06-03", [
			{ invoice: first, amount: 800 },
			{ invoice: second, amount: 250 },
		]);
		expect(receipt.amount - receiptAllocated(booked, receipt.id)).toBe(150);
		expect(invoiceBalance(booked, first).remaining).toBe(0);
		expect(invoiceBalance(booked, second).remaining).toBe(350);
		expect(() =>
			allocateReceipt(booked, receipt.id, "2024-06-03", [
				{ invoice: second, amount: 151 },
			]),
		).toThrow("vượt số dư khoản thu");
		expect(() =>
			allocateReceipt(booked, receipt.id, "2024-06-03", [
				{ invoice: first, amount: 1 },
			]),
		).toThrow("vượt số còn lại");
		const nextReceipt = recordReceipt(booked, customer, {
			...draft,
			number: "PT02",
			amount: 200,
		});
		const applied = allocateReceipt(
			nextReceipt,
			nextReceipt.receipts[1].id,
			"2024-06-04",
			[{ invoice: second, amount: 200 }],
		);
		expect(invoiceBalance(applied, second).remaining).toBe(150);
	});

	it("chỉ phân bổ vào chứng từ sau ngày thu khi xác nhận khách trả trước", () => {
		const ledger = record();
		const receipt = ledger.receipts[0];
		const [invoice] = invoices();
		expect(invoice.date > receipt.date).toBe(true);
		expect(() =>
			allocateReceiptOnLedger(ledger, receipt.id, "2024-06-03", [
				{ invoice, amount: 100 },
			]),
		).toThrow("khách trả trước");
		const advance = allocateReceiptOnLedger(
			ledger,
			receipt.id,
			"2024-06-03",
			[{ invoice, amount: 100 }],
			{ allowAdvance: true },
		);
		expect(receiptAllocated(advance, receipt.id)).toBe(100);
		// Khoản thu từ ngày chứng từ trở đi phân bổ bình thường, không cần xác nhận.
		const withSecond = recordReceipt(advance, customer, {
			...draft,
			number: "PT02",
			date: invoice.date,
		});
		const onTime = withSecond.receipts[1];
		const paid = allocateReceiptOnLedger(withSecond, onTime.id, invoice.date, [
			{ invoice, amount: 100 },
		]);
		expect(receiptAllocated(paid, onTime.id)).toBe(100);
	});

	it("chặn trùng phiếu, phân bổ sai ngày và sử dụng hóa đơn đã đổi nội dung", () => {
		const ledger = record();
		const receipt = ledger.receipts[0];
		const [invoice] = invoices();
		expect(() =>
			recordReceipt(ledger, customer, { ...draft, number: " pt01 " }),
		).toThrow("đã được ghi");
		expect(() =>
			allocateReceipt(ledger, receipt.id, "2024-06-02", [
				{ invoice, amount: 100 },
			]),
		).toThrow("ngày chứng từ");
		const booked = allocateReceipt(ledger, receipt.id, "2024-06-03", [
			{ invoice, amount: 100 },
		]);
		expect(() =>
			allocateReceipt(booked, receipt.id, "2024-06-04", [
				{ invoice: { ...invoice, amount: 801 }, amount: 100 },
			]),
		).toThrow("đã đổi");
	});

	it("tự cấp số theo năm hạch toán và không dùng lại số đã hủy", () => {
		const fields = { date: draft.date, amount: draft.amount, reference: "" };
		const existing = recordReceipt(record(), customer, {
			...fields,
			number: "pt-2024-0007",
		});
		const ledger = reverseReceipt(
			existing,
			existing.receipts[1].id,
			"2024-06-02",
			"Nhập trùng",
		);

		expect(nextReceiptNumber(ledger.receipts, "2023-12-31")).toBe(
			"PT-2023-0001",
		);
		expect(nextReceiptNumber(ledger.receipts, fields.date)).toBe(
			"PT-2024-0008",
		);

		const first = recordReceipt(ledger, customer, fields);
		expect(first.receipts.at(-1)?.number).toBe("PT-2024-0008");
		const second = recordReceipt(first, customer, fields);
		expect(second.receipts.at(-1)?.number).toBe("PT-2024-0009");
		expect(second.receipts[0].number).toBe(draft.number);
	});

	it("hoàn tác có lịch sử và ngăn dùng lại tiền trước ngày hoàn tác", () => {
		const ledger = record();
		const receipt = ledger.receipts[0];
		const [first, second] = invoices();
		const booked = allocateReceipt(ledger, receipt.id, "2024-06-03", [
			{ invoice: first, amount: 800 },
			{ invoice: second, amount: 400 },
		]);
		const reversed = reverseAllocation(
			booked,
			booked.allocations[0].id,
			"2024-06-05",
			"Ghép nhầm",
		);
		expect(receiptAllocated(reversed, receipt.id)).toBe(0);
		expect(invoiceBalance(reversed, first).remaining).toBe(800);
		expect(reversed.allocations[0].reversal?.reason).toBe("Ghép nhầm");
		expect(() =>
			allocateReceipt(reversed, receipt.id, "2024-06-04", [
				{ invoice: first, amount: 1 },
			]),
		).toThrow("vượt số còn lại");
		const reapplied = allocateReceipt(reversed, receipt.id, "2024-06-05", [
			{ invoice: first, amount: 1 },
		]);
		expect(receiptAllocated(reapplied, receipt.id)).toBe(1);
	});

	it("hủy khoản thu và hoàn tác toàn bộ phân bổ đang hiệu lực trong cùng bản ghi", () => {
		const ledger = record();
		const receipt = ledger.receipts[0];
		const [first, second] = invoices();
		const booked = allocateReceipt(ledger, receipt.id, "2024-06-03", [
			{ invoice: first, amount: 500 },
			{ invoice: second, amount: 100 },
		]);
		expect(() =>
			reverseReceipt(booked, receipt.id, "2024-06-02", "Đảo phiếu"),
		).toThrow("ngày xử lý phân bổ");
		const reversed = reverseReceipt(
			booked,
			receipt.id,
			"2024-06-05",
			"Đảo phiếu",
		);
		expect(reversed.receipts[0].reversal).toEqual(
			reversed.allocations[0].reversal,
		);
		expect(invoiceBalance(reversed, first).remaining).toBe(800);
		expect(() =>
			allocateReceipt(reversed, receipt.id, "2024-06-05", [
				{ invoice: first, amount: 1 },
			]),
		).toThrow("Khoản thu đã hủy.");
	});
});

describe("Hàng bán trả lại và giảm trừ", () => {
	const returned = (paymentTotal: number, debitAccount = "5212") => ({
		...line,
		rowNumber: 9,
		date: "2024-06-05",
		documentNumber: "BTL01",
		invoiceNumber: "",
		quantity: 0,
		unitPrice: 0,
		salesAmount: 0,
		paymentTotal,
		source: {
			...lineSource,
			invoiceSeries: "",
			invoiceDate: "2024-06-05",
			postingDate: "2024-06-05",
			debitAccount,
		},
	});
	const project = (rows: MisaSalesLine[]) =>
		projectReceiptReceivables(
			buildSalesReceivables(rows, [customer], []),
			book.fileName,
			emptyReceiptLedger,
		).customers[0];

	it("trừ thẳng chứng từ trả lại vào công nợ của khách", () => {
		const projected = project([...book.rows, returned(-300)]);
		expect(projected.balance).toEqual({ received: 0, remaining: 1100 });
		expect(projected.unverifiedCount).toBe(0);
		expect(
			projected.documents.find(({ documentNumbers }) =>
				documentNumbers.includes("BTL01"),
			),
		).toMatchObject({
			reduction: true,
			balance: { received: 0, remaining: -300, allocations: [] },
		});
		// Giảm trừ không phải hóa đơn để phân bổ khoản thu.
		expect(
			invoices([...book.rows, returned(-300)]).map(
				({ documentNumber }) => documentNumber,
			),
		).toEqual(["BH01", "BH02"]);
	});

	it("không trừ chứng từ âm hoàn tiền mặt hoặc ngân hàng", () => {
		const projected = project([...book.rows, returned(-300, "1111")]);
		expect(projected.balance?.remaining).toBe(1400);
		expect(projected.unverifiedCount).toBe(1);
	});

	it("đưa giảm trừ vào biên bản và để khách dư có ra khỏi danh sách còn nợ", () => {
		const rows = [...book.rows, returned(-300)];
		const statement = buildReceivableStatement(
			{ ...book, rows },
			emptyReceiptLedger,
			[customer],
			customer,
			"2024-06-01",
			"2024-06-30",
		);
		expect(statement).toMatchObject({
			increase: 1100,
			closing: 1100,
			omitted: 0,
		});
		expect(statement.rows).toContainEqual(
			expect.objectContaining({
				increase: -300,
				payment: 0,
				note: "Hàng trả lại / giảm trừ · CT BTL01",
			}),
		);

		const credit = [...book.rows, returned(-2000)];
		const summary = buildDashboardSummary(
			{ ...book, rows: credit },
			emptyReceiptLedger,
			[customer],
			[],
			"2024-06-01",
			"2024-06-30",
		);
		expect(project(credit).balance?.remaining).toBe(-600);
		// Không vào danh sách còn nợ, nhưng tổng còn phải thu trừ phần dư có như màn Công nợ phải thu.
		expect(summary).toMatchObject({
			remaining: -600,
			receivables: [],
			creditAmount: 600,
			creditCount: 1,
		});
	});
});
