import type { Customer, SalesAssignment } from "../customers/customer.model";
import { currentAssignment } from "../customers/customer.selectors";
import type { SalesEmployee } from "../employees/employee.model";
import { previousDay } from "../../shared/lib/date";
import { createId } from "../../shared/lib/identity";

export function activeSalesAssignment(
	customer: Customer,
): SalesAssignment | undefined {
	return currentAssignment(customer);
}

export function assignCustomers(
	customers: Customer[],
	customerIds: string[],
	employee: SalesEmployee,
	effectiveFrom: string,
): Customer[] {
	const selectedIds = new Set(customerIds);
	return customers.map((customer) => {
		if (!selectedIds.has(customer.id)) return customer;
		const active = currentAssignment(customer);
		if (active?.employeeId === employee.id) return customer;

		const assignments = customer.assignments.map((assignment) =>
			assignment.id === active?.id
				? { ...assignment, effectiveTo: previousDay(effectiveFrom) }
				: assignment,
		);
		const nextAssignment: SalesAssignment = {
			id: createId("ASN"),
			employeeId: employee.id,
			employeeName: employee.name,
			province: customer.province,
			source: "direct",
			effectiveFrom,
			effectiveTo: null,
		};
		return {
			...customer,
			assignments: [...assignments, nextAssignment],
			updatedAt: new Date().toISOString(),
		};
	});
}

export function unassignCustomer(
	customers: Customer[],
	customerId: string,
	employeeId: string,
	effectiveTo: string,
): Customer[] {
	return customers.map((customer) => {
		if (customer.id !== customerId) return customer;
		const active = currentAssignment(customer);
		if (!active || active.employeeId !== employeeId) return customer;
		return {
			...customer,
			assignments: customer.assignments.map((assignment) =>
				assignment.id === active.id
					? { ...assignment, effectiveTo }
					: assignment,
			),
			updatedAt: new Date().toISOString(),
		};
	});
}

export function endEmployeeAssignments(
	customers: Customer[],
	employeeId: string,
	effectiveTo: string,
): Customer[] {
	return customers.map((customer) => {
		const active = currentAssignment(customer);
		if (!active || active.employeeId !== employeeId) return customer;

		return {
			...customer,
			assignments: customer.assignments.map((assignment) =>
				assignment.id === active.id
					? { ...assignment, effectiveTo }
					: assignment,
			),
			updatedAt: new Date().toISOString(),
		};
	});
}
