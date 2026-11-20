import { useRef, useState } from "react";
import {
	createAssignments,
	endAssignment,
} from "../../domain/assignments/assignment.repository";
import type { Customer } from "../../domain/customers/customer.model";
import { readDirectory } from "../../domain/customers/directory.repository";
import { currentAssignment } from "../../domain/customers/customer.selectors";
import { createEmployee } from "../../domain/employees/employee.factory";
import type {
	EmployeeDraft,
	SalesEmployee,
} from "../../domain/employees/employee.model";
import {
	addSalesEmployee,
	removeSalesEmployee,
	updateSalesEmployee,
} from "../../domain/employees/employee.repository";
import { useAsyncData } from "../../shared/hooks/useAsyncData";
import { reportStorageIssue } from "../../shared/storage/storageIssues";

const empty = { customers: [], employees: [] };

export function useSalesAssignments() {
	const { data, setData, error, loading } = useAsyncData(readDirectory);
	const { customers, employees } = data ?? empty;
	const saving = useRef(false);
	const [busy, setBusy] = useState(false);

	function updateDirectory(
		records: Customer[],
		updateEmployees: (list: SalesEmployee[]) => SalesEmployee[] = (list) =>
			list,
	) {
		const changed = new Map(records.map((item) => [item.id, item]));
		setData(
			(current) =>
				current && {
					customers: current.customers.map(
						(item) => changed.get(item.id) ?? item,
					),
					employees: updateEmployees(current.employees),
				},
		);
	}

	async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
		if (saving.current) return undefined;
		saving.current = true;
		setBusy(true);
		try {
			return await work();
		} catch (reason) {
			reportStorageIssue(
				reason instanceof Error ? reason.message : "Không thể lưu danh mục.",
				reason,
			);
			return undefined;
		} finally {
			saving.current = false;
			setBusy(false);
		}
	}

	async function editEmployee(
		previous: SalesEmployee,
		next: SalesEmployee,
		effectiveTo?: string,
	) {
		const changed = await updateSalesEmployee(next, previous, effectiveTo);
		updateDirectory(changed.customers, (list) =>
			list.map((item) => (item.id === previous.id ? changed.employee : item)),
		);
		return changed.employee;
	}

	return {
		customers,
		employees,
		error,
		loading,
		busy,
		async assignCustomers(
			selected: Customer[],
			employee: SalesEmployee,
			effectiveFrom: string,
		) {
			return run(async () => {
				const records = await createAssignments(
					selected,
					employee,
					effectiveFrom,
				);
				updateDirectory(records);
				return { count: records.length };
			});
		},
		async unassignCustomer(
			customerId: string,
			employeeId: string,
			effectiveTo: string,
		) {
			const customer = customers.find((item) => item.id === customerId);
			const assignment = customer && currentAssignment(customer);
			if (!customer || assignment?.employeeId !== employeeId) return false;
			return run(async () => {
				updateDirectory([
					await endAssignment(assignment.id, customer, effectiveTo),
				]);
				return true;
			});
		},
		async addEmployee(draft: EmployeeDraft) {
			return run(async () => {
				const employee = await addSalesEmployee(createEmployee(draft));
				updateDirectory([], (list) => [...list, employee]);
				return employee.id;
			});
		},
		async updateEmployee(employeeId: string, draft: EmployeeDraft) {
			const current = employees.find((item) => item.id === employeeId);
			if (!current) return false;
			return run(async () => {
				await editEmployee(current, {
					...current,
					...draft,
					code: draft.code.trim(),
					name: draft.name.trim(),
				});
				return true;
			});
		},
		async deactivateEmployee(employeeId: string, effectiveTo: string) {
			const current = employees.find((item) => item.id === employeeId);
			if (!current) return false;
			return run(async () => {
				await editEmployee(
					current,
					{ ...current, status: "inactive" },
					effectiveTo,
				);
				return true;
			});
		},
		async deleteEmployee(employeeId: string, effectiveTo: string) {
			const current = employees.find((item) => item.id === employeeId);
			if (!current) return false;
			return run(async () => {
				const records = await removeSalesEmployee(current, effectiveTo);
				updateDirectory(records, (list) =>
					list.filter((item) => item.id !== employeeId),
				);
				return true;
			});
		},
	};
}
