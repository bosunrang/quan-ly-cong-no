import { Pencil, Plus, Search, Trash2, UserX } from "lucide-react";
import type { SalesEmployee } from "../../../domain/employees/employee.model";

export function employeeInitials(name: string): string {
	const words = name.trim().split(/\s+/);
	return `${words.at(-2)?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
}

interface EmployeePanelProps {
	employees: SalesEmployee[];
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
	return (
		<aside className="panel employee-panel">
			<header className="sales-panel-head">
				<div>
					<span>BƯỚC 1</span>
					<h2>Chọn nhân viên</h2>
					<p>Chọn người sẽ nhận phân công mới</p>
				</div>
			</header>
			<div className="sales-search">
				<Search size={16} />
				<input
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
					placeholder="Tìm nhân viên..."
				/>
			</div>
			<div className="employee-list">
				{employees.map((employee) => (
					<article
						className={`employee-card ${employee.id === selectedEmployeeId ? "is-selected" : ""} ${employee.status === "inactive" ? "is-inactive" : ""}`}
						key={employee.id}
					>
						<button
							className="employee-card-select"
							type="button"
							onClick={() => onSelect(employee.id)}
							aria-label={`Chọn ${employee.name}`}
							aria-pressed={employee.id === selectedEmployeeId}
						>
							<span className="employee-avatar">
								{employeeInitials(employee.name)}
							</span>
							<span className="employee-card-copy">
								<strong>{employee.name}</strong>
								<small>
									<span>{employee.code}</span>
									<span className="employee-unit-count">
										{assignmentCountByEmployee[employee.id] ?? 0} đơn vị
									</span>
									{employee.status === "inactive" ? " · Đã ngừng" : ""}
								</small>
							</span>
						</button>
						<span className="employee-card-actions">
							<button
								type="button"
								onClick={() => onEdit(employee.id)}
								aria-label={`Chỉnh sửa ${employee.name}`}
								title="Chỉnh sửa nhân viên"
							>
								<Pencil size={15} />
							</button>
							{employee.status === "active" && (
								<button
									className="danger"
									type="button"
									onClick={() => onDeactivate(employee.id)}
									aria-label={`Ngừng hoạt động ${employee.name}`}
									title="Ngừng hoạt động"
								>
									<UserX size={15} />
								</button>
							)}
							<button
								className="danger"
								type="button"
								onClick={() => onDelete(employee.id)}
								aria-label={`Xóa ${employee.name}`}
								title="Xóa nhân viên"
							>
								<Trash2 size={15} />
							</button>
						</span>
					</article>
				))}
				{employees.length === 0 && (
					<p className="sales-empty">Không tìm thấy nhân viên.</p>
				)}
			</div>
			<button className="sales-add-employee" type="button" onClick={onAdd}>
				<Plus size={16} /> Thêm nhân viên kinh doanh
			</button>
		</aside>
	);
}
