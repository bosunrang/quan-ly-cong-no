import type { Customer, SalesAssignment } from "./customer.model";

export function currentAssignment(
	customer: Customer,
): SalesAssignment | undefined {
	return customer.assignments.find((assignment) => !assignment.effectiveTo);
}
