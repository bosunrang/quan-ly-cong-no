import { describe, expect, it } from "vitest";
import type {
	Customer,
	CustomerDraft,
} from "../src/domain/customers/customer.model";
import { isCustomer } from "../src/domain/customers/customer.model";
import {
	createCustomerFromDraft,
	createCustomerFromImport,
	customerToDraft,
	updateCustomerFromDraft,
} from "../src/domain/customers/customer.service";

const baseDraft: CustomerDraft = {
	misaCode: " KH-001 ",
	name: " Khách hàng A ",
	group: "state",
	taxCode: " 0101 ",
	province: "Hà Nội",
	address: " Số 1 ",
	status: "active",
};

const existing: Customer = {
	id: "CUS-001",
	misaCode: "KH-001",
	name: "Khách hàng A",
	group: "state",
	taxCode: "0101",
	province: "Hà Nội",
	address: "Số 1",
	status: "active",
	assignments: [
		{
			id: "ASN-1",
			employeeId: "EMP-1",
			employeeName: "Nhân viên",
			province: "Hà Nội",
			source: "direct",
			effectiveFrom: "2026-01-01",
			effectiveTo: null,
		},
	],
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("customer service", () => {
	it("tạo draft mặc định và draft từ hồ sơ hiện có", () => {
		expect(customerToDraft()).toEqual({
			misaCode: "",
			name: "",
			group: "unknown",
			taxCode: "",
			province: "",
			address: "",
			status: "active",
		});
		expect(customerToDraft(existing)).toEqual({
			misaCode: "KH-001",
			name: "Khách hàng A",
			group: "state",
			taxCode: "0101",
			province: "Hà Nội",
			address: "Số 1",
			status: "active",
		});
	});

	it("tạo khách hàng thủ công và chuẩn hóa khoảng trắng", () => {
		const created = createCustomerFromDraft(baseDraft);
		expect(created).toMatchObject({
			misaCode: "KH-001",
			name: "Khách hàng A",
			taxCode: "0101",
			address: "Số 1",
			assignments: [],
		});
		expect(created).not.toHaveProperty("recipients");
		expect(isCustomer(created)).toBe(true);
	});

	it("tạo khách hàng nhập Excel và chuẩn hóa khoảng trắng", () => {
		const imported = createCustomerFromImport({
			misaCode: " KH-002 ",
			name: " Đơn vị B ",
			group: "private",
			province: " Hà Nội ",
			address: " Số 2 ",
		});
		expect(imported).toMatchObject({
			misaCode: "KH-002",
			name: "Đơn vị B",
			province: "Hà Nội",
			address: "Số 2",
			status: "active",
			assignments: [],
		});
		expect(isCustomer(imported)).toBe(true);
	});

	it("cập nhật hồ sơ nhưng giữ nguyên phân công", () => {
		const result = updateCustomerFromDraft(existing, {
			...baseDraft,
			name: " Tên mới ",
			status: "paused",
		});
		expect(result).toMatchObject({
			id: existing.id,
			name: "Tên mới",
			status: "paused",
			assignments: existing.assignments,
			createdAt: existing.createdAt,
		});
		expect(result.updatedAt).not.toBe(existing.updatedAt);
	});
});
