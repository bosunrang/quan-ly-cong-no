import { api } from "../../shared/api/client";
import type { Customer } from "../customers/customer.model";
import type { SalesEmployee } from "../employees/employee.model";

export function createAssignments(
	customers: Customer[],
	employee: SalesEmployee,
	effectiveFrom: string,
) {
	return api<Customer[]>("POST", "assignments", {
		customers: customers.map(({ id, updatedAt }) => ({
			id,
			expected: updatedAt,
		})),
		employeeId: employee.id,
		employeeName: employee.name,
		effectiveFrom,
	});
}

export function endAssignment(
	id: string,
	customer: Customer,
	effectiveTo: string,
) {
	return api<Customer>("PATCH", `assignments/${encodeURIComponent(id)}`, {
		expected: customer.updatedAt,
		effectiveTo,
	});
}
