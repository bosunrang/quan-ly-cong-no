import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { seedCustomers } from "./fixtures/seed-customers";
import {
	emptyReceiptLedger,
	getReceiptInvoiceSources,
	type Receipt,
	recordReceipt,
} from "../src/domain/payments/receipt-ledger";
import { api } from "../src/shared/api/client";
import { accountingChanged } from "../src/shared/hooks/useServerData";
import { PaymentsPage } from "../src/features/payments/PaymentsPage";
import { ReceiptAllocationDialog } from "../src/features/payments/ReceiptAllocationDialog";

vi.mock("../src/shared/api/client", () => ({ api: vi.fn() }));

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
	vi.mocked(api).mockImplementation(async (_method, resource) => {
		if (resource === "customers") return [] as never;
		if (resource === "sales-book/status") return null as never;
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
			Array.from(container.querySelectorAll("tbody button"), (button) =>
				button.textContent?.trim(),
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

		await selectStatus("reversed");
		expect(filter.selectedOptions[0].textContent).toBe("Đã hủy khoản thu");
		expect(receiptNumbers()).toEqual(["PT002"]);

		await selectStatus("active");
		expect(receiptNumbers()).toEqual(["PT001"]);

		receipts = [receipt, { ...receipt, id: "three", number: "PT003" }];
		await act(async () => accountingChanged());
		expect(receiptNumbers()).toEqual(["PT001", "PT003"]);
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
