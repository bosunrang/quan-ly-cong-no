import { beforeEach, describe, expect, it } from "vitest";
import type { Customer } from "../src/domain/customers/customer.model";
import { readCustomers } from "../src/domain/customers/customer.repository";
import { readSalesEmployees } from "../src/domain/employees/employee.repository";
import type {
	MisaSalesBook,
	MisaSalesLine,
} from "../src/domain/misa/misa.sales-book";
import {
	allocateReceipt,
	emptyReceiptLedger,
	getReceiptInvoices,
	invoiceBalance,
	migrateReceiptLedger,
	recordReceipt,
} from "../src/domain/payments/receipt-ledger";
import { defaultSettings } from "../src/domain/settings/settings.model";
import {
	buildReceivableStatement,
	statementBalanceInWords,
	statementSeller,
} from "../src/features/reports/report.model";

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
	createdAt: "2024-01-01T00:00:00.000Z",
	updatedAt: "2024-01-01T00:00:00.000Z",
};

let rowNumber = 1;
function line(
	date: string,
	documentNumber: string,
	paymentTotal: number,
	quantity = 1,
): MisaSalesLine {
	rowNumber += 1;
	return {
		rowNumber,
		date,
		documentNumber,
		invoiceNumber: `HD-${documentNumber}-${date.slice(0, 4)}`,
		customerName: customer.name,
		productName: "Hàng",
		unit: "Hộp",
		quantity,
		unitPrice: paymentTotal,
		salesAmount: paymentTotal,
		paymentTotal,
		source: {
			customerCode: customer.misaCode,
			invoiceSeries: "C26T",
			invoiceDate: date,
			debitAccount: "131",
		},
	};
}
const book = (rows: MisaSalesLine[]): MisaSalesBook => ({
	fileName: "so.xlsx",
	importedAt: "2026-11-19T00:00:00.000Z",
	rows,
});
const receiptFor = (amount: number, date = "2026-11-10") =>
	recordReceipt(emptyReceiptLedger, customer, {
		number: "PT-1",
		date,
		amount,
		reference: "",
	});

describe("Giá trị hóa đơn và khóa hóa đơn", () => {
	it("tính hóa đơn có dòng chiết khấu âm theo tổng thanh toán", () => {
		const ledger = receiptFor(1);
		const invoices = getReceiptInvoices(
			book([
				line("2026-11-01", "BH01", 10_000_000),
				line("2026-11-01", "BH01", -500_000),
				// Chứng từ trả hàng riêng có tổng âm: chưa được tính.
				line("2026-11-02", "TL01", -300_000, -1),
			]),
			ledger.receipts[0],
			[customer],
		);
		expect(invoices.map(({ documentNumber, amount }) => [documentNumber, amount])).toEqual([
			["BH01", 9_500_000],
		]);
	});

	it("tách hóa đơn có cùng số chứng từ ở hai năm khác nhau", () => {
		const ledger = receiptFor(1);
		const invoices = getReceiptInvoices(
			book([
				line("2025-03-01", "BH00001", 1_000_000),
				line("2026-03-01", "BH00001", 2_000_000),
			]),
			ledger.receipts[0],
			[customer],
		);
		expect(invoices).toHaveLength(2);
		expect(new Set(invoices.map(({ id }) => id)).size).toBe(2);
		expect(invoices.map(({ id }) => JSON.parse(id))).toEqual(
			expect.arrayContaining([
				["KH001", "BH00001", "2025"],
				["KH001", "BH00001", "2026"],
			]),
		);
	});

	it("chuyển phân bổ dùng khóa cũ sang khóa có năm mà vẫn khớp hóa đơn", () => {
		const sales = book([line("2026-11-01", "BH02", 800_000)]);
		const ledger = receiptFor(500_000);
		const [invoice] = getReceiptInvoices(sales, ledger.receipts[0], [customer]);
		const allocated = allocateReceipt(ledger, ledger.receipts[0].id, "2026-11-10", [
			{ invoice, amount: 500_000 },
		]);
		const legacy = {
			...allocated,
			allocations: allocated.allocations.map((allocation) => ({
				...allocation,
				lines: allocation.lines.map((entry) => ({
					...entry,
					invoice: { ...entry.invoice, id: JSON.stringify(["KH001", "BH02"]) },
				})),
			})),
		};
		const migrated = migrateReceiptLedger(legacy);
		expect(migrated.allocations[0].lines[0].invoice.id).toBe(invoice.id);
		expect(invoiceBalance(migrated, invoice)).toMatchObject({
			received: 500_000,
			remaining: 300_000,
			changed: false,
		});
		// Dữ liệu đã đúng khóa thì giữ nguyên đối tượng.
		expect(migrateReceiptLedger(migrated)).toBe(migrated);
	});
});

describe("Biên bản đối chiếu công nợ", () => {
	const sales = book([line("2026-11-01", "BH03", 1_000_000)]);

	it("trình bày tiền thu chưa phân bổ và công nợ thuần", () => {
		const ledger = receiptFor(1_300_000);
		const [invoice] = getReceiptInvoices(sales, ledger.receipts[0], [customer]);
		const allocated = allocateReceipt(ledger, ledger.receipts[0].id, "2026-11-10", [
			{ invoice, amount: 1_000_000 },
		]);
		const statement = buildReceivableStatement(
			sales,
			allocated,
			[customer],
			customer,
			"2026-11-01",
			"2026-11-15",
		);
		expect(statement).toMatchObject({
			closing: 0,
			unallocated: 300_000,
			net: -300_000,
		});
		expect(statementBalanceInWords(statement)).toBe(
			"Khách hàng dư có ba trăm nghìn đồng chẵn.",
		);
	});

	it("tính khoản thu chưa phân bổ của khách chưa có phân bổ nào", () => {
		const statement = buildReceivableStatement(
			sales,
			receiptFor(400_000),
			[customer],
			customer,
			"2026-11-01",
			"2026-11-15",
		);
		expect(statement).toMatchObject({
			closing: 1_000_000,
			unallocated: 400_000,
			net: 600_000,
		});
	});

	it("không tự điền tên công ty khác khi Cài đặt chưa có tên bên bán", () => {
		expect(statementSeller(defaultSettings)).toMatchObject({
			name: "",
			accounts: [],
			signatory: "",
		});
	});
});

describe("Kho mới", () => {
	beforeEach(() => window.localStorage.clear());

	it("không nạp khách hàng và nhân viên mẫu", () => {
		expect(readCustomers()).toEqual([]);
		expect(readSalesEmployees()).toEqual([]);
	});
});
