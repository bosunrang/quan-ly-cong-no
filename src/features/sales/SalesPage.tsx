import { useTransientNotice } from "../../shared/hooks/useTransientNotice";
import { Notice } from "../../shared/ui/Notice";
import { useEffect, useMemo, useState } from "react";
import type { Customer } from "../../domain/customers/customer.model";
import type { AccountProfile } from "../../domain/access/accounts.model";
import {
	activeSalesAssignment,
	canAssignCustomer,
} from "../../domain/assignments/assignment.service";
import { AssignmentDialog } from "./AssignmentDialog";
import { EmployeeFormDialog } from "./EmployeeFormDialog";
import { EmployeeDeactivateDialog } from "./EmployeeDeactivateDialog";
import { EmployeeDeleteDialog } from "./EmployeeDeleteDialog";
import { UnassignDialog } from "./UnassignDialog";
import { useSalesAssignments } from "./useSalesAssignments";
import { EmployeePanel } from "./components/EmployeePanel";
import {
	CustomerPoolPanel,
	type CustomerScope,
} from "./components/CustomerPoolPanel";
import { AssignedCustomerPanel } from "./components/AssignedCustomerPanel";
import { usePagination } from "../../shared/hooks/usePagination";
import { SalesCustomerDetailDrawer } from "./components/SalesCustomerDetailDrawer";

