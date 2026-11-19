import { useCallback, useState } from "react";
import type { Customer } from "../../domain/customers/customer.model";
import {
	CUSTOMER_STORAGE_KEY,
	readCustomers,
	writeCustomers,
} from "../../domain/customers/customer.repository";
import type {
	EmployeeDraft,
	SalesEmployee,
} from "../../domain/employees/employee.model";
import {
	assignCustomers,
	endEmployeeAssignments,
	unassignCustomer,
} from "../../domain/assignments/assignment.service";
import { createEmployee } from "../../domain/employees/employee.factory";
import { recordActivity } from "../../shared/storage/activityLog";
import { lanEndpoint, writeLanEmployeeDirectory } from "../../shared/storage/lanStorage";
import { reportStorageIssue } from "../../shared/storage/localStorage";
import {
	EMPLOYEE_STORAGE_KEY,
	readSalesEmployees,
	writeSalesEmployees,
} from "../../domain/employees/employee.repository";

function saveEmployeeDirectory(
	customers: Customer[],
	employees: SalesEmployee[],
	previousCustomers: Customer[],
) {
	if (lanEndpoint()) {
		try {
			return writeLanEmployeeDirectory(customers, employees, CUSTOMER_STORAGE_KEY, EMPLOYEE_STORAGE_KEY);
		} catch (error) {
			reportStorageIssue(error instanceof Error ? error.message : "Không thể lưu danh mục.", error);
			return false;
		}
	}
	if (!writeCustomers(customers)) return false;
	if (writeSalesEmployees(employees)) return true;
	writeCustomers(previousCustomers);
	return false;
}

export function useSalesAssignments() {
	const [customers, setCustomers] = useState(readCustomers);
	const [employees, setEmployees] = useState(readSalesEmployees);

	const assign = useCallback(
		(
			selected: Customer[],
			target: SalesEmployee,
			effectiveFrom: string,
		): { count: number } | { error: string } => {
			const latestEmployees = readSalesEmployees();
			setEmployees(latestEmployees);
			const employee = latestEmployees.find(
				(item) => item.id === target.id,
			);
			if (employee?.status !== "active" || employee.name !== target.name)
				return {
					error:
						"Thông tin nhân viên đã thay đổi. Hãy tải lại trang để chọn lại người phụ trách.",
				};
			const latest = readCustomers();
			const byId = new Map(latest.map((customer) => [customer.id, customer]));
			const changed = selected.some((preview) => {
				const current = byId.get(preview.id);
				return (
					!current ||
					current.updatedAt !== preview.updatedAt ||
					JSON.stringify(current.assignments) !==
						JSON.stringify(preview.assignments)
				);
			});
			if (changed)
				return {
					error:
						"Danh sách hoặc phân công đã thay đổi. Hãy tải lại trang và chọn lại khách hàng.",
				};
			const next = assignCustomers(
				latest,
				selected.map(({ id }) => id),
				employee,
				effectiveFrom,
			);
			const count = next.filter(
				(customer, index) => customer !== latest[index],
			).length;
			if (!count || count !== selected.length)
				return {
					error:
						"Một số khách hàng không còn đủ điều kiện hoặc ngày bắt đầu trùng lịch sử phân công.",
				};
			if (!writeCustomers(next))
				return { error: "Không thể lưu phân công. Hãy thử lại." };
			setCustomers(next);
			void recordActivity(
				"data",
				"Phân công khách hàng",
				`${count} khách hàng · ${employee.name} · Từ ${effectiveFrom}`,
			);
			return { count };
		},
		[],
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
			const customer = customers.find((item) => item.id === customerId);
			void recordActivity(
				"data",
				"Bỏ phân công khách hàng",
				`${customer?.name ?? customerId} · Đến ${effectiveTo}`,
			);
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
			void recordActivity(
				"data",
				"Thêm nhân viên",
				`${employee.code} · ${employee.name}`,
			);
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
							linkedAccountId: draft.linkedAccountId,
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
			if (!saveEmployeeDirectory(nextCustomers, nextEmployees, customers)) return false;
			setCustomers(nextCustomers);
			setEmployees(nextEmployees);
			void recordActivity(
				"data",
				"Cập nhật nhân viên",
				`${draft.code} · ${draft.name}`,
			);
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
			if (!saveEmployeeDirectory(nextCustomers, nextEmployees, customers)) return false;
			setCustomers(nextCustomers);
			setEmployees(nextEmployees);
			const employee = employees.find((item) => item.id === employeeId);
			void recordActivity(
				"data",
				"Ngừng hoạt động nhân viên",
				`${employee?.name ?? employeeId} · Đến ${effectiveTo}`,
			);
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
			if (!saveEmployeeDirectory(nextCustomers, nextEmployees, customers)) return false;
			setCustomers(nextCustomers);
			setEmployees(nextEmployees);
			const employee = employees.find((item) => item.id === employeeId);
			void recordActivity(
				"data",
				"Xóa nhân viên",
				employee?.name ?? employeeId,
			);
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
