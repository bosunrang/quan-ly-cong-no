import { RowActionButton } from "../../../shared/ui/RowActionButton";
import { Plus, Search } from "lucide-react";
import type { SalesEmployee } from "../../../domain/employees/employee.model";
import type { AccountProfile } from "../../../domain/access/accounts.model";

export function employeeInitials(name: string): string {
	const words = name.trim().split(/\s+/);
	return `${words.at(-2)?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
}

interface EmployeePanelProps {
	employees: SalesEmployee[];
	canManageEmployees: boolean;
	linkableAccounts?: readonly Pick<AccountProfile, "id" | "username">[];
	assignmentCountByEmployee: Record<string, number>;
	selectedEmployeeId?: string;
	query: string;
	onQueryChange: (value: string) => void;
	onSelect: (employeeId: string) => void;
	onEdit: (employeeId: string) => void;
	onDeactivate: (employeeId: string) => void;
	onDelete: (employeeId: string) => void;
	onAdd: () => void;
}

export function EmployeePanel({
	employees,
	canManageEmployees,
	linkableAccounts,
	assignmentCountByEmployee,
	selectedEmployeeId,
	query,
	onQueryChange,
	onSelect,
	onEdit,
	onDeactivate,
	onDelete,
	onAdd,
}: EmployeePanelProps) {
	const usernames = new Map(
		linkableAccounts?.map(({ id, username }) => [id, username]),
	);
	return (
		<aside className="panel employee-panel">
			<header className="sales-panel-head">
				<div>
					<span>BƯỚC 1</span>
					<h2>{canManageEmployees ? "Chọn nhân viên" : "Người phụ trách"}</h2>
					<p>
						{canManageEmployees
							? "Chọn người sẽ nhận phân công mới"
							: "Hồ sơ nhân viên liên kết với tài khoản của bạn"}
					</p>
				</div>
				{canManageEmployees && (
					<button
						className="button primary sales-add-employee"
						type="button"
						onClick={onAdd}
					>
						<Plus className="icon-size-16" /> Thêm nhân viên
					</button>
				)}
			</header>
			{canManageEmployees && (
				<div className="sales-search">
					<Search className="icon-size-16" />
					<input
						value={query}
						onChange={(event) => onQueryChange(event.target.value)}
						placeholder="Tìm nhân viên..."
					/>
				</div>
			)}
			<div className="employee-list">
				{employees.map((employee) => {
					const username = usernames.get(employee.linkedAccountId ?? "");
					const accountLabelId = `employee-account-${employee.id}`;
					return (
						<article
							className={`employee-card choice-card ${employee.id === selectedEmployeeId ? "is-selected" : ""} ${employee.status === "inactive" ? "is-inactive" : ""}`}
							key={employee.id}
						>
							<button
								className="employee-card-select"
								type="button"
								onClick={() => onSelect(employee.id)}
								aria-label={`Chọn ${employee.name}`}
								aria-pressed={employee.id === selectedEmployeeId}
								aria-describedby={username ? accountLabelId : undefined}
							>
								<span className="employee-avatar">
									{employeeInitials(employee.name)}
								</span>
								<span className="employee-card-copy">
									<strong>{employee.name}</strong>
									{username && (
										<span
											id={accountLabelId}
											className="employee-card-account"
											title={`@${username}`}
										>
											@{username}
										</span>
									)}
									<small>
										<span>{employee.code}</span>
										<span className="employee-unit-count">
											{assignmentCountByEmployee[employee.id] ?? 0} đơn vị
										</span>
										{employee.status === "inactive" ? " · Đã ngừng" : ""}
									</small>
								</span>
							</button>
							{canManageEmployees && (
								<span className="employee-card-actions">
									<RowActionButton
										action="edit"
										label={`Chỉnh sửa ${employee.name}`}
										title="Chỉnh sửa nhân viên"
										onClick={() => onEdit(employee.id)}
									/>
									{employee.status === "active" && (
										<RowActionButton
											action="deactivate"
											onClick={() => onDeactivate(employee.id)}
											label={`Ngừng hoạt động ${employee.name}`}
											title="Ngừng hoạt động"
										/>
									)}
									<RowActionButton
										action="delete"
										label={`Xóa ${employee.name}`}
										title="Xóa nhân viên"
										onClick={() => onDelete(employee.id)}
									/>
								</span>
							)}
						</article>
					);
				})}
				{employees.length === 0 && (
					<p className="sales-empty">Không tìm thấy nhân viên.</p>
				)}
			</div>
		</aside>
	);
}
