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

it("hiện nhân viên phụ trách và lọc toàn bộ khoản thu, về trang đầu khi đổi nhân viên", async () => {
	vi.stubGlobal("BroadcastChannel", undefined);
	const rows = Array.from({ length: 40 }, (_, index) => ({
		receipt: {
			id: `receipt-${index}`,
			number: `PT${String(index).padStart(3, "0")}`,
			date: "2026-06-01",
			createdAt: "2026-06-01T00:00:00.000Z",
			customerId: seedCustomers[0].id,
			customerName: seedCustomers[0].name,
			customerCode: seedCustomers[0].misaCode,
			amount: 1000,
			reference: "",
		},
		remaining: 1000,
		state: "open",
		employeeId: index === 39 ? "NV-2" : index === 38 ? "" : "NV-1",
		employeeName: index === 39 ? "Bình" : index === 38 ? "" : "An",
	}));
	const requests: URLSearchParams[] = [];
	vi.mocked(api).mockImplementation(async (_method, resource) => {
		if (resource === "customers") return seedCustomers as never;
		if (resource === "sales-book/status") return null as never;
		const query = new URLSearchParams(resource.split("?")[1]);
		requests.push(query);
		const employee = query.get("employee");
		const filtered = rows.filter(
			(row) =>
				(!employee || (row.employeeId || "?") === employee) &&
				row.receipt.number.includes(query.get("q") ?? "") &&
				["active", "open"].includes(query.get("status") ?? "active"),
		);
		const page = Math.min(
			Number(query.get("page") ?? 1),
			Math.max(1, Math.ceil(filtered.length / 20)),
		);
		return {
			items: filtered.slice((page - 1) * 20, page * 20),
			total: filtered.length,
			count: rows.length,
			page,
			limit: 20,
			employees: [
				["NV-1", "An"],
				["NV-2", "Bình"],
			],
		} as never;
	});
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
			root.render(createElement(PaymentsPage, { showEmployeeFilter: true })),
		);
		expect(
			container.querySelector("thead .payment-employee-column")?.textContent,
		).toBe("Nhân viên phụ trách");
		expect(
			container.querySelector("tbody .payment-employee-column")?.textContent,
		).toBe("An");
		await select("Trạng thái phân bổ", "open");
		const search = container.querySelector<HTMLInputElement>(
			'input[aria-label="Tìm khoản thu"]',
		);
		await act(async () => {
			Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				"value",
			)?.set?.call(search, "PT");
			search?.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await act(async () =>
			container
				.querySelector<HTMLButtonElement>(
					'button[aria-label="Trang khoản thu sau"]',
				)
				?.click(),
		);
		expect(requests.at(-1)?.get("page")).toBe("2");
		await select("Lọc theo nhân viên phụ trách", "NV-2");
		expect(requests.at(-1)?.get("page")).toBe("1");
		expect(requests.at(-1)?.get("status")).toBe("open");
		expect(requests.at(-1)?.get("q")).toBe("PT");
		expect(
			container.querySelector("tbody .payment-employee-column")?.textContent,
		).toBe("Bình");
		expect(container.querySelector("tbody")?.textContent).toContain("PT039");
		expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
		await select("Lọc theo nhân viên phụ trách", "?");
		expect(
			container.querySelector("tbody .payment-employee-column")?.textContent,
		).toBe("Chưa phân công");
		await select("Lọc theo nhân viên phụ trách", "");
		expect(container.querySelectorAll("tbody tr")).toHaveLength(20);
		await act(async () =>
			root.render(createElement(PaymentsPage, { showEmployeeFilter: false })),
		);
		expect(
			container.querySelector(
				'select[aria-label="Lọc theo nhân viên phụ trách"]',
			),
		).toBeNull();
		expect(requests.at(-1)?.has("employee")).toBe(false);
	} finally {
		await act(async () => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	}
});

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
	const candidate = (documentNumber: string, remaining: number) => ({
		...rows[0],
		invoice: {
			...rows[0].invoice,
			id: documentNumber,
			documentNumber,
			amount: remaining,
		},
		remaining,
	});
	const [first, second] = [candidate("BH-DU-1", 55), candidate("BH-DU-2", 3)];
	const short = candidate("BH-THIEU", 103);
	const nearMatches = [
		{
			difference: 2,
			lines: [first, second, rows[2]].map((item) => ({
				...item,
				amount: item.remaining,
			})),
		},
		{ difference: -3, lines: [{ ...short, amount: 100 }] },
	];
	vi.mocked(api).mockImplementation(async (_method, resource) => {
		if (resource.includes("/matches"))
			return {
				matches: [rows.slice(1)],
				nearMatches,
				unavailable: false,
				incomplete: false,
			} as never;
		const query = new URLSearchParams(resource.split("?")[1]).get("q");
		const items = [...rows, first, second, short].filter(
			({ invoice }) => !query || invoice.documentNumber === query,
		);
		return { items, total: items.length, page: 1, limit: 20 } as never;
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
		const allVouchers = [
			"BH-10",
			"BH-9",
			"BH-100",
			"BH-DU-1",
			"BH-DU-2",
			"BH-THIEU",
		];
		expect(vouchers(main)).toEqual(allVouchers);
		expect(container.textContent).toContain("Khớp tham chiếu");

		const findMatches = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Gợi ý theo số tiền",
		);
		await act(async () => findMatches?.click());
		expect(vouchers("Chứng từ trong nhóm gợi ý")).toEqual(["BH-9", "BH-100"]);
		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('button[aria-label="Điền nhóm 1"]')
				?.click();
		});
		expect(vouchers(main)).toEqual(allVouchers);
		const allocationValues = () =>
			Array.from(
				container.querySelectorAll<HTMLInputElement>(".payment-amount"),
				(input) => input.value,
			);
		expect(allocationValues()).toEqual(["", "60", "40", "", "", ""]);
		const nearHeading = container.querySelector(".payment-near-match-head");
		const nearOptions = nearHeading?.querySelector<HTMLSelectElement>(
			'select[aria-label="Chọn gợi ý gần khớp"]',
		);
		if (!nearOptions) throw new Error("Thiếu lựa chọn nhóm gần khớp");
		expect(nearOptions.selectedOptions[0]?.textContent).toContain("Dư 2 đ");
		expect(nearHeading?.querySelector(".status-pill")).toBeNull();
		expect(vouchers("Chứng từ gần khớp số tiền")).toHaveLength(3);
		const confirmation = container.querySelector<HTMLButtonElement>(
			'button[type="submit"]',
		);
		await act(async () =>
			container
				.querySelector<HTMLInputElement>("footer .payment-verify input")
				?.click(),
		);
		expect(confirmation?.disabled).toBe(false);
		const fillNearGroup = () =>
			act(async () =>
				nearHeading
					?.querySelector<HTMLButtonElement>(
						'button[aria-label="Thay số đã nhập bằng gợi ý gần khớp"]',
					)
					?.click(),
			);
		await fillNearGroup();
		expect(allocationValues()).toEqual(["", "", "40", "55", "3", ""]);
		expect(confirmation?.disabled).toBe(true);
		await act(async () => {
			nearOptions.value = "1";
			nearOptions.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(nearOptions.selectedOptions[0]?.textContent).toContain("Thiếu 3 đ");
		await fillNearGroup();
		expect(vouchers(main)).toEqual(["BH-THIEU"]);
		expect(allocationValues()).toEqual(["100"]);
	} finally {
		await act(async () => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	}
});

