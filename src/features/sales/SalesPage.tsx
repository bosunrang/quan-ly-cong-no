import { useEffect, useMemo, useState } from "react";
import type { Customer } from "../../domain/customers/customer.model";
import { activeSalesAssignment } from "../../domain/assignments/assignment.service";
import { AssignmentDialog } from "./AssignmentDialog";
import { EmployeeFormDialog } from "./EmployeeFormDialog";
import { EmployeeDeactivateDialog } from "./EmployeeDeactivateDialog";
import { EmployeeDeleteDialog } from "./EmployeeDeleteDialog";
import { UnassignDialog } from "./UnassignDialog";
import { useSalesAssignments } from "./useSalesAssignments";
import { SalesStats } from "./components/SalesStats";
import { EmployeePanel } from "./components/EmployeePanel";
import {
	CustomerPoolPanel,
	type CustomerScope,
} from "./components/CustomerPoolPanel";
import { AssignedCustomerPanel } from "./components/AssignedCustomerPanel";
import { usePagination } from "../../shared/hooks/usePagination";

export function SalesPage() {
	const {
		customers,
		employees,
		assignCustomers,
		unassignCustomer,
		addEmployee,
		updateEmployee,
		deactivateEmployee,
		deleteEmployee,
	} = useSalesAssignments();
	const activeEmployees = employees.filter(
		(employee) => employee.status === "active",
	);
	const [selectedEmployeeId, setSelectedEmployeeId] = useState(
		() => activeEmployees[0]?.id ?? "",
	);
	const [province, setProvince] = useState("all");
	const [employeeQuery, setEmployeeQuery] = useState("");
	const [customerQuery, setCustomerQuery] = useState("");
	const [scope, setScope] = useState<CustomerScope>("unassigned");
	const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
	const [assignmentOpen, setAssignmentOpen] = useState(false);
	const [employeeEditorId, setEmployeeEditorId] = useState<string | "new">();
	const [employeeDeactivateId, setEmployeeDeactivateId] = useState<string>();
	const [employeeDeleteId, setEmployeeDeleteId] = useState<string>();
	const [unassignCustomerId, setUnassignCustomerId] = useState<string>();
	const [notice, setNotice] = useState("");

	const selectedEmployee =
		employees.find((employee) => employee.id === selectedEmployeeId) ??
		activeEmployees[0];
	const provinceOptions = useMemo(
		() =>
			[...new Set(customers.map((customer) => customer.province))].sort(
				(a, b) => a.localeCompare(b, "vi"),
			),
		[customers],
	);
	const visibleEmployees = [...employees]
		.sort(
			(a, b) => Number(b.status === "active") - Number(a.status === "active"),
		)
		.filter((employee) =>
			`${employee.code} ${employee.name}`
				.toLowerCase()
				.includes(employeeQuery.trim().toLowerCase()),
		);
	const assignmentCountByEmployee = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const customer of customers) {
			const employeeId = activeSalesAssignment(customer)?.employeeId;
			if (employeeId) counts[employeeId] = (counts[employeeId] ?? 0) + 1;
		}
		return counts;
	}, [customers]);
	const visibleCustomers = customers.filter((customer) => {
		const assignment = activeSalesAssignment(customer);
		const searchable =
			`${customer.misaCode} ${customer.name} ${customer.taxCode} ${customer.address}`.toLowerCase();
		return (
			(province === "all" || customer.province === province) &&
			searchable.includes(customerQuery.trim().toLowerCase()) &&
			(scope === "all" ||
				(scope === "unassigned" && !assignment) ||
				(scope === "owned" &&
					assignment?.employeeId === selectedEmployeeId) ||
				(scope === "other" &&
					assignment &&
					assignment.employeeId !== selectedEmployeeId))
		);
	});
	const {
		currentPage: customerPage,
		pageCount: customerPageCount,
		pageSize: customerPageSize,
		pageItems: pagedVisibleCustomers,
		setCurrentPage: setCustomerPage,
		resetPage: resetCustomerPage,
	} = usePagination(visibleCustomers);
	const ownedCustomers = selectedEmployee
		? customers.filter(
				(customer) =>
					activeSalesAssignment(customer)?.employeeId === selectedEmployee.id,
			)
		: [];
	const employeeToDeactivate = employeeDeactivateId
		? employees.find((employee) => employee.id === employeeDeactivateId)
		: undefined;
	const employeeToDeactivateOwnedCustomers = employeeToDeactivate
		? customers.filter(
				(customer) =>
					activeSalesAssignment(customer)?.employeeId ===
					employeeToDeactivate.id,
			)
		: [];
	const latestEmployeeAssignmentStart = employeeToDeactivateOwnedCustomers
		.map((customer) => activeSalesAssignment(customer)?.effectiveFrom)
		.filter((value): value is string => Boolean(value))
		.sort()
		.at(-1);
	const employeeToDeactivateHistoryCount = employeeToDeactivate
		? customers.reduce(
				(count, customer) =>
					count +
					customer.assignments.filter(
						(assignment) => assignment.employeeId === employeeToDeactivate.id,
					).length,
				0,
			)
		: 0;
	const employeeToDelete = employeeDeleteId
		? employees.find((employee) => employee.id === employeeDeleteId)
		: undefined;
	const employeeToDeleteOwnedCustomers = employeeToDelete
		? customers.filter(
				(customer) =>
					activeSalesAssignment(customer)?.employeeId === employeeToDelete.id,
			)
		: [];
	const latestEmployeeToDeleteAssignmentStart = employeeToDeleteOwnedCustomers
		.map((customer) => activeSalesAssignment(customer)?.effectiveFrom)
		.filter((value): value is string => Boolean(value))
		.sort()
		.at(-1);
	const employeeToDeleteHistoryCount = employeeToDelete
		? customers.reduce(
				(count, customer) =>
					count +
					customer.assignments.filter(
						(assignment) => assignment.employeeId === employeeToDelete.id,
					).length,
				0,
			)
		: 0;
	const employeeEditorAssignedCount =
		employeeEditorId && employeeEditorId !== "new"
			? customers.filter(
					(customer) =>
						activeSalesAssignment(customer)?.employeeId === employeeEditorId,
				).length
			: 0;
	const selectedCustomers = customers.filter((customer) =>
		selectedCustomerIds.includes(customer.id),
	);
	const customerToUnassign = unassignCustomerId
		? customers.find((customer) => customer.id === unassignCustomerId)
		: undefined;
	const assignmentToEnd = customerToUnassign
		? activeSalesAssignment(customerToUnassign)
		: undefined;
	const transferCount = selectedCustomers.filter((customer) =>
		Boolean(activeSalesAssignment(customer)),
	).length;
	const customerFilterKey = `${customerQuery}|${province}|${scope}|${selectedEmployeeId}`;

	useEffect(() => {
		void customerFilterKey;
		resetCustomerPage();
	}, [customerFilterKey, resetCustomerPage]);

	const showNotice = (message: string, duration = 2600) => {
		setNotice(message);
		window.setTimeout(() => setNotice(""), duration);
	};
	const chooseEmployee = (employeeId: string) => {
		setSelectedEmployeeId(employeeId);
		setSelectedCustomerIds([]);
		setScope("unassigned");
	};
	const toggleCustomer = (customer: Customer) => {
		if (
			selectedEmployee?.status !== "active" ||
			customer.status !== "active" ||
			activeSalesAssignment(customer)?.employeeId === selectedEmployeeId
		)
			return;
		setSelectedCustomerIds((current) =>
			current.includes(customer.id)
				? current.filter((id) => id !== customer.id)
				: [...current, customer.id],
		);
	};
	const confirmAssignment = (effectiveFrom: string) => {
		if (!selectedEmployee) return;
		if (
			!assignCustomers(selectedCustomerIds, selectedEmployee.id, effectiveFrom)
		)
			return;
		setAssignmentOpen(false);
		setSelectedCustomerIds([]);
		showNotice(
			`Đã phân công ${selectedCustomers.length} đơn vị cho ${selectedEmployee.name}.`,
		);
	};

	return (
		<div className="page-stack sales-page">
			{notice && (
				<div className="settings-toast" role="status">
					{notice}
				</div>
			)}
			<SalesStats
				customers={customers}
				employees={employees}
				selectedEmployee={selectedEmployee}
				selectedAssignmentCount={ownedCustomers.length}
			/>
			<section className="sales-board" aria-label="Bảng phân công khách hàng">
				<EmployeePanel
					employees={visibleEmployees}
					assignmentCountByEmployee={assignmentCountByEmployee}
					selectedEmployeeId={selectedEmployee?.id}
					query={employeeQuery}
					onQueryChange={setEmployeeQuery}
					onSelect={chooseEmployee}
					onEdit={(employeeId) => {
						chooseEmployee(employeeId);
						setEmployeeEditorId(employeeId);
					}}
					onDeactivate={(employeeId) => {
						chooseEmployee(employeeId);
						setEmployeeDeactivateId(employeeId);
					}}
					onDelete={(employeeId) => {
						chooseEmployee(employeeId);
						setEmployeeDeleteId(employeeId);
					}}
					onAdd={() => setEmployeeEditorId("new")}
				/>
				<CustomerPoolPanel
					customers={pagedVisibleCustomers}
					filteredCount={visibleCustomers.length}
					currentPage={customerPage}
					pageCount={customerPageCount}
					pageSize={customerPageSize}
					employee={selectedEmployee}
					province={province}
					provinces={provinceOptions}
					query={customerQuery}
					scope={scope}
					selectedIds={selectedCustomerIds}
					transferCount={transferCount}
					onProvinceChange={(value) => {
						setProvince(value);
						setSelectedCustomerIds([]);
					}}
					onQueryChange={setCustomerQuery}
					onScopeChange={setScope}
					onPageChange={setCustomerPage}
					onToggle={toggleCustomer}
					onAssign={() => setAssignmentOpen(true)}
				/>
				<AssignedCustomerPanel
					ownerKey={selectedEmployee?.id ?? ""}
					employeeName={selectedEmployee?.name}
					customers={ownedCustomers}
					onUnassign={setUnassignCustomerId}
				/>
			</section>

			{employeeEditorId && (
				<EmployeeFormDialog
					employees={employees}
					employee={
						employeeEditorId === "new"
							? undefined
							: employees.find((employee) => employee.id === employeeEditorId)
					}
					assignedCount={employeeEditorAssignedCount}
					onClose={() => setEmployeeEditorId(undefined)}
					onSave={(draft) => {
						if (employeeEditorId === "new") {
							const employeeId = addEmployee(draft);
							if (!employeeId) return false;
							setSelectedEmployeeId(employeeId);
							showNotice("Đã thêm nhân viên mới.", 2400);
							return true;
						}
						const saved = updateEmployee(employeeEditorId, draft);
						if (saved) showNotice("Đã cập nhật hồ sơ nhân viên.", 2400);
						return saved;
					}}
				/>
			)}
			{employeeToDeactivate && (
				<EmployeeDeactivateDialog
					employee={employeeToDeactivate}
					activeAssignmentCount={employeeToDeactivateOwnedCustomers.length}
					historyCount={employeeToDeactivateHistoryCount}
					latestActiveFrom={latestEmployeeAssignmentStart}
					onClose={() => setEmployeeDeactivateId(undefined)}
					onConfirm={(effectiveTo) => {
						const employeeName = employeeToDeactivate.name;
						const affectedCount = employeeToDeactivateOwnedCustomers.length;
						const nextEmployee = activeEmployees.find(
							(employee) => employee.id !== employeeToDeactivate.id,
						);
						if (!deactivateEmployee(employeeToDeactivate.id, effectiveTo))
							return;
						if (selectedEmployeeId === employeeToDeactivate.id)
							setSelectedEmployeeId(nextEmployee?.id ?? "");
						setSelectedCustomerIds([]);
						setEmployeeDeactivateId(undefined);
						showNotice(
							`Đã chuyển ${employeeName} sang ngừng hoạt động. ${affectedCount ? `${affectedCount} đơn vị đã chuyển về chưa phân công; lịch sử vẫn được giữ lại.` : "Lịch sử phân công vẫn được giữ lại."}`,
							3200,
						);
					}}
				/>
			)}
			{employeeToDelete && (
				<EmployeeDeleteDialog
					employee={employeeToDelete}
					activeAssignmentCount={employeeToDeleteOwnedCustomers.length}
					historyCount={employeeToDeleteHistoryCount}
					latestActiveFrom={latestEmployeeToDeleteAssignmentStart}
					onClose={() => setEmployeeDeleteId(undefined)}
					onConfirm={(effectiveTo) => {
						const employeeName = employeeToDelete.name;
						const affectedCount = employeeToDeleteOwnedCustomers.length;
						const nextEmployee =
							employees.find(
								(employee) =>
									employee.id !== employeeToDelete.id &&
									employee.status === "active",
							) ??
							employees.find((employee) => employee.id !== employeeToDelete.id);
						if (!deleteEmployee(employeeToDelete.id, effectiveTo)) return;
						if (selectedEmployeeId === employeeToDelete.id)
							setSelectedEmployeeId(nextEmployee?.id ?? "");
						setSelectedCustomerIds([]);
						setEmployeeDeleteId(undefined);
						showNotice(
							`Đã xóa hồ sơ ${employeeName}. ${affectedCount ? `${affectedCount} đơn vị đã chuyển về chưa phân công; lịch sử phân công vẫn được giữ.` : "Lịch sử phân công vẫn được giữ."}`,
							3200,
						);
					}}
				/>
			)}
			{customerToUnassign && selectedEmployee && assignmentToEnd && (
				<UnassignDialog
					customer={customerToUnassign}
					employee={selectedEmployee}
					assignment={assignmentToEnd}
					onClose={() => setUnassignCustomerId(undefined)}
					onConfirm={(effectiveTo) => {
						if (
							!unassignCustomer(
								customerToUnassign.id,
								selectedEmployee.id,
								effectiveTo,
							)
						)
							return;
						setUnassignCustomerId(undefined);
						showNotice(
							`Đã kết thúc phụ trách đơn vị ${customerToUnassign.name}.`,
						);
					}}
				/>
			)}
			{assignmentOpen && selectedEmployee && (
				<AssignmentDialog
					customers={selectedCustomers}
					employee={selectedEmployee}
					onClose={() => setAssignmentOpen(false)}
					onConfirm={confirmAssignment}
				/>
			)}
		</div>
	);
}
