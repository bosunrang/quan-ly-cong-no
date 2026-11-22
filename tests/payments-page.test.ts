import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { seedCustomers } from "./fixtures/seed-customers";
import {
	emptyReceiptLedger,
	getReceiptInvoiceSources,
	type Receipt,
	type ReceiptInvoice,
	recordReceipt,
} from "../src/domain/payments/receipt-ledger";
import { ApiError, api } from "../src/shared/api/client";
import { accountingChanged } from "../src/shared/hooks/useServerData";
import { PaymentsPage } from "../src/features/payments/PaymentsPage";
import { ReceiptAllocationDialog } from "../src/features/payments/ReceiptAllocationDialog";

vi.mock("../src/shared/api/client", async (importOriginal) => ({
	...(await importOriginal<typeof import("../src/shared/api/client")>()),
	api: vi.fn(),
}));

it("chỉ hiện khoản thu đã hủy khi chọn bộ lọc tương ứng", async () => {
	const receipt: Receipt = {
		id: "one",
		number: "PT001",
		date: "2024-06-01",
		createdAt: "2024-06-01T00:00:00.000Z",
		customerId: "customer",
		customerName: "Khách A",
		customerCode: "KH01",
		amount: 1000,
		reference: "",
	};
	const invoice: ReceiptInvoice = {
		id: "invoice-one",
		customerId: receipt.customerId,
		documentNumber: "BH01",
		invoiceNumber: "000187",
		invoiceSeries: "C24TAA",
		date: receipt.date,
		amount: 2000,
		sourceFile: "misa.xlsx",
	};

	let receipts: Receipt[] = [
		receipt,
		{
			...receipt,
			id: "two",
			number: "PT002",
			reversal: {
				date: "2024-06-02",
				createdAt: "2024-06-02T00:00:00.000Z",
				reason: "Nhập trùng",
			},
		},
	];
	let customers: typeof seedCustomers = [];
	let offline = false;
	vi.mocked(api).mockImplementation(async (_method, resource) => {
		if (offline) throw new ApiError("Không kết nối được máy chủ công nợ.", 0);
		if (resource === "customers") return customers as never;
		if (resource === "sales-book/status") return null as never;
		if (resource === "receipts/one")
			return {
				receipt,
				allocated: 1000,
				allocations: [
					{
						id: "allocation-one",
						receiptId: receipt.id,
						date: receipt.date,
						createdAt: receipt.createdAt,
						lines: [{ invoice, amount: 1000 }],
					},
				],
				allocatedInvoices: [
					{
						invoice,
						amount: 1000,
						lines: [
							{
								rowNumber: 8,
								productName: "Vật tư y tế",
								unit: "Hộp",
								quantity: 2,
								unitPrice: 1000,
								paymentTotal: 2000,
							},
						],
					},
				],
				hasInvoices: true,
				revision: "fixture",
				bookStamp: null,
			} as never;
		const status = new URLSearchParams(resource.split("?")[1]).get("status");
		const items = receipts
			.filter((one) => (status === "reversed" ? one.reversal : !one.reversal))
			.map((one) => ({
				receipt: one,
				remaining: one.reversal ? 0 : one.amount,
				state: one.reversal ? "reversed" : "open",
			}));
		return {
			items,
			total: items.length,
			count: receipts.length,
			page: 1,
			limit: 20,
		} as never;
	});

	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	let channel: EventTarget | undefined;
	const postMessage = vi.fn();
	vi.stubGlobal(
		"BroadcastChannel",
		class extends EventTarget {
			postMessage = postMessage;
			constructor() {
				super();
				channel = this;
			}
		},
	);
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);

	try {
		await act(async () =>
			root.render(createElement(PaymentsPage, { onOpenMisa: vi.fn() })),
		);
		const filter = container.querySelector("select");
		if (!filter) throw new Error("Thiếu bộ lọc khoản thu.");
		const receiptNumbers = () =>
			Array.from(
				container.querySelectorAll("tbody td:first-child button"),
				(button) => button.textContent?.trim(),
			);
		const selectStatus = (value: string) =>
			act(async () => {
				filter.value = value;
				filter.dispatchEvent(new Event("change", { bubbles: true }));
			});

		expect(filter.selectedOptions[0].textContent).toBe(
			"Khoản thu còn hiệu lực",
		);
		expect(receiptNumbers()).toEqual(["PT001"]);
		expect(container.querySelector("thead th:last-child")?.textContent).toBe(
			"Thao tác",
		);
		const detailButton = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Xem chi tiết khoản thu PT001"]',
		);
		expect(detailButton?.textContent).toBe("Xem chi tiết");
		await act(async () => detailButton?.click());
		expect(container.querySelector("#receipt-detail-title")?.textContent).toBe(
			"PT001",
		);
		const allocatedProducts = container.querySelector(
			'section[aria-labelledby="payment-allocated-invoices-title"]',
		);
		const allocationHistory = allocatedProducts?.nextElementSibling;
		expect(allocationHistory?.getAttribute("aria-label")).toBe(
			"Lịch sử phân bổ",
		);
		expect(
			allocationHistory?.querySelector(".payment-history-head strong"),
		).toBeNull();
		expect(allocationHistory?.querySelector("li strong")?.textContent).toBe(
			"1.000 đ",
		);
		expect(allocatedProducts?.querySelector("h3")?.textContent).toBe(
			"Mặt hàng trong hóa đơn đã phân bổ",
		);
		expect(allocatedProducts?.querySelector("h4")?.textContent).toBe(
			"HĐ C24TAA 000187 · BH01",
		);
		expect(allocatedProducts?.textContent).not.toContain("1.000 đ");
		expect(
			Array.from(
				allocatedProducts?.querySelectorAll("tbody td") ?? [],
				(cell) => cell.textContent,
			),
		).toEqual(["Vật tư y tế", "Hộp", "2", "1.000", "2.000"]);
		await act(async () =>
			container
				.querySelector<HTMLButtonElement>(".payment-detail-head .drawer-close")
				?.click(),
		);
		expect(container.querySelector("#receipt-detail-title")).toBeNull();
		await act(async () =>
			container
				.querySelector<HTMLButtonElement>("tbody td:first-child button")
				?.click(),
		);
		expect(container.querySelector("#receipt-detail-title")?.textContent).toBe(
			"PT001",
		);
		// Quay lại cửa sổ đúng lúc mất kết nối: giữ ngăn chi tiết và danh sách, chỉ báo lỗi.
		offline = true;
		await act(async () => window.dispatchEvent(new Event("focus")));
		expect(container.querySelector("#receipt-detail-title")?.textContent).toBe(
			"PT001",
		);
		expect(receiptNumbers()).toEqual(["PT001"]);
		expect(container.textContent).toContain(
			"Không kết nối được máy chủ công nợ.",
		);
		offline = false;
		await act(async () => window.dispatchEvent(new Event("focus")));
		expect(container.textContent).not.toContain(
			"Không kết nối được máy chủ công nợ.",
		);
		await act(async () =>
			container
				.querySelector<HTMLButtonElement>(".payment-detail-head .drawer-close")
				?.click(),
		);

		await selectStatus("reversed");
		expect(filter.selectedOptions[0].textContent).toBe("Đã hủy khoản thu");
		expect(receiptNumbers()).toEqual(["PT002"]);

		await selectStatus("active");
		expect(receiptNumbers()).toEqual(["PT001"]);

		const recordReceiptButton = Array.from(
			container.querySelectorAll("button"),
		).find((button) => button.textContent?.trim() === "Ghi khoản thu");
		expect(recordReceiptButton?.disabled).toBe(true);
		customers = [seedCustomers[0]];
		receipts = [receipt, { ...receipt, id: "three", number: "PT003" }];
		await act(async () => accountingChanged());
		expect(receiptNumbers()).toEqual(["PT001", "PT003"]);
		expect(recordReceiptButton?.disabled).toBe(false);
		expect(postMessage).toHaveBeenCalledOnce();

		customers = [];
		receipts = [];
		await act(async () => {
			channel?.dispatchEvent(new MessageEvent("message"));
		});
		expect(receiptNumbers()).toEqual([]);
		expect(recordReceiptButton?.disabled).toBe(true);
	} finally {
		await act(async () => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	}
});