it("lưu lại sau khi mất phản hồi: mở khoản thu đã ghi ở lần trước thay vì kẹt ở lỗi 409", async () => {
	const customer = seedCustomers[0];
	const saved: Receipt = {
		id: "",
		number: "PT009",
		date: "2024-06-01",
		createdAt: "2024-06-01T00:00:00.000Z",
		customerId: customer.id,
		customerName: customer.name,
		customerCode: customer.misaCode,
		amount: 1000,
		reference: "",
	};
	let recorded = false;
	let posted: { id: string; amount: number }[] = [];
	let pendingList: ((value: never) => void) | undefined;
	vi.mocked(api).mockImplementation(async (method, resource, body) => {
		if (resource === "customers") return [customer] as never;
		if (resource === "sales-book/status") return null as never;
		if (resource.startsWith("receipts/next-number")) return "PT009" as never;
		if (resource.startsWith("receipts/similar")) return [] as never;
		if (method === "POST" && resource === "receipts") {
			const draft = body as { id: string; amount: number };
			posted = [...posted, draft];
			// Lần đầu: máy chủ đã ghi nhưng phản hồi bị mất. Lần sau (đã sửa số tiền): 409.
			if (!recorded) {
				recorded = true;
				saved.id = draft.id;
				throw new ApiError("Không kết nối được máy chủ công nợ.", 0);
			}
			throw new ApiError("Mã khoản thu đã được dùng cho khoản thu khác.", 409);
		}
		if (resource.startsWith("receipts/")) {
			// Lần lưu đầu vẫn mất kết nối khi đọc lại; sau đó đọc được khoản thu đã ghi.
			if (posted.length < 2)
				throw new ApiError("Không kết nối được máy chủ công nợ.", 0);
			return {
				receipt: saved,
				allocated: 0,
				allocations: [],
				allocatedInvoices: [],
				hasInvoices: false,
				revision: "fixture",
				bookStamp: null,
			} as never;
		}
		const status = new URLSearchParams(resource.split("?")[1]).get("status");
		if (status === "reversed")
			return new Promise((resolve) => {
				pendingList = resolve;
			});
		const items = recorded
			? [{ receipt: saved, remaining: saved.amount, state: "open" }]
			: [];
		return {
			items,
			total: items.length,
			count: items.length,
			page: 1,
			limit: 20,
		} as never;
	});
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	const type = (input: HTMLInputElement | null | undefined, value: string) => {
		if (!input) throw new Error("Thiếu ô nhập.");
		Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	};
	const amountInput = () =>
		Array.from(document.querySelectorAll(".receipt-form-dialog label"))
			.find((label) => label.textContent?.startsWith("Số tiền thu"))
			?.querySelector("input");
	const button = (text: string) =>
		Array.from(document.querySelectorAll("button")).find(
			(item) => item.textContent?.trim() === text,
		);

	try {
		await act(async () => root.render(createElement(PaymentsPage, {})));
		await act(async () => button("Ghi khoản thu")?.click());
		const dialog = document.querySelector(".receipt-form-dialog");
		const label = [customer.misaCode, customer.name, customer.taxCode]
			.filter(Boolean)
			.join(" · ");
		await act(async () => {
			type(dialog?.querySelector<HTMLInputElement>('[role="combobox"]'), label);
			type(amountInput(), "1.000");
		});
		await act(async () => button("Lưu khoản thu")?.click());
		// Chưa biết khoản thu đã ghi hay chưa: giữ hộp thoại và báo lỗi kết nối.
		expect(
			document.querySelector(".receipt-form-dialog")?.textContent,
		).toContain("Không kết nối được máy chủ công nợ.");

		await act(async () => type(amountInput(), "2.000"));
		await act(async () => button("Lưu khoản thu")?.click());
		expect(posted.map(({ id, amount }) => [id, amount])).toEqual([
			[saved.id, 1000],
			[saved.id, 2000],
		]);
		expect(document.querySelector(".receipt-form-dialog")).toBeNull();
		expect(container.querySelector("#receipt-detail-title")?.textContent).toBe(
			"PT009",
		);
		expect(container.textContent).toContain(
			"Khoản thu PT009 đã được ghi ở lần lưu trước: 1.000 đ",
		);
		expect(
			Array.from(
				container.querySelectorAll("tbody td:first-child button"),
				(item) => item.textContent?.trim(),
			),
		).toEqual(["PT009"]);

		// Đổi bộ lọc: giữ bảng đang xem trong lúc chờ, không nháy về "Chưa ghi khoản thu nào".
		await act(async () =>
			container
				.querySelector<HTMLButtonElement>(".payment-detail-head .drawer-close")
				?.click(),
		);
		const filter = container.querySelector("select");
		await act(async () => {
			if (!filter) return;
			filter.value = "reversed";
			filter.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(container.textContent).not.toContain("Chưa ghi khoản thu nào.");
		expect(container.querySelector("tbody")?.textContent).toContain("PT009");
		await act(async () =>
			pendingList?.({
				items: [],
				total: 0,
				count: 1,
				page: 1,
				limit: 20,
			} as never),
		);
		expect(container.querySelector("tbody")?.textContent).toContain(
			"Không có khoản thu theo bộ lọc.",
		);
	} finally {
		await act(async () => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	}
});

it("cảnh báo khoản thu cùng khách, cùng số tiền và chỉ lưu khi đã xác nhận không trùng", async () => {
	const customer = seedCustomers[0];
	const posts: unknown[] = [];
	const similarQueries: URLSearchParams[] = [];
	vi.mocked(api).mockImplementation(async (method, resource, body) => {
		if (resource === "customers") return [customer] as never;
		if (resource === "sales-book/status") return null as never;
		if (resource.startsWith("receipts/next-number"))
			return "PT-2026-0010" as never;
		if (resource.startsWith("receipts/similar")) {
			const query = new URLSearchParams(resource.split("?")[1]);
			similarQueries.push(query);
			return (
				query.get("amount") === "4704000"
					? [
							{
								id: "old",
								number: "PT-2026-0004",
								date: "2026-08-30",
								amount: 4_704_000,
								reference: "00187",
							},
						]
					: []
			) as never;
		}
		if (method === "POST" && resource === "receipts") {
			posts.push(body);
			return "revision" as never;
		}
		return { items: [], total: 0, count: 0, page: 1, limit: 20 } as never;
	});
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	const type = (input: HTMLInputElement | null | undefined, value: string) => {
		if (!input) throw new Error("Thiếu ô nhập.");
		Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	};
	const field = (text: string) =>
		Array.from(document.querySelectorAll(".receipt-form-dialog label"))
			.find((label) => label.textContent?.startsWith(text))
			?.querySelector("input");
	const button = (text: string) =>
		Array.from(document.querySelectorAll("button")).find(
			(item) => item.textContent?.trim() === text,
		);
	const dialog = () => document.querySelector(".receipt-form-dialog");
	const confirm = () =>
		dialog()?.querySelector<HTMLInputElement>(".payment-verify input");

	try {
		await act(async () => root.render(createElement(PaymentsPage, {})));
		await act(async () => button("Ghi khoản thu")?.click());
		const label = [customer.misaCode, customer.name, customer.taxCode]
			.filter(Boolean)
			.join(" · ");
		await act(async () => {
			type(
				dialog()?.querySelector<HTMLInputElement>('[role="combobox"]'),
				label,
			);
			type(field("Số tiền thu"), "4.704.000");
		});
		const warning = dialog()?.textContent ?? "";
		expect(warning).toContain("Có thể ghi trùng khoản thu");
		expect(warning).toContain(
			"PT-2026-0004 · ngày 30/08/2026 · 4.704.000 đ · tham chiếu 00187",
		);
		expect(similarQueries.at(-1)?.get("customerId")).toBe(customer.id);
		expect(similarQueries.at(-1)?.get("exclude")).toBeTruthy();

		// Chưa xác nhận: không gửi, nhắc kiểm tra.
		await act(async () => button("Lưu khoản thu")?.click());
		expect(posts).toEqual([]);
		expect(dialog()?.textContent).toContain("tích xác nhận rồi lưu lại");

		// Xác nhận rồi đổi số tiền sang số khác trùng: phải xác nhận lại.
		await act(async () => confirm()?.click());
		expect(confirm()?.checked).toBe(true);
		await act(async () => type(field("Số tiền thu"), "1.000"));
		expect(dialog()?.textContent).not.toContain("Có thể ghi trùng khoản thu");
		await act(async () => type(field("Số tiền thu"), "4.704.000"));
		expect(confirm()?.checked).toBe(false);

		await act(async () => confirm()?.click());
		await act(async () => button("Lưu khoản thu")?.click());
		expect(posts).toEqual([
			expect.objectContaining({ amount: 4_704_000, allowDuplicate: true }),
		]);
		expect(dialog()).toBeNull();
	} finally {
		await act(async () => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	}
});
