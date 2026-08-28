import { BriefcaseBusiness, UserCheck, UsersRound, UserX } from "lucide-react";
import type { Customer } from "../../../domain/customers/customer.model";
import type { SalesEmployee } from "../../../domain/employees/employee.model";
import { activeSalesAssignment } from "../../../domain/assignments/assignment.service";

interface SalesStatsProps {
	customers: Customer[];
	employees: SalesEmployee[];
	selectedEmployee?: SalesEmployee;
	selectedAssignmentCount: number;
}

export function SalesStats({
	customers,
	employees,
	selectedEmployee,
	selectedAssignmentCount,
}: SalesStatsProps) {
	const activeEmployees = employees.filter(
		(employee) => employee.status === "active",
	).length;
	const assigned = customers.filter((customer) =>
		Boolean(activeSalesAssignment(customer)),
	).length;
	const unassigned = customers.filter(
		(customer) =>
			customer.status === "active" && !activeSalesAssignment(customer),
	).length;
	return (
		<section
			className="customer-stat-grid sales-stat-grid"
			aria-label="Tổng quan phân công"
		>
			<article>
				<div className="customer-stat-icon total">
					<UsersRound size={19} />
				</div>
				<div>
					<span>Nhân viên hoạt động</span>
					<strong>{activeEmployees}</strong>
					<small>{employees.length} hồ sơ nhân viên</small>
				</div>
			</article>
			<article>
				<div className="customer-stat-icon state">
					<UserCheck size={19} />
				</div>
				<div>
					<span>Đơn vị đã phân công</span>
					<strong>{assigned}</strong>
					<small>
						{customers.length
							? Math.round((assigned / customers.length) * 100)
							: 0}
						% danh mục khách hàng
					</small>
				</div>
			</article>
			<article className={unassigned ? "needs-attention" : ""}>
				<div className="customer-stat-icon warning">
					<UserX size={19} />
				</div>
				<div>
					<span>Chưa có người phụ trách</span>
					<strong>{unassigned}</strong>
					<small>Cần hoàn thiện phân công</small>
				</div>
			</article>
			<article className="selected-employee-stat">
				<div className="customer-stat-icon private">
					<BriefcaseBusiness size={19} />
				</div>
				<div>
					<span>Nhân viên đang chọn</span>
					<strong>{selectedEmployee?.name ?? "Chưa chọn"}</strong>
					<small>{selectedAssignmentCount} đơn vị đang phụ trách</small>
				</div>
			</article>
		</section>
	);
}
