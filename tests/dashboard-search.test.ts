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
		periodReceived: 0,
		unallocated: 0,
		unverifiedCount: 0,
		unmatchedCount: 0,
		salesRowCount: 13,
		hasVerifiedDocuments: true,
		receivablesCount: 13,
		periodCount: 0,
		unallocatedCount: 0,
		rows: { items: [customer], total: 13, page: 1, limit: 10 },
	};
	let finishSearch!: (result: DashboardView) => void;
	const searchResult = new Promise<DashboardView>((resolve) => {
		finishSearch = resolve;
	});
	const requests = vi.mocked(api).mockImplementation((_method, resource) => {
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
	} finally {
		await act(async () => root.unmount());
		container.remove();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	}
});
