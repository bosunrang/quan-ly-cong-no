import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { seedCustomers } from "./fixtures/seed-customers";
import type { MisaSalesLine } from "../src/domain/misa/misa.sales-book";
import { buildSalesReceivables } from "../src/domain/misa/misa.sales-receivables";
import {
	allocateReceipt,
	emptyReceiptLedger,
	getReceiptInvoices,
	recordReceipt,
	reverseAllocation,
} from "../src/domain/payments/receipt-ledger";
import { api } from "../src/shared/api/client";
import { accountingChanged } from "../src/shared/hooks/useServerData";
import { receivablesView } from "./fixtures/receivables-view";
import { SalesReceivablesPage } from "../src/features/receivables/SalesReceivablesPage";

vi.mock("../src/shared/api/client", () => ({ api: vi.fn() }));

const customer = {
	...seedCustomers[0],
	name: "Bệnh viện Tâm",
	misaCode: "KH-01",
};
const line: MisaSalesLine = {
	rowNumber: 10,
	date: "2026-06-01",
	documentNumber: "BH-01",
	invoiceNumber: "000020",
	customerName: customer.name,
	productName: "Hàng A",
	unit: "Hộp",
	quantity: 1,
	unitPrice: 100,
	salesAmount: 100,
	paymentTotal: 110,
};

describe("nhóm sổ bán hàng cho màn công nợ", () => {
	it("cộng nhiều dòng cùng hóa đơn, giữ giá trị âm và giữ nhóm thiếu số hóa đơn", () => {
		const groups = buildSalesReceivables(
			[
				line,
				{ ...line, rowNumber: 11, productName: "Hàng B", paymentTotal: 55 },
				{
					...line,
					rowNumber: 12,
					invoiceNumber: "",
					documentNumber: "TL-01",
					paymentTotal: -20,
				},
				{
					...line,
					rowNumber: 13,
					invoiceNumber: "",
					documentNumber: "TL-01",
					paymentTotal: null,
				},
			],
			[customer],
			[],
		);
		expect(groups).toHaveLength(1);
		expect(groups[0]).toMatchObject({
			customerCode: "KH-01",
			catalogMatch: true,
			province: customer.province,
			employeeId: customer.assignments[0].employeeId,
			invoiceCount: 1,
			paymentTotal: 145,
			missingTotalCount: 1,
			documents: [
				{
					invoiceNumber: "000020",
					documentNumbers: ["BH-01"],
					paymentTotal: 165,
					lineCount: 2,
					lines: [
						line,
						{ ...line, rowNumber: 11, productName: "Hàng B", paymentTotal: 55 },
					],
				},
				{
					invoiceNumber: "",
					documentNumbers: ["TL-01"],
					paymentTotal: -20,
					lineCount: 2,
				},
			],
		});
	});

	it("tách hóa đơn cũ nếu thiếu ký hiệu và số chứng từ khác nhau", () => {
		const groups = buildSalesReceivables(
			[line, { ...line, rowNumber: 11, documentNumber: "BH-02" }],
			[customer],
			[],
		);
		expect(groups[0].invoiceCount).toBe(2);
		expect(groups[0].paymentTotal).toBe(220);
	});

	it("dùng mã MISA ưu tiên tên, phân biệt ký hiệu và nhóm hóa đơn có nhiều chứng từ liên quan", () => {
		const source = {
			customerCode: "kh-01",
			invoiceSeries: "C26TAA",
			invoiceDate: "2026-06-01",
		};
		const groups = buildSalesReceivables(
			[
				{ ...line, customerName: "Tên trong file khác danh mục", source },
				{ ...line, rowNumber: 11, documentNumber: "BH-02", source },
				{
					...line,
					rowNumber: 12,
					documentNumber: "BH-03",
					source: { ...source, invoiceSeries: "C26TBB" },
				},
				{
					...line,
					rowNumber: 13,
					documentNumber: "BH-04",
					source: { ...source, customerCode: "KH-02" },
				},
			],
			[customer],
			[],
		);
		expect(groups[0]).toMatchObject({
			name: customer.name,
			invoiceCount: 2,
			documents: [
				{ invoiceSeries: "C26TAA", documentNumbers: ["BH-01", "BH-02"] },
				{ invoiceSeries: "C26TBB", documentNumbers: ["BH-03"] },
			],
		});
		expect(groups[1]).toMatchObject({
			customerCode: "KH-02",
			catalogMatch: false,
			employeeId: "",
			province: "",
		});
	});

	it("không tự phân công khi tên trong dữ liệu cũ trùng danh mục và giữ tổng chưa biết", () => {
		const groups = buildSalesReceivables(
			[{ ...line, paymentTotal: null }],
			[customer, { ...customer, id: "KH-02", misaCode: "KH-02" }],
			[],
		);
		expect(groups[0]).toMatchObject({
			catalogMatch: false,
			province: "",
			employeeId: "",
			paymentTotal: null,
			missingTotalCount: 1,
			documents: [{ paymentTotal: null }],
		});
	});
});

