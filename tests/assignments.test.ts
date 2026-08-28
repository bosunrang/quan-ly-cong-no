import { describe, expect, it } from "vitest";
import {
	assignCustomers,
	endEmployeeAssignments,
	unassignCustomer,
} from "../src/domain/assignments/assignment.service";
import type { Customer } from "../src/domain/customers/customer.model";
import type { SalesEmployee } from "../src/domain/employees/employee.model";

const employee: SalesEmployee = {
	id: "NV-002",
	code: "NVKD-002",
	name: "Nhân viên mới",
	phone: "",
	email: "",
	status: "active",
	createdAt: "2026-01-01T00:00:00.000Z",
};

function customer(): Customer {
	return {
		id: "CUS-001",
		misaCode: "KH-001",
		name: "Khách hàng A",
		group: "state",
		taxCode: "",
		province: "Hà Nội",
		address: "",
		status: "active",
		assignments: [
			{
				id: "ASN-HISTORY",
				employeeId: "NV-000",
				employeeName: "Nhân viên cũ hơn",
				province: "Hà Nội",
				source: "direct",
				effectiveFrom: "2025-01-01",
				effectiveTo: "2025-12-31",
			},
			{
				id: "ASN-ACTIVE",
				employeeId: "NV-001",
				employeeName: "Nhân viên cũ",
				province: "Hà Nội",
				source: "direct",
				effectiveFrom: "2026-01-01",
				effectiveTo: null,
			},
		],
		recipients: [],
		createdAt: "2025-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

describe("assignment service", () => {
	it("đóng lượt hiện tại và giữ lịch sử khi chuyển giao", () => {
		const [result] = assignCustomers(
			[customer()],
			["CUS-001"],
			employee,
			"2026-03-01",
		);

		expect(result.assignments).toHaveLength(3);
		expect(result.assignments[0]).toMatchObject({
			id: "ASN-HISTORY",
			effectiveTo: "2025-12-31",
		});
		expect(result.assignments[1]).toMatchObject({
			id: "ASN-ACTIVE",
			effectiveTo: "2026-02-28",
		});
		expect(result.assignments[2]).toMatchObject({
			employeeId: "NV-002",
			employeeName: "Nhân viên mới",
			effectiveFrom: "2026-03-01",
			effectiveTo: null,
		});
	});

	it("không tạo lượt mới nếu nhân viên đã đang phụ trách", () => {
		const current = customer();
		const sameEmployee = { ...employee, id: "NV-001" };
		const [result] = assignCustomers(
			[current],
			["CUS-001"],
			sameEmployee,
			"2026-03-01",
		);

		expect(result).toBe(current);
		expect(result.assignments).toHaveLength(2);
	});

	it("ngừng nhân viên bằng cách đóng lượt hoạt động, không xóa lịch sử", () => {
		const [result] = endEmployeeAssignments(
			[customer()],
			"NV-001",
			"2026-04-30",
		);

		expect(result.assignments).toHaveLength(2);
		expect(result.assignments[0].effectiveTo).toBe("2025-12-31");
		expect(result.assignments[1].effectiveTo).toBe("2026-04-30");
	});

	it("chỉ bỏ phân công khi đúng khách hàng và nhân viên hiện tại", () => {
		const current = customer();
		const [unchanged] = unassignCustomer(
			[current],
			"CUS-001",
			"NV-999",
			"2026-04-30",
		);
		const [ended] = unassignCustomer(
			[current],
			"CUS-001",
			"NV-001",
			"2026-04-30",
		);

		expect(unchanged).toBe(current);
		expect(ended.assignments[1].effectiveTo).toBe("2026-04-30");
	});
});
