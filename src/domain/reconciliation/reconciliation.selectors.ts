import { currentAssignment } from "../customers/customer.selectors";
import type { Customer } from "../customers/customer.model";
import type {
	CustomerReconcileRow,
	ReconciliationEntry,
} from "./reconciliation.model";

export function selectCustomerReconcileRows(
	entries: ReconciliationEntry[],
	customers: Customer[],
): CustomerReconcileRow[] {
	const customerByCode = new Map(
		customers.map((customer) => [
			customer.misaCode.toLocaleLowerCase("vi-VN"),
			customer,
		]),
	);
	return entries.map(({ customerName, ...entry }) => {
		const customer = customerByCode.get(
			entry.customerCode.toLocaleLowerCase("vi-VN"),
		);
		return {
			...entry,
			customer: customer?.name ?? customerName,
			region: customer?.province ?? entry.region,
			salesperson: customer
				? (currentAssignment(customer)?.employeeName ?? "Chưa phân công")
				: entry.salesperson,
		};
	});
}
