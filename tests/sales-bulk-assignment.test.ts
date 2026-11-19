import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import App from "../src/app/App";
import type { Customer } from "../src/domain/customers/customer.model";
import {
	readCustomers,
	writeCustomers,
} from "../src/domain/customers/customer.repository";
import { writeSalesEmployees } from "../src/domain/employees/employee.repository";
import type { SalesEmployee } from "../src/domain/employees/employee.model";
import { readMisaSalesBook } from "../src/domain/misa/misa.sales-book.repository";

vi.mock("../src/domain/misa/misa.sales-book.repository", () => ({
	readMisaSalesBook: vi.fn(),
}));

it("giao cả khu vực qua nhiều trang và lọc công nợ theo người nhận", async () => {
	const date = "2025-01-01T00:00:00.000Z";
	const employee: SalesEmployee = {
		id: "EMP-A",
		code: "A",
		name: "Nhân viên A",
		phone: "",
		email: "",
		status: "active",
		createdAt: date,
	};
	const other = { ...employee, id: "EMP-B", code: "B", name: "Nhân viên B" };
	const customers: Customer[] = Array.from({ length: 32 }, (_, index) => ({
		id: `CUS-${index}`,
		misaCode: `MISA-${index}`,
		name: `Khách hàng ${index}`,
		province: index === 31 ? "Đà Nẵng" : "Hà Nội",
		status: index === 29 ? "paused" : "active",
		address: "",
		taxCode: "",
		group: "unknown",
		createdAt: date,
		updatedAt: date,
		assignments:
			index === 30
				? [
						{
							id: "ASN-EXISTING",
							employeeId: other.id,
							employeeName: other.name,
							province: "Hà Nội",
							source: "direct",
							effectiveFrom: date.slice(0, 10),
							effectiveTo: null,
						},
					]
				: [],
	}));
	const originalScroll = Object.getOwnPropertyDescriptor(
		HTMLElement.prototype,
		"scrollTo",
	);
	Object.defineProperty(HTMLElement.prototype, "scrollTo", {
		configurable: true,
		value: vi.fn(),
	});
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	window.localStorage.clear();
	writeCustomers(customers);
	writeSalesEmployees([employee, other]);
	vi.mocked(readMisaSalesBook).mockResolvedValue({
		fileName: "MISA.xlsx",
		importedAt: date,
		rows: customers.map(({ name, misaCode }, index) => ({
			rowNumber: index + 1,
			date: date.slice(0, 10),
			documentNumber: `BH-${index}`,
			invoiceNumber: `HD-${index}`,
			customerName: name,
			productName: "Hàng",
			unit: "Hộp",
			quantity: 1,
			unitPrice: 100,
			salesAmount: 100,
			paymentTotal: 100,
			source: { customerCode: misaCode, invoiceSeries: "", invoiceDate: "" },
		})),
	});
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	const button = (name: string) => {
		const element = [...container.querySelectorAll("button")].find(
			(item) =>
				(item.getAttribute("aria-label") ?? item.textContent?.trim()) === name,
		);
		if (!element) throw new Error(`Thiếu nút ${name}`);
		return element;
	};
	const click = async (name: string) => {
		await act(async () => button(name).click());
	};
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
		await act(async () => root.render(createElement(App)));
		await click("Nhân viên & khu vực");
		// Trang được tải riêng (React.lazy) nên chờ trang hiện ra.
		const selectAll = await vi.waitFor(async () => {
			await act(async () => undefined);
			const element = container.querySelector<HTMLInputElement>(
				'.pool-bulk-check input[type="checkbox"]',
			);
			if (!element) throw new Error("Thiếu ô chọn tất cả");
			return element;
		});
		expect(selectAll.disabled).toBe(true);
		await select("Chọn tỉnh thành", "Hà Nội");
		const firstCustomer = container.querySelector<HTMLInputElement>(
			'.customer-pool-list input[type="checkbox"]',
		);
		await act(async () => firstCustomer?.click());
		expect(selectAll.indeterminate).toBe(true);
		await act(async () => selectAll.click());
		expect(selectAll.checked).toBe(true);
		await click("Trang đơn vị sau");
		expect(
			container.querySelectorAll(".customer-pool-list input:checked"),
		).toHaveLength(4);
		await act(async () => selectAll.click());
		expect(selectAll.checked).toBe(false);
		expect(
			container.querySelectorAll(".customer-pool-list input:checked"),
		).toHaveLength(0);
		await act(async () => selectAll.click());
		await click("Giao cho Nhân viên A");
		expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
			"Giao 29 khách hàng",
		);
		await click("Xác nhận phân công");
		const saved = readCustomers();
		expect(
			saved
				.slice(0, 29)
				.every(
					(customer) => customer.assignments[0]?.employeeId === employee.id,
				),
		).toBe(true);
		expect(saved.slice(29)).toEqual(customers.slice(29));
		await click("Công nợ phải thu");
		await vi.waitFor(async () => {
			await act(async () => undefined);
			if (!container.querySelector('select[aria-label="Lọc theo nhân viên phụ trách"]'))
				throw new Error("Trang công nợ chưa hiện");
		});
		await select("Lọc theo nhân viên phụ trách", employee.id);
		expect(container.textContent).toContain("/ 29 khách hàng");
		expect(container.querySelector("tbody")?.textContent).not.toContain(
			other.name,
		);
	} finally {
		await act(async () => root.unmount());
		container.remove();
		window.localStorage.clear();
		if (originalScroll)
			Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScroll);
		else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
		vi.unstubAllGlobals();
	}
});
