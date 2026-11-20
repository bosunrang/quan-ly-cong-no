import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { DashboardView } from "../src/domain/reports/view-types";
import { Dashboard } from "../src/features/dashboard/Dashboard";
import { api } from "../src/shared/api/client";

vi.mock("../src/shared/api/client", () => ({ api: vi.fn() }));

it("giữ ô tìm và bảng Dashboard trong lúc chờ kết quả, tìm từ trang đầu", async () => {
	const customer = {
		id: "hospital",
		name: "Bệnh viện Ánh Dương",
		customerCode: "BVAD",
		employeeName: "",
		province: "",
		remaining: 100,
		documentCount: 1,
	};
	const summary: DashboardView = {
		remaining: 100,
		periodReceived: 200,
		periodReversalCount: 0,
		receiptTrend: {
			daysPerBucket: 1,
			buckets: [
				{
					from: "2026-11-01",
					through: "2026-11-01",
					amount: 80,
					count: 1,
					reversals: 0,
				},
				{
					from: "2026-11-02",
					through: "2026-11-02",
					amount: 120,
					count: 1,
					reversals: 0,
				},
			],
		},
		unallocated: 0,
		unverifiedCount: 42,
		unmatchedCount: 3,
		salesRowCount: 13,
		hasVerifiedDocuments: true,
		receivablesCount: 13,
		periodCount: 2,
		unallocatedCount: 0,
		topDebtors: [customer],
		provinceOptions: ["Hà Nội", "TP Hồ Chí Minh"],
		rows: { items: [customer], total: 13, page: 1, limit: 10 },
	};
	let finishSearch!: (result: DashboardView) => void;
	const searchResult = new Promise<DashboardView>((resolve) => {
		finishSearch = resolve;
	});
	const requests = vi.mocked(api).mockImplementation((_method, resource) => {
		if (resource.startsWith("dashboard/customers?"))
			return Promise.resolve([customer]) as ReturnType<typeof api<never>>;
		if (resource === "employees") {
			return Promise.resolve([
				{ id: "e-one", name: "Nhân viên A", status: "active" },
			]) as ReturnType<typeof api<never>>;
		}
		const query = new URLSearchParams(resource.split("?")[1]);
		return (
			query.get("q")
				? searchResult
				: Promise.resolve({
						...summary,
						rows: { ...summary.rows, page: Number(query.get("page")) },
					})
		) as ReturnType<typeof api<never>>;
	});

	vi.useFakeTimers();
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	try {
		await act(async () =>
			root.render(createElement(Dashboard, { InvoiceDrawer: () => null })),
		);
		expect(
			[...container.querySelectorAll(".dashboard-filters label")].map(
				(label) => label.textContent,
			),
		).toEqual([
			"Từ ngày",
			"Đến ngày (ngày chốt)",
			"Khu vực",
			"Tìm nhanh khách hàng",
		]);
		expect(container.querySelector("#dashboard-employee")).toBeNull();
		await act(async () =>
			root.render(
				createElement(Dashboard, {
					showEmployeeFilter: true,
					InvoiceDrawer: ({ customer, asOfDate, employee, province }) =>
						createElement(
							"div",
							{ id: "test-invoice-drawer" },
							`${customer.name} · ${asOfDate} · ${employee} · ${province}`,
						),
				}),
			),
		);
		const employee = container.querySelector<HTMLSelectElement>(
			"#dashboard-employee",
		);
		if (!employee) throw new Error("Thiếu bộ lọc nhân viên của quản trị viên.");
		await act(async () => {
			employee.value = "e-one";
			employee.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(requests).toHaveBeenLastCalledWith(
			"GET",
			expect.stringContaining("employee=e-one"),
		);
		const province = container.querySelector<HTMLSelectElement>(
			"#dashboard-province",
		);
		if (!province) throw new Error("Thiếu bộ lọc khu vực.");
		await act(async () => {
			province.value = "Hà Nội";
			province.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(requests).toHaveBeenLastCalledWith(
			"GET",
			expect.stringContaining("employee=e-one&province=H%C3%A0+N%E1%BB%99i"),
		);
		const activePeriod = new URLSearchParams(
			requests.mock.lastCall?.[1].split("?")[1],
		);
		const quickSearch = container.querySelector<HTMLInputElement>(
			"#dashboard-quick-customer",
		);
		const setInput = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		if (!quickSearch || !setInput)
			throw new Error("Thiếu ô tìm nhanh khách hàng.");
		const overview = () =>
			[
				...container.querySelectorAll(
					".dashboard-metrics, .dashboard-insights",
				),
			].map((node) => node.textContent);
		const beforeSearch = overview();
		requests.mockClear();
		await act(async () => {
			quickSearch.focus();
			setInput.call(quickSearch, "BVAD");
			quickSearch.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await act(async () => vi.advanceTimersByTimeAsync(300));
		expect(requests.mock.calls).toEqual([
			[
				"GET",
				`dashboard/customers?from=${activePeriod.get("from")}&through=${activePeriod.get("through")}&employee=e-one&province=H%C3%A0+N%E1%BB%99i&q=BVAD`,
			],
		]);
		expect(document.querySelector('[role="option"]')?.textContent).toContain(
			customer.name,
		);
		await act(async () => {
			quickSearch.dispatchEvent(
				new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
			);
		});
		await act(async () => {
			quickSearch.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
			);
		});
		expect(container.querySelector("#test-invoice-drawer")?.textContent).toBe(
			`${customer.name} · ${activePeriod.get("through")} · e-one · Hà Nội`,
		);
		expect(quickSearch.value).toBe("");
		expect(overview()).toEqual(beforeSearch);
		expect(container.querySelector("#dashboard-details")).toBeNull();
		expect(container.textContent).not.toContain(
			"42 chứng từ chưa đủ điều kiện",
		);
		expect(
			container.querySelector(".dashboard-debtors")?.textContent,
		).toContain(customer.name);
		const firstBucket = container.querySelector<HTMLButtonElement>(
			".dashboard-trend-bars button",
		);
		await act(async () => firstBucket?.click());
		expect(
			container.querySelector(".dashboard-trend-readout strong")?.textContent,
		).toBe("80");
		const openDetails = container.querySelector<HTMLButtonElement>(
			".dashboard-metric-primary",
		);
		await act(async () => openDetails?.click());
		expect(container.querySelector(".dashboard-expanded")).not.toBeNull();
		expect(
			container.querySelector(".dashboard-overview[hidden]"),
		).not.toBeNull();
		expect(document.activeElement?.id).toBe("dashboard-details");
		expect(employee.value).toBe("e-one");
		expect(province.value).toBe("Hà Nội");
		const coverage = container.querySelector(
			"#dashboard-details #dashboard-detail-coverage",
		)?.textContent;
		expect(coverage).toContain("42 chứng từ chưa đủ điều kiện");
		expect(coverage).toContain("3 chứng từ có phân bổ chưa khớp sổ MISA");
		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('[aria-label="Trang Dashboard sau"]')
				?.click();
		});
		expect(requests).toHaveBeenLastCalledWith(
			"GET",
			expect.stringContaining("page=2"),
		);

		const field = container.querySelector<HTMLInputElement>(
			'input[type="search"]',
		);
		const setValue = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		if (!field || !setValue) throw new Error("Thiếu ô tìm khách hàng.");
		field.focus();
		requests.mockClear();
		for (const value of ["B", "BV", "BVAD"]) {
			await act(async () => {
				setValue.call(field, value);
				field.dispatchEvent(new Event("input", { bubbles: true }));
			});
			expect(document.activeElement).toBe(field);
		}
		expect(requests).not.toHaveBeenCalled();

		await act(async () => vi.advanceTimersByTimeAsync(300));
		expect(requests).toHaveBeenCalledTimes(1);
		expect(requests).toHaveBeenCalledWith(
			"GET",
			expect.stringContaining("q=BVAD&page=1"),
		);
		expect(document.activeElement).toBe(field);
		expect(container.querySelector("tbody")?.textContent).toContain(
			customer.name,
		);

		await act(async () =>
			finishSearch({ ...summary, rows: { ...summary.rows, total: 1 } }),
		);
		expect(
			container.querySelector(".dashboard-table-footer")?.textContent,
		).toContain("1–1 / 1 khách hàng");
		expect(document.activeElement).toBe(field);
		await act(async () => {
			Array.from(
				container.querySelectorAll<HTMLButtonElement>(
					"#dashboard-details button",
				),
			)
				.find((button) => button.textContent?.trim() === "Về tổng quan")
				?.click();
		});
		expect(container.querySelector(".dashboard-expanded")).toBeNull();
		expect(container.querySelector(".dashboard-overview[hidden]")).toBeNull();
		expect(container.querySelector("#dashboard-details")).toBeNull();
		expect(document.activeElement).toBe(openDetails);
		expect(
			container.querySelector(".dashboard-trend-readout strong")?.textContent,
		).toBe("80");
	} finally {
		await act(async () => root.unmount());
		container.remove();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	}
});
