import { api } from "../../shared/api/client";
import type {
	Customer,
	CustomerDraft,
	CustomerImportRecord,
} from "./customer.model";
import type { SalesEmployee } from "../employees/employee.model";

export function readCustomers() {
	return api<Customer[]>("GET", "customers");
}
export function addCustomer(customer: CustomerDraft) {
	return api<Customer>("POST", "customers", customer);
}
export function updateCustomer(current: Customer, customer: CustomerDraft) {
	return api<Customer>("PATCH", `customers/${encodeURIComponent(current.id)}`, {
		customer,
		expected: current.updatedAt,
	});
}
export function removeCustomer(customer: Customer) {
	return api<boolean>(
		"DELETE",
		`customers/${encodeURIComponent(customer.id)}`,
		{ expected: customer.updatedAt },
	);
}
export function importCustomerRecords(customers: CustomerImportRecord[]) {
	return api<{ customers: Customer[]; employees: SalesEmployee[] }>(
		"POST",
		"customers/imports",
		{ customers, includeEmployees: true },
	);
}
