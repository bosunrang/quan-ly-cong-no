import { Workbook } from "exceljs";
import { describe, expect, it } from "vitest";
import { seedCustomers } from "./fixtures/seed-customers";
import type {
	MisaSalesBook,
	MisaSalesLine,
} from "../src/domain/misa/misa.sales-book";
import {
	allocateReceipt,
	emptyReceiptLedger,
	getReceiptInvoices,
	recordReceipt,
	reverseAllocation,
} from "../src/domain/payments/receipt-ledger";
import { defaultSettings } from "../src/domain/settings/settings.model";
import { makeStatementWorkbook } from "../src/features/reports/report.export";
import {
	amountInWords,
	buildReceivableStatement,
	statementSeller,
} from "../src/features/reports/report.model";

const customer = {
	...seedCustomers[0],
	name: "Khách kiểm thử",
	misaCode: "0001",
};
const line: MisaSalesLine = {
	rowNumber: 2,
	date: "2024-06-02",
	documentNumber: "BH01",
	invoiceNumber: "00010",
	customerName: customer.name,
	productName: "Hàng A",
	unit: "Hộp",
	quantity: 1,
	unitPrice: 1400,
	salesAmount: 1400,
	paymentTotal: 1400,
	source: {
		customerCode: customer.misaCode,
		invoiceSeries: "A",
		invoiceDate: "2024-06-02",
		postingDate: "2024-06-03",
		debitAccount: "1311",
	},
};
const book: MisaSalesBook = {
	fileName: "ban-hang.xlsx",
	importedAt: "2024-06-08T00:00:00.000Z",
	rows: [
		line,
		{
			...line,
			rowNumber: 3,
			date: "2024-06-04",
			documentNumber: "BH02",
			invoiceNumber: "00011",
			paymentTotal: 450,
			source: {
				customerCode: customer.misaCode,
				invoiceSeries: "A",
				invoiceDate: "2024-06-04",
				postingDate: "2024-06-05",
			},
		},
		{
			...line,
			rowNumber: 4,
			date: "2024-06-09",
			documentNumber: "BH03",
			invoiceNumber: "00012",
		},
	],
};

function exampleStatement() {
	const ledger = recordReceipt(emptyReceiptLedger, customer, {
		date: "2024-06-01",
		number: "PT01",
		amount: 1000,
		reference: "",
	});
	const receipt = ledger.receipts[0];
	const invoices = getReceiptInvoices(book, receipt, [customer]);
	const first = invoices.find((invoice) => invoice.invoiceNumber === "00010");
	const second = invoices.find((invoice) => invoice.invoiceNumber === "00011");
	if (!first || !second) throw new Error("Thiếu hóa đơn mẫu.");
	const previous = allocateReceipt(ledger, receipt.id, "2024-06-04", [
		{ invoice: first, amount: 200 },
	]);
	const reversed = reverseAllocation(
		previous,
		previous.allocations[0].id,
		"2024-06-06",
		"Hoàn tác",
	);
	const current = allocateReceipt(reversed, receipt.id, "2024-06-07", [
		{ invoice: second, amount: 100 },
	]);
	return buildReceivableStatement(
		book,
		current,
		[customer],
		customer,
		"2024-06-05",
		"2024-06-08",
	);
}

describe("Biên bản đối chiếu công nợ", () => {
	it("chuyển số dư cũ, ghi nhận phát sinh và số thanh toán ròng trong kỳ", () => {
		expect(exampleStatement()).toMatchObject({
			opening: 1200,
			increase: 450,
			payment: -100,
			closing: 1750,
			rows: [
				{
					invoiceNumber: "00010",
					increase: 0,
					payment: -200,
					note: "Hóa đơn trước kỳ · Có hoàn tác phân bổ trong kỳ",
				},
				{
					invoiceNumber: "00011",
					increase: 450,
					payment: 100,
					note: "Thu ngày 01/06/2024",
				},
			],
		});
	});

	it("giữ số hóa đơn có số 0 ở đầu, ngày và số tiền đúng kiểu trong Excel", async () => {
		const bytes = await makeStatementWorkbook(
			exampleStatement(),
			statementSeller(defaultSettings),
			"2024-06-08",
		);
		const workbook = new Workbook();
		await workbook.xlsx.load(bytes);
		const sheet = workbook.getWorksheet("Đối chiếu công nợ");
		if (!sheet) throw new Error("Thiếu sheet đối chiếu.");
		expect(sheet.getCell("A1").value).toBe("BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ");
		expect(sheet.getCell("A2").value).toBe(
			"Từ ngày 05/06/2024 đến ngày 08/06/2024",
		);
		const rows = sheet.getRows(1, sheet.rowCount) ?? [];
		const detail = rows.find((row) => row.getCell(2).value === "00010");
		expect(detail?.getCell(1).value).toEqual(
			new Date("2024-06-02T00:00:00.000Z"),
		);
		expect(detail?.getCell(4).value).toBe(-200);
		const closing = rows.find(
			(row) => row.getCell(1).value === "Số dư cuối kỳ",
		);
		expect(closing?.getCell(3).value).toBe(1750);
		const issueDate = rows.find(
			(row) => row.getCell(4).value === "Ngày 08 tháng 06 năm 2024",
		);
		if (!issueDate) throw new Error("Thiếu dòng ngày phía bên bán.");
		const sellerSignature = sheet.getRow(issueDate.number + 1);
		expect(sellerSignature.getCell(4).value).toBe("ĐẠI DIỆN BÊN BÁN");
		for (const row of [issueDate, sellerSignature]) {
			expect(row.getCell(5).master.address).toBe(`D${row.number}`);
			expect(row.getCell(4).alignment.horizontal).toBe("center");
		}
		expect(sheet.pageSetup.orientation).toBe("portrait");
	});

	it("đọc số dư bằng chữ tiếng Việt", () => {
		expect(amountInWords(0)).toBe("Không đồng chẵn.");
		expect(amountInWords(1_001_025)).toBe(
			"Một triệu không trăm lẻ một nghìn không trăm hai mươi lăm đồng chẵn.",
		);
	});
});
