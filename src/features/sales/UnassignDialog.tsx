import { Notice } from "../../shared/ui/Notice";
import { Building2, CalendarX2, UserMinus } from "lucide-react";
import { useState } from "react";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import type {
	Customer,
	SalesAssignment,
} from "../../domain/customers/customer.model";
import type { SalesEmployee } from "../../domain/employees/employee.model";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { formatDateOnly, todayLocal } from "../../shared/lib/date";

interface UnassignDialogProps {
	customer: Customer;
	employee: SalesEmployee;
	assignment: SalesAssignment;
	onClose: () => void;
	onConfirm: (effectiveTo: string) => void;
}

export function UnassignDialog({
	customer,
	employee,
	assignment,
	onClose,
	onConfirm,
}: UnassignDialogProps) {
	const [effectiveTo, setEffectiveTo] = useState(todayLocal);
	const invalidDate = effectiveTo < assignment.effectiveFrom;

	return (
		<Dialog
			ariaLabelledBy="unassign-dialog-title"
			eyebrow="KẾT THÚC PHỤ TRÁCH"
			title="Bỏ phân công đơn vị"
			icon={<UserMinus className="icon-size-19" />}
			tone="warning"
			className="unassign-dialog"
			onClose={onClose}
			footer={
				<>
					<button className="button secondary" type="button" onClick={onClose}>
						Hủy
					</button>
					<button
						className="button warning"
						type="button"
						disabled={invalidDate}
						onClick={() => onConfirm(effectiveTo)}
					>
						<CalendarX2 className="icon-size-16" /> Kết thúc phụ trách
					</button>
				</>
			}
		>
			<div className="dialog-body">
				<div className="unassign-route">
					<div>
						<span className="employee-avatar">
							{employee.name.split(" ").at(-1)?.slice(0, 1)}
						</span>
						<span>
							<strong>{employee.name}</strong>
							<small>Nhân viên đang phụ trách</small>
						</span>
					</div>
					<UserMinus className="icon-size-20" />
					<div>
						<span className="unassigned-state-icon">
							<Building2 className="icon-size-17" />
						</span>
						<span>
							<strong>Chưa phân công</strong>
							<small>Trạng thái sau khi xác nhận</small>
						</span>
					</div>
				</div>
				<div className="unassign-customer">
					<Building2 className="icon-size-18" />
					<div>
						<strong>{customer.name}</strong>
						<span>
							{customer.misaCode} · {customer.province}
						</span>
					</div>
				</div>
				<label htmlFor="unassign-effective-to">
					Ngày kết thúc phụ trách
					<DateInput
						id="unassign-effective-to"
						ariaLabel="Ngày kết thúc phụ trách"
						value={effectiveTo}
						onChange={setEffectiveTo}
					/>
				</label>
				<Notice tone="info">
					Khách hàng vẫn được giữ trong danh mục và sẽ trở về nhóm “Chưa phân
					công”. Lịch sử của {employee.name} được lưu đến ngày kết thúc đã chọn.
				</Notice>
				{invalidDate && (
					<Notice tone="danger" announce>
						Ngày kết thúc không được trước ngày bắt đầu phụ trách{" "}
						{formatDateOnly(assignment.effectiveFrom)}.
					</Notice>
				)}
			</div>
		</Dialog>
	);
}
