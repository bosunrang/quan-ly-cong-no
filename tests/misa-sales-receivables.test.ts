import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { seedCustomers } from "./fixtures/seed-customers";
import type { MisaSalesLine } from "../src/domain/misa/misa.sales-book";
import { buildSalesReceivables } from "../src/domain/misa/misa.sales-receivables";
import {
	invoiceAging,
	invoiceDueDateFromTerm,
} from "../src/domain/payments/receivable-aging";
import { projectReceiptReceivables } from "../src/domain/payments/receipt-receivables";
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
import { InvoiceDueDateDialog } from "../src/features/receivables/InvoiceDueDateDialog";

vi.mock("../src/shared/api/client", async (importOriginal) => ({
	...(await importOriginal<typeof import("../src/shared/api/client")>()),
	api: vi.fn(),
}));

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

it("chọn kỳ hạn nhanh để tự điền và lưu hạn thanh toán", async () => {
	const groups = buildSalesReceivables(
		[
			{
				...line,
				source: {
					customerCode: customer.misaCode,
					invoiceSeries: "A",
					invoiceDate: "2026-05-31",
				},
			},
		],
		[customer],
		[],
	);
	const [invoice] = projectReceiptReceivables(
		groups,
		"sổ.xlsx",
		emptyReceiptLedger,
	).customers[0].documents;
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	const onClose = vi.fn();
	const resource = "receivables/customer/invoices/invoice/due-date";
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	vi.mocked(api).mockResolvedValueOnce(true);
	try {
		await act(async () =>
			root.render(
				createElement(InvoiceDueDateDialog, { invoice, resource, onClose }),
			),
		);
		const options = [
			...container.querySelectorAll<HTMLButtonElement>(
				".invoice-term-options button",
			),
		];
		expect(options.map((button) => button.textContent)).toEqual([
			"30 ngày",
			"45 ngày",
			"60 ngày",
			"90 ngày",
			"120 ngày",
		]);
		await act(async () => options[1].click());
		expect(options[1].getAttribute("aria-pressed")).toBe("true");
		const dateInput = container.querySelector<HTMLInputElement>(
			'input[aria-label="Hạn thanh toán"]',
		);
		expect(dateInput?.value).toBe("15/07/2026");
		expect(dateInput?.placeholder).toBe("dd/mm/yyyy");
		await act(async () =>
			container
				.querySelector<HTMLButtonElement>('button[aria-label="Chọn ngày"]')
				?.click(),
		);
		const calendar = document.querySelector(
			'.vn-date-picker[aria-label="Chọn ngày"]',
		);
		expect(
			calendar?.querySelector(".vn-date-grid .selected")?.textContent,
		).toBe("15");
		const day = Array.from(
			calendar?.querySelectorAll<HTMLButtonElement>(".vn-date-grid button") ??
				[],
		).find((button) => button.textContent === "18");
		expect(day).toBeDefined();
		await act(async () => day?.click());
		expect(dateInput?.value).toBe("18/07/2026");
		await act(async () =>
			container
				.querySelector<HTMLButtonElement>('button[type="submit"]')
				?.click(),
		);
		expect(api).toHaveBeenLastCalledWith("PATCH", resource, {
			dueDate: "2026-07-18",
			expected: null,
		});
		expect(onClose).toHaveBeenCalledTimes(1);
	} finally {
		await act(async () => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	}
});

it("tính tuổi nợ theo hạn kể từ ngày hóa đơn và loại khoản đã thu đủ", () => {
	expect(
		invoiceDueDateFromTerm({ invoiceDate: "", firstDate: "2026-06-01" }, 120),
	).toBe("2026-09-29");
	const groups = buildSalesReceivables(
		[
			{
				...line,
				source: {
					customerCode: customer.misaCode,
					invoiceSeries: "A",
					invoiceDate: "2026-05-31",
				},
			},
		],
		[customer],
		[],
	);
	const [document] = projectReceiptReceivables(
		groups,
		"sổ.xlsx",
		emptyReceiptLedger,
	).customers[0].documents;
	expect(invoiceAging(document, 30, undefined, "2026-06-30")).toMatchObject({
		dueDate: "2026-06-30",
		daysOverdue: 0,
		bucket: "current",
	});
	for (const [asOf, daysOverdue, bucket] of [
		["2026-07-01", 1, "1-30"],
		["2026-07-30", 30, "1-30"],
		["2026-07-31", 31, "31-60"],
		["2026-08-29", 60, "31-60"],
		["2026-08-30", 61, "61-90"],
		["2026-09-28", 90, "61-90"],
		["2026-09-29", 91, "90+"],
	] as const) {
		expect(invoiceAging(document, 30, undefined, asOf)).toMatchObject({
			daysOverdue,
			bucket,
		});
	}
	const paid = {
		...document,
		balance: { received: 110, remaining: 0, allocations: [] },
	};
	expect(invoiceAging(paid, 30, undefined, "2026-09-29")).toMatchObject({
		dueDate: "2026-06-30",
		daysOverdue: null,
		bucket: null,
	});
});

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
					showEmployeeFilter: false,
					onOpenMisa: vi.fn(),
					onOpenCustomers: vi.fn(),
				}),
			),
		);
		expect(
			container.querySelector(
				'select[aria-label="Lọc theo nhân viên phụ trách"]',
			),
		).toBeNull();
		expect(
			container.querySelector('select[aria-label="Lọc theo khu vực"]'),
		).not.toBeNull();
		const tableBalances = (table: string) =>
			amounts(`${table} tbody td:nth-child(5), ${table} tbody td:nth-child(6)`);
		expect(
			container.querySelector(".receivable-table thead")?.textContent,
		).not.toContain("Hóa đơn có số");
		expect(
			container.querySelector(".receivable-table .status-pill"),
		).toBeNull();
		expect(tableBalances(".receivable-table")).toEqual(["0", "110"]);
		await click(".receivable-customer-link");
		expect(
			container.querySelector(".receivable-invoice-meta")?.textContent,
		).toBe("1 hóa đơn có số");
		await click(".receivable-invoice-link");
		expect(amounts(".invoice-lines-balances dd")).toEqual(["0", "110"]);

		currentLedger = booked;
		await act(async () => {
			refresh();
		});
		expect(tableBalances(".receivable-table")).toEqual(["25", "85"]);
		expect(tableBalances(".receivable-invoice-table")).toEqual(["25", "85"]);
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
				[{ ...customer, paymentTermDays: 0 }, secondCustomer],
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
	const ageCard = (label: string) => {
		const button = [
			...container.querySelectorAll<HTMLButtonElement>(
				".receivable-aging-card",
			),
		].find((item) => item.firstElementChild?.textContent === label);
		if (!button) throw new Error(`Thiếu thẻ ${label}`);
		return button;
	};
	try {
		await act(async () =>
			root.render(
				createElement(SalesReceivablesPage, {
					showEmployeeFilter: true,
					onOpenMisa: vi.fn(),
					onOpenCustomers: vi.fn(),
				}),
			),
		);
		const customerRows = () =>
			container.querySelector("table tbody")?.textContent;
		expect(customerRows()).toContain(secondCustomer.name);
		const allCard = ageCard("Tất cả");
		const totalOverdue = ageCard("Nợ quá hạn");
		const overdueGroups = container.querySelector("#receivable-overdue-groups");
		expect(totalOverdue.getAttribute("aria-expanded")).toBe("false");
		expect(overdueGroups?.querySelectorAll("button")).toHaveLength(0);
		expect(allCard.textContent).toContain("2 khách hàng");
		expect(ageCard("Chưa có hạn").textContent).toContain(
			"có hóa đơn chưa đặt hạn",
		);
		expect(
			container.querySelector(".receivable-aging-head > span")?.textContent,
		).toBe("Tính đến 01/06/2026");
		expect(container.querySelector(".receivable-aging > p")).toBeNull();
		await act(async () => totalOverdue.click());
		expect(totalOverdue.getAttribute("aria-expanded")).toBe("true");
		expect(overdueGroups?.querySelectorAll("button")).toHaveLength(4);
		const overdueCard = ageCard("Quá hạn 1–30 ngày");
		expect(overdueCard.textContent).toContain("1 khách hàng");
		// Thẻ hiện số tiền làm số chính; "Nợ quá hạn" gom mọi nhóm quá hạn.
		expect(totalOverdue.querySelector("strong")?.textContent).toBe(
			overdueCard.querySelector("strong")?.textContent,
		);
		expect(totalOverdue.textContent).toContain("1 khách hàng");
		expect(ageCard("Chưa quá hạn").textContent).toContain("khách hàng");
		await act(async () => overdueCard.click());
		expect(overdueCard.getAttribute("aria-pressed")).toBe("true");
		expect(totalOverdue.getAttribute("aria-expanded")).toBe("true");
		expect(customerRows()).toContain(customer.name);
		expect(customerRows()).not.toContain(secondCustomer.name);
		await act(async () => allCard.click());
		expect(allCard.getAttribute("aria-pressed")).toBe("true");
		expect(totalOverdue.getAttribute("aria-expanded")).toBe("false");
		expect(overdueGroups?.querySelectorAll("button")).toHaveLength(0);
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
		await act(async () => totalOverdue.click());
		await act(async () => ageCard("Quá hạn 1–30 ngày").click());
		expect(api).toHaveBeenLastCalledWith(
			"GET",
			expect.stringContaining("aging=1-30"),
		);
		const customerLink = [...container.querySelectorAll("button")].find(
			(button) => button.textContent?.trim() === customer.name,
		);
		expect(customerLink).toBeDefined();
		await act(async () => customerLink?.click());
		expect(api).toHaveBeenLastCalledWith(
			"GET",
			expect.stringContaining("invoices?aging=1-30"),
		);
		const invoice = container.querySelector('[role="dialog"]');
		expect(invoice?.textContent).toContain("Hạn thanh toán");
		expect(invoice?.textContent).toContain("Số ngày quá hạn");
		expect(invoice?.querySelector("thead")?.textContent).not.toContain(
			"Dòng hàng",
		);
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
