import { useCallback, useState } from "react";
import {
	readCustomers,
	writeCustomers,
} from "../../domain/customers/customer.repository";
import type { EmployeeDraft } from "../../domain/employees/employee.model";
import {
	assignCustomers,
	endEmployeeAssignments,
	unassignCustomer,
} from "../../domain/assignments/assignment.service";
import { createEmployee } from "../../domain/employees/employee.factory";
import {
	readSalesEmployees,
	writeSalesEmployees,
} from "../../domain/employees/employee.repository";

export function useSalesAssignments() {
	const [customers, setCustomers] = useState(readCustomers);
	const [employees, setEmployees] = useState(readSalesEmployees);

	const assign = useCallback(
		(customerIds: string[], employeeId: string, effectiveFrom: string) => {
			const employee = employees.find((item) => item.id === employeeId);
			if (!employee) return false;
			const next = assignCustomers(
				customers,
				customerIds,
				employee,
				effectiveFrom,
			);
			if (!writeCustomers(next)) return false;
			setCustomers(next);
			return true;
		},
		[customers, employees],
	);

	const unassign = useCallback(
		(customerId: string, employeeId: string, effectiveTo: string) => {
			const next = unassignCustomer(
				customers,
				customerId,
				employeeId,
				effectiveTo,
			);
			if (!writeCustomers(next)) return false;
			setCustomers(next);
			return true;
		},
		[customers],
	);

	const addEmployee = useCallback(
		(draft: EmployeeDraft) => {
			const employee = createEmployee(draft);
			const next = [...employees, employee];
			if (!writeSalesEmployees(next)) return undefined;
			setEmployees(next);
			return employee.id;
		},
		[employees],
	);

	const updateEmployee = useCallback(
		(employeeId: string, draft: EmployeeDraft) => {
			const nextEmployees = employees.map((employee) =>
				employee.id === employeeId
					? {
							...employee,
							code: draft.code.trim(),
							name: draft.name.trim(),
							phone: draft.phone.trim(),
							email: draft.email.trim(),
							status: draft.status,
						}
					: employee,
			);
			const nextCustomers = customers.map((customer) => ({
				...customer,
				assignments: customer.assignments.map((assignment) =>
					assignment.employeeId === employeeId
						? { ...assignment, employeeName: draft.name.trim() }
						: assignment,
				),
			}));
			if (!writeCustomers(nextCustomers)) return false;
			if (!writeSalesEmployees(nextEmployees)) {
				writeCustomers(customers);
				return false;
			}
			setCustomers(nextCustomers);
			setEmployees(nextEmployees);
			return true;
		},
		[customers, employees],
	);

	const deactivateEmployee = useCallback(
		(employeeId: string, effectiveTo: string) => {
			const nextEmployees = employees.map((employee) =>
				employee.id === employeeId
					? { ...employee, status: "inactive" as const }
					: employee,
			);
			const nextCustomers = endEmployeeAssignments(
				customers,
				employeeId,
				effectiveTo,
			);
			if (!writeCustomers(nextCustomers)) return false;
			if (!writeSalesEmployees(nextEmployees)) {
				writeCustomers(customers);
				return false;
			}
			setCustomers(nextCustomers);
			setEmployees(nextEmployees);
			return true;
		},
		[customers, employees],
	);

	const deleteEmployee = useCallback(
		(employeeId: string, effectiveTo: string) => {
			if (!employees.some((employee) => employee.id === employeeId))
				return false;
			const nextEmployees = employees.filter(
				(employee) => employee.id !== employeeId,
			);
			const nextCustomers = endEmployeeAssignments(
				customers,
				employeeId,
				effectiveTo,
			);
			if (!writeCustomers(nextCustomers)) return false;
			if (!writeSalesEmployees(nextEmployees)) {
				writeCustomers(customers);
				return false;
			}
			setCustomers(nextCustomers);
			setEmployees(nextEmployees);
			return true;
		},
		[customers, employees],
	);

	return {
		customers,
		employees,
		assignCustomers: assign,
		unassignCustomer: unassign,
		addEmployee,
		updateEmployee,
		deactivateEmployee,
		deleteEmployee,
	};
}
