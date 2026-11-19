import { api } from "../../shared/api/client";
import type { Customer } from "../customers/customer.model";
import type { SalesEmployee } from "./employee.model";

export function readSalesEmployees() {
	return api<SalesEmployee[]>("GET", "employees");
}
export function addSalesEmployee(employee: SalesEmployee) {
	return api<SalesEmployee>("POST", "employees", employee);
}
export function updateSalesEmployee(
	employee: SalesEmployee,
	expected: SalesEmployee,
	effectiveTo?: string,
) {
	return api<{ employee: SalesEmployee; customers: Customer[] }>(
		"PATCH",
		`employees/${encodeURIComponent(employee.id)}`,
		{ employee, expected, effectiveTo },
	);
}
export function removeSalesEmployee(
	employee: SalesEmployee,
	effectiveTo: string,
) {
	return api<Customer[]>(
		"DELETE",
		`employees/${encodeURIComponent(employee.id)}`,
		{ expected: employee, effectiveTo },
	);
}