export function SalesPage({
	linkableAccounts,
}: {
	linkableAccounts?: readonly AccountProfile[];
}) {
	const canManageEmployees = linkableAccounts !== undefined;
	const selfService = !canManageEmployees;
	const {
		customers,
		employees,
		assignCustomers,
		unassignCustomer,
		addEmployee,
		updateEmployee,
		deactivateEmployee,
		deleteEmployee,
		busy,
		loading,
		error: loadError,
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
	const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [assignmentOpen, setAssignmentOpen] = useState(false);
	const [assignmentError, setAssignmentError] = useState("");
	const [employeeEditorId, setEmployeeEditorId] = useState<string | "new">();
	const [employeeDeactivateId, setEmployeeDeactivateId] = useState<string>();
	const [employeeDeleteId, setEmployeeDeleteId] = useState<string>();
	const [unassignCustomerId, setUnassignCustomerId] = useState<string>();
	const [detailCustomerId, setDetailCustomerId] = useState<string>();
	const { notice, showNotice, dismissNotice } = useTransientNotice(2600);

	const selectedEmployee =
		employees.find((employee) => employee.id === selectedEmployeeId) ??
		activeEmployees[0];
	const ownerId = selectedEmployee?.id;
	const provinceOptions = useMemo(
		() =>
			[...new Set(customers.map((customer) => customer.province))].sort(
				(a, b) => a.localeCompare(b, "vi"),
			),
		[customers],
	);
	const visibleEmployees = useMemo(
		() =>
			[...employees]
				.sort(
					(a, b) =>
						Number(b.status === "active") - Number(a.status === "active"),
				)
				.filter((employee) =>
					`${employee.code} ${employee.name}`
						.toLowerCase()
						.includes(employeeQuery.trim().toLowerCase()),
				),
		[employees, employeeQuery],
	);
	const assignmentCountByEmployee = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const customer of customers) {
			const employeeId = activeSalesAssignment(customer)?.employeeId;
			if (employeeId) counts[employeeId] = (counts[employeeId] ?? 0) + 1;
		}
		return counts;
	}, [customers]);
	const visibleCustomers = useMemo(
		() =>
			customers.filter((customer) => {
				const assignment = activeSalesAssignment(customer);
				if (selfService && !assignment && customer.status !== "active")
					return false;
				const searchable =
					`${customer.misaCode} ${customer.name} ${customer.taxCode} ${customer.address}`.toLowerCase();
				return (
					(province === "all" || customer.province === province) &&
					searchable.includes(customerQuery.trim().toLowerCase()) &&
					(scope === "all" ||
						(scope === "unassigned" && !assignment) ||
						(scope === "owned" &&
							assignment &&
							assignment.employeeId === ownerId) ||
						(scope === "other" &&
							assignment &&
							assignment.employeeId !== ownerId))
				);
			}),
		[customers, province, customerQuery, scope, ownerId, selfService],
	);
	const {
		currentPage: customerPage,
		pageCount: customerPageCount,
		pageSize: customerPageSize,
		pageItems: pagedVisibleCustomers,
		setCurrentPage: setCustomerPage,
		resetPage: resetCustomerPage,
	} = usePagination(visibleCustomers);
	const eligibleCustomers = useMemo(
		() =>
			visibleCustomers.filter((customer) =>
				canAssignCustomer(customer, selectedEmployee),
			),
		[visibleCustomers, selectedEmployee],
	);
	const ownedCustomers = useMemo(
		() =>
			selectedEmployee
				? customers.filter(
						(customer) =>
							activeSalesAssignment(customer)?.employeeId ===
							selectedEmployee.id,
					)
				: [],
		[customers, selectedEmployee],
	);
	const employeeToDeactivate = employeeDeactivateId
		? employees.find((employee) => employee.id === employeeDeactivateId)
		: undefined;
	const {
		employeeToDeactivateOwnedCustomers,
		latestEmployeeAssignmentStart,
		employeeToDeactivateHistoryCount,
	} = useMemo(() => {
		if (!employeeToDeactivate)
			return {
				employeeToDeactivateOwnedCustomers: [] as Customer[],
				latestEmployeeAssignmentStart: undefined as string | undefined,
				employeeToDeactivateHistoryCount: 0,
			};
		const owned = customers.filter(
			(customer) =>
				activeSalesAssignment(customer)?.employeeId === employeeToDeactivate.id,
		);
		const latestStart = owned
			.map((customer) => activeSalesAssignment(customer)?.effectiveFrom)
			.filter((value): value is string => Boolean(value))
			.sort()
			.at(-1);
		const historyCount = customers.reduce(
			(count, customer) =>
				count +
				customer.assignments.filter(
					(assignment) => assignment.employeeId === employeeToDeactivate.id,
				).length,
			0,
		);
		return {
			employeeToDeactivateOwnedCustomers: owned,
			latestEmployeeAssignmentStart: latestStart,
			employeeToDeactivateHistoryCount: historyCount,
		};
	}, [customers, employeeToDeactivate]);
	const employeeToDelete = employeeDeleteId
		? employees.find((employee) => employee.id === employeeDeleteId)
		: undefined;
	const {
		employeeToDeleteOwnedCustomers,
		latestEmployeeToDeleteAssignmentStart,
		employeeToDeleteHistoryCount,
	} = useMemo(() => {
		if (!employeeToDelete)
			return {
				employeeToDeleteOwnedCustomers: [] as Customer[],
				latestEmployeeToDeleteAssignmentStart: undefined as string | undefined,
				employeeToDeleteHistoryCount: 0,
			};
		const owned = customers.filter(
			(customer) =>
				activeSalesAssignment(customer)?.employeeId === employeeToDelete.id,
		);
		const latestStart = owned
			.map((customer) => activeSalesAssignment(customer)?.effectiveFrom)
			.filter((value): value is string => Boolean(value))
			.sort()
			.at(-1);
		const historyCount = customers.reduce(
			(count, customer) =>
				count +
				customer.assignments.filter(
					(assignment) => assignment.employeeId === employeeToDelete.id,
				).length,
			0,
		);
		return {
			employeeToDeleteOwnedCustomers: owned,
			latestEmployeeToDeleteAssignmentStart: latestStart,
			employeeToDeleteHistoryCount: historyCount,
		};
	}, [customers, employeeToDelete]);
	const employeeEditorAssignedCount = useMemo(
		() =>
			employeeEditorId && employeeEditorId !== "new"
				? customers.filter(
						(customer) =>
							activeSalesAssignment(customer)?.employeeId === employeeEditorId,
					).length
				: 0,
		[customers, employeeEditorId],
	);
	const selectedCustomers = useMemo(
		() => customers.filter((customer) => selectedCustomerIds.has(customer.id)),
		[customers, selectedCustomerIds],
	);
	const customerToUnassign = unassignCustomerId
		? customers.find((customer) => customer.id === unassignCustomerId)
		: undefined;
	const detailCustomer = detailCustomerId
		? customers.find((customer) => customer.id === detailCustomerId)
		: undefined;
	const assignmentToEnd = customerToUnassign
		? activeSalesAssignment(customerToUnassign)
		: undefined;
	const transferCount = useMemo(
		() =>
			selectedCustomers.filter((customer) =>
				Boolean(activeSalesAssignment(customer)),
			).length,
		[selectedCustomers],
	);
	const customerFilterKey = `${customerQuery}|${province}|${scope}|${selectedEmployeeId}`;

	useEffect(() => {
		void customerFilterKey;
		resetCustomerPage();
	}, [customerFilterKey, resetCustomerPage]);

	const chooseEmployee = (employeeId: string) => {
		setSelectedEmployeeId(employeeId);
		setSelectedCustomerIds(new Set());
		setScope("unassigned");
	};
	const toggleCustomer = (customer: Customer) => {
		if (!canAssignCustomer(customer, selectedEmployee)) return;
		setSelectedCustomerIds((current) => {
			const next = new Set(current);
			if (!next.delete(customer.id)) next.add(customer.id);
			return next;
		});
	};
	const confirmAssignment = async (effectiveFrom: string) => {
		if (!selectedEmployee) return;
		const result = await assignCustomers(
			selectedCustomers,
			selectedEmployee,
			effectiveFrom,
		);
		if (!result) {
			setAssignmentError(
				"Không thể lưu phân công. Kiểm tra thông báo và tải lại nếu dữ liệu đã thay đổi.",
			);
			return;
		}
		setAssignmentOpen(false);
		setSelectedCustomerIds(new Set());
		showNotice(
			selfService
				? `Đã nhận phụ trách ${result.count} khách hàng.`
				: `Đã phân công ${result.count} khách hàng cho ${selectedEmployee.name}.`,
		);
	};

	if (loadError)
		return (
			<Notice tone="danger" announce>
				{loadError}
			</Notice>
		);
	if (loading)
		return (
			<p className="panel empty-state" role="status">
				Đang tải danh mục…
			</p>
		);

	return (
		<div className="page-stack sales-page">
			{notice && (
				<Notice tone={notice.tone} floating announce onDismiss={dismissNotice}>
					{notice.text}
				</Notice>
			)}
			<section className="sales-board" aria-label="Bảng phân công khách hàng">
				<EmployeePanel
					employees={visibleEmployees}
					canManageEmployees={canManageEmployees}
					linkableAccounts={linkableAccounts}
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
					selfService={selfService}
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
					eligibleCount={eligibleCustomers.length}
					onProvinceChange={(value) => {
						setProvince(value);
						setSelectedCustomerIds(new Set());
					}}
					onQueryChange={(value) => {
						setCustomerQuery(value);
						setSelectedCustomerIds(new Set());
					}}
					onScopeChange={(value) => {
						if (value === scope) return;
						setScope(value);
						setSelectedCustomerIds(new Set());
					}}
					onPageChange={setCustomerPage}
					onToggle={toggleCustomer}
					onSelectAll={() =>
						setSelectedCustomerIds(
							new Set(eligibleCustomers.map(({ id }) => id)),
						)
					}
					onClearSelection={() => setSelectedCustomerIds(new Set())}
					onAssign={() => {
						setAssignmentError("");
						setAssignmentOpen(true);
					}}
				/>
				<AssignedCustomerPanel
					selfService={selfService}
					ownerKey={selectedEmployee?.id ?? ""}
					employeeName={selectedEmployee?.name}
					customers={ownedCustomers}
					onOpen={setDetailCustomerId}
					onUnassign={setUnassignCustomerId}
				/>
			</section>

			{detailCustomer && (
				<SalesCustomerDetailDrawer
					customer={detailCustomer}
					onClose={() => setDetailCustomerId(undefined)}
				/>
			)}

			{canManageEmployees && employeeEditorId && (
				<EmployeeFormDialog
					busy={busy}
					employees={employees}
					linkableAccounts={linkableAccounts}
					employee={
						employeeEditorId === "new"
							? undefined
							: employees.find((employee) => employee.id === employeeEditorId)
					}
					assignedCount={employeeEditorAssignedCount}
					onClose={() => setEmployeeEditorId(undefined)}
					onSave={async (draft) => {
						if (employeeEditorId === "new") {
							const employeeId = await addEmployee(draft);
							if (!employeeId) return false;
							setSelectedEmployeeId(employeeId);
							showNotice("Đã thêm nhân viên mới.", 2400);
							return true;
						}
						const saved = await updateEmployee(employeeEditorId, draft);
						if (saved) showNotice("Đã cập nhật hồ sơ nhân viên.", 2400);
						return Boolean(saved);
					}}
				/>
			)}
			{canManageEmployees && employeeToDeactivate && (
				<EmployeeDeactivateDialog
					busy={busy}
					employee={employeeToDeactivate}
					activeAssignmentCount={employeeToDeactivateOwnedCustomers.length}
					historyCount={employeeToDeactivateHistoryCount}
					latestActiveFrom={latestEmployeeAssignmentStart}
					onClose={() => setEmployeeDeactivateId(undefined)}
					onConfirm={async (effectiveTo) => {
						const employeeName = employeeToDeactivate.name;
						const affectedCount = employeeToDeactivateOwnedCustomers.length;
						const nextEmployee = activeEmployees.find(
							(employee) => employee.id !== employeeToDeactivate.id,
						);
						if (
							!(await deactivateEmployee(employeeToDeactivate.id, effectiveTo))
						)
							return;
						if (selectedEmployeeId === employeeToDeactivate.id)
							setSelectedEmployeeId(nextEmployee?.id ?? "");
						setSelectedCustomerIds(new Set());
						setEmployeeDeactivateId(undefined);
						showNotice(
							`Đã chuyển ${employeeName} sang ngừng hoạt động. ${affectedCount ? `${affectedCount} đơn vị đã chuyển về chưa phân công; lịch sử vẫn được giữ lại.` : "Lịch sử phân công vẫn được giữ lại."}`,
							3200,
						);
					}}
				/>
			)}
			{canManageEmployees && employeeToDelete && (
				<EmployeeDeleteDialog
					busy={busy}
					employee={employeeToDelete}
					activeAssignmentCount={employeeToDeleteOwnedCustomers.length}
					historyCount={employeeToDeleteHistoryCount}
					latestActiveFrom={latestEmployeeToDeleteAssignmentStart}
					onClose={() => setEmployeeDeleteId(undefined)}
					onConfirm={async (effectiveTo) => {
						const employeeName = employeeToDelete.name;
						const affectedCount = employeeToDeleteOwnedCustomers.length;
						const nextEmployee =
							employees.find(
								(employee) =>
									employee.id !== employeeToDelete.id &&
									employee.status === "active",
							) ??
							employees.find((employee) => employee.id !== employeeToDelete.id);
						if (!(await deleteEmployee(employeeToDelete.id, effectiveTo)))
							return;
						if (selectedEmployeeId === employeeToDelete.id)
							setSelectedEmployeeId(nextEmployee?.id ?? "");
						setSelectedCustomerIds(new Set());
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
					busy={busy}
					customer={customerToUnassign}
					employee={selectedEmployee}
					assignment={assignmentToEnd}
					onClose={() => setUnassignCustomerId(undefined)}
					onConfirm={async (effectiveTo) => {
						if (
							!(await unassignCustomer(
								customerToUnassign.id,
								selectedEmployee.id,
								effectiveTo,
							))
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
					selfService={selfService}
					busy={busy}
					customers={selectedCustomers}
					employee={selectedEmployee}
					error={assignmentError}
					onClose={() => setAssignmentOpen(false)}
					onConfirm={confirmAssignment}
				/>
			)}
		</div>
	);
}
