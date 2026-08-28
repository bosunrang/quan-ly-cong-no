import { readCustomers } from "../customers/customer.repository";
import { readReconciliationData } from "../reconciliation/reconciliation.repository";
import { selectCustomerReconcileRows } from "../reconciliation/reconciliation.selectors";
import { seedActivityItems } from "./dashboard.seed";

export function readDashboardData() {
	const reconciliation = readReconciliationData();
	return {
		periodLabel: reconciliation.periodLabel,
		updatedThrough: reconciliation.updatedThrough,
		monthlySeries: reconciliation.monthlySeries,
		reconcileRows: selectCustomerReconcileRows(
			reconciliation.entries,
			readCustomers(),
		),
		activityItems: structuredClone(seedActivityItems),
	};
}
