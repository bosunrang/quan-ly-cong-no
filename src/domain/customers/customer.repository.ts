import { api } from "../../shared/api/client";
import type { Customer, CustomerDraft } from "./customer.model";

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
export function importCustomerRecords(
	customers: CustomerDraft[],
	source: "imports" | "misa-supplements",
) {
	return api<Customer[]>("POST", `customers/${source}`, { customers });
}