it("cập nhật tổng khách hàng và chi tiết hóa đơn đang mở khi lưu hoặc hoàn tác phân bổ", async () => {
	const book = {
		fileName: "ban-hang.xlsx",
		importedAt: "2024-06-03T00:00:00Z",
		rows: [
			{
				...line,
				date: "2024-06-01",
				source: {
					customerCode: customer.misaCode,
					invoiceDate: "2024-06-01",
					invoiceSeries: "A",
					debitAccount: "1311",
				},
			},
		],
	};
	const recorded = recordReceipt(emptyReceiptLedger, customer, {
		number: "PT-01",
		date: "2024-06-02",
		amount: 50,
		reference: "",
	});
	const receipt = recorded.receipts[0];
	const [invoice] = getReceiptInvoices(book, receipt, [customer]);
	const booked = allocateReceipt(recorded, receipt.id, "2024-06-03", [
		{ invoice, amount: 25 },
	]);
	const withSecondReceipt = recordReceipt(booked, customer, {
		number: "PT-02",
		date: "2024-06-04",
		amount: 100,
		reference: "",
	});
	const bookedTwice = allocateReceipt(
		withSecondReceipt,
		withSecondReceipt.receipts[1].id,
		"2024-06-06",
		[{ invoice, amount: 15 }],
	);
	const reversed = reverseAllocation(
		bookedTwice,
		booked.allocations[0].id,
		"2024-06-07",
		"Ghép nhầm",
	);
	const fullyReversed = reverseAllocation(
		reversed,
		bookedTwice.allocations[1].id,
		"2024-06-08",
		"Ghép nhầm",
	);
	let currentLedger = recorded;
	vi.mocked(api).mockImplementation(
		async (_method, resource) =>
			receivablesView(resource, book, [customer], currentLedger) as never,
	);
	const refresh = accountingChanged;

	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	const amounts = (selector: string) =>
		[...container.querySelectorAll(selector)]
			.slice(-2)
			.map((cell) => cell.textContent?.trim());
	const click = async (selector: string) =>
		act(async () => {
			container.querySelector<HTMLButtonElement>(selector)?.click();
		});
	try {
		await act(async () =>
			root.render(
				createElement(SalesReceivablesPage, {
					onOpenMisa: vi.fn(),
					onOpenCustomers: vi.fn(),
				}),
			),
		);
		expect(amounts(".receivable-table tbody td")).toEqual(["0", "110"]);
		await click(".receivable-customer-link");
		await click(".receivable-invoice-link");
		expect(amounts(".invoice-lines-balances dd")).toEqual(["0", "110"]);

		currentLedger = booked;
		await act(async () => {
			refresh();
		});
		expect(amounts(".receivable-table tbody td")).toEqual(["25", "85"]);
		expect(amounts(".receivable-invoice-table tbody td")).toEqual(["25", "85"]);
		expect(amounts(".invoice-lines-balances dd")).toEqual(["25", "85"]);
		await click(".invoice-lines-dialog footer button");
		const paidLink = container.querySelector<HTMLButtonElement>(
			'button[aria-label^="Xem khoản thu đã phân bổ"]',
		);
		expect(paidLink?.textContent).toBe("25");
		await act(async () => {
			paidLink?.focus();
			paidLink?.click();
		});
		const allocations = () =>
			Array.from(
				container.querySelectorAll<HTMLTableRowElement>(
					".receivable-allocations-table tbody tr",
				),
				(row) => Array.from(row.cells, (cell) => cell.textContent),
			);
		expect(allocations()).toEqual([
			["PT-01", "02/06/2024", "03/06/2024", "25"],
		]);

		currentLedger = bookedTwice;
		await act(async () => {
			refresh();
		});
		expect(paidLink?.textContent).toBe("40");
		expect(allocations()).toEqual([
			["PT-02", "04/06/2024", "06/06/2024", "15"],
			["PT-01", "02/06/2024", "03/06/2024", "25"],
		]);
		currentLedger = reversed;
		await act(async () => {
			refresh();
		});
		expect(allocations()).toEqual([
			["PT-02", "04/06/2024", "06/06/2024", "15"],
		]);
		currentLedger = fullyReversed;
		await act(async () => {
			refresh();
		});
		expect(paidLink?.textContent).toBe("0");
		expect(allocations()).toEqual([]);
		expect(
			container.querySelector(".receivable-allocations-dialog")?.textContent,
		).toContain("Chưa có khoản thu được phân bổ.");
		await click(".receivable-allocations-dialog footer button");
		expect(document.activeElement).toBe(paidLink);
	} finally {
		await act(async () => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
		currentLedger = emptyReceiptLedger;
	}
});

it("lọc khách hàng rồi mở đúng dòng hàng theo hóa đơn hoặc chứng từ", async () => {
	const invoiceSource = {
		customerCode: customer.misaCode,
		invoiceSeries: "1C26TAD",
		invoiceDate: "2026-05-31",
	};
	const secondCustomer = {
		...seedCustomers[2],
		name: "Bệnh viện phía Nam",
		province: "TP Hồ Chí Minh",
	};
	const testBook = {
		fileName: "ban-hang.xlsx",
		importedAt: "2026-06-01T00:00:00Z",
		rows: [
			{ ...line, source: invoiceSource },
			{
				...line,
				rowNumber: 11,
				customerName: secondCustomer.name,
				paymentTotal: 200,
			},
			{
				...line,
				rowNumber: 12,
				productName: "Hàng B",
				quantity: 2.5,
				unitPrice: 12.3456,
				paymentTotal: 0,
				source: invoiceSource,
			},
			{
				...line,
				rowNumber: 13,
				documentNumber: "TL-01",
				invoiceNumber: "",
				productName: "Hàng trả lại",
				quantity: null,
				unitPrice: null,
				paymentTotal: -30.5,
			},
			{
				...line,
				rowNumber: 14,
				documentNumber: "BH-02",
				productName: "Hàng của chứng từ khác",
			},
		],
	};
	vi.mocked(api).mockImplementation(
		async (_method, resource) =>
			receivablesView(
				resource,
				testBook,
				[customer, secondCustomer],
				emptyReceiptLedger,
			) as never,
	);
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	const select = async (label: string, value: string) => {
		const field = container.querySelector<HTMLSelectElement>(
			`select[aria-label="${label}"]`,
		);
		if (!field) throw new Error(`Thiếu bộ lọc ${label}`);
		await act(async () => {
			field.value = value;
			field.dispatchEvent(new Event("change", { bubbles: true }));
		});
	};
	try {
		await act(async () =>
			root.render(
				createElement(SalesReceivablesPage, {
					onOpenMisa: vi.fn(),
					onOpenCustomers: vi.fn(),
				}),
			),
		);
		const customerRows = () =>
			container.querySelector("table tbody")?.textContent;
		expect(customerRows()).toContain(secondCustomer.name);
		await select(
			"Lọc theo nhân viên phụ trách",
			customer.assignments[0].employeeId,
		);
		expect(customerRows()).toContain(customer.name);
		expect(customerRows()).not.toContain(secondCustomer.name);
		await select("Lọc theo khu vực", secondCustomer.province);
		expect(container.textContent).toContain(
			"Không tìm thấy khách hàng phù hợp",
		);
		await select("Lọc theo khu vực", customer.province);
		const customerLink = [...container.querySelectorAll("button")].find(
			(button) => button.textContent?.trim() === customer.name,
		);
		expect(customerLink).toBeDefined();
		await act(async () => customerLink?.click());
		const invoice = container.querySelector('[role="dialog"]');
		expect(invoice?.textContent).toContain("000020");
		expect(invoice?.textContent).toContain("BH-01");

		const invoiceRows = Array.from(invoice?.querySelectorAll("tbody tr") ?? []);
		const invoiceCell = invoiceRows
			.find((row) => row.textContent?.includes("BH-01"))
			?.querySelector("td:nth-child(2)");
		expect(invoiceCell?.textContent).toBe("000020");
		const invoiceLink = invoiceCell?.querySelector("button");
		expect(invoiceLink?.textContent).toBe("000020");
		await act(async () => {
			invoiceLink?.focus();
			invoiceLink?.click();
		});
		const invoiceDetails = container.querySelector(".invoice-lines-source");
		expect(invoiceDetails?.textContent).toContain("Ký hiệu 1C26TAD");
		expect(invoiceDetails?.textContent).toContain("Ngày hóa đơn 31/05/2026");
		const lines = () =>
			Array.from(
				container.querySelectorAll(
					'[aria-label="Dòng hàng của hóa đơn hoặc chứng từ"] tbody tr',
				),
				(row) =>
					Array.from(row.querySelectorAll("td"), (cell) => cell.textContent),
			);
		expect(lines()).toEqual([
			["Hàng A", "Hộp", "1", "100", "110"],
			["Hàng B", "Hộp", "2,5", "12,3456", "0"],
		]);
		const back = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "Quay lại danh sách",
		);
		await act(async () => back?.click());
		expect(lines()).toEqual([]);
		expect(document.activeElement).toBe(invoiceLink);
		const voucherLink = invoiceRows
			.find((row) => row.textContent?.includes("TL-01"))
			?.querySelector("button");
		expect(voucherLink?.textContent).toBe("TL-01");
		await act(async () => voucherLink?.click());
		expect(lines()).toEqual([["Hàng trả lại", "Hộp", "—", "—", "-30,5"]]);
	} finally {
		await act(async () => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	}
});