it("giữ chứng từ mới nhất ở đầu khi có tham chiếu và khi điền nhóm khớp", async () => {
	const customer = seedCustomers[0];
	const ledger = recordReceipt(emptyReceiptLedger, customer, {
		number: "PT001",
		date: "2024-06-06",
		amount: 100,
		reference: "BH-100",
	});
	const receipt = ledger.receipts[0];
	const invoiceSources = getReceiptInvoiceSources(
		{
			fileName: "ban-hang.xlsx",
			importedAt: "2024-06-06T00:00:00.000Z",
			rows: [
				{ documentNumber: "BH-100", postingDate: "2024-06-04", total: 40 },
				{ documentNumber: "BH-9", postingDate: "2024-06-05", total: 60 },
				{ documentNumber: "BH-10", postingDate: "2024-06-05", total: 150 },
			].map(({ documentNumber, postingDate, total }, index) => ({
				rowNumber: index + 2,
				date: "2024-06-01",
				documentNumber,
				invoiceNumber: String(index + 1),
				customerName: customer.name,
				productName: "Hàng A",
				unit: "Hộp",
				quantity: 1,
				unitPrice: total,
				salesAmount: total,
				paymentTotal: total,
				source: {
					customerCode: customer.misaCode,
					invoiceSeries: "",
					invoiceDate: "",
					postingDate,
				},
			})),
		},
		receipt,
		[customer],
	);
	const rows = [...invoiceSources].reverse().map(({ invoice }) => ({
		invoice,
		remaining: invoice.amount,
		changed: false,
		suggested: invoice.documentNumber === "BH-100",
	}));
	vi.mocked(api).mockImplementation(async (_method, resource) => {
		if (resource.includes("/matches"))
			return {
				matches: [rows.slice(1)],
				unavailable: false,
				incomplete: false,
			} as never;
		return { items: rows, total: rows.length, page: 1, limit: 20 } as never;
	});

	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);

	try {
		await act(async () =>
			root.render(
				createElement(ReceiptAllocationDialog, {
					receipt,
					remaining: receipt.amount,
					busy: false,
					error: "",
					onClose: vi.fn(),
					onSave: vi.fn(),
				}),
			),
		);
		const vouchers = (tableName: string) =>
			Array.from(
				container.querySelectorAll(
					`table[aria-label="${tableName}"] tbody td:first-child button`,
				),
				(button) => button.textContent,
			);
		const main = "Chứng từ có thể phân bổ";
		expect(vouchers(main)).toEqual(["BH-10", "BH-9", "BH-100"]);
		expect(container.textContent).toContain("Khớp tham chiếu");

		const findMatches = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Tìm nhóm khớp số tiền",
		);
		await act(async () => findMatches?.click());
		expect(vouchers("Chứng từ trong nhóm gợi ý")).toEqual(["BH-9", "BH-100"]);
		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('button[aria-label="Điền nhóm 1"]')
				?.click();
		});
		expect(vouchers(main)).toEqual(["BH-10", "BH-9", "BH-100"]);
		expect(
			Array.from(
				container.querySelectorAll<HTMLInputElement>(".payment-amount"),
				(input) => input.value,
			),
		).toEqual(["", "60", "40"]);
	} finally {
		await act(async () => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	}
});
