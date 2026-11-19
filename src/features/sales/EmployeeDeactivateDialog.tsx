import { Notice } from "../../shared/ui/Notice";
import { UserX } from "lucide-react";
import { useState } from "react";
import type { SalesEmployee } from "../../domain/employees/employee.model";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { todayLocal } from "../../shared/lib/date";

interface EmployeeDeactivateDialogProps {
	employee: SalesEmployee;
	activeAssignmentCount: number;
	historyCount: number;
	latestActiveFrom?: string;
	onClose: () => void;
	onConfirm: (effectiveTo: string) => void;
}

export function EmployeeDeactivateDialog({
	employee,
	activeAssignmentCount,
	historyCount,
	latestActiveFrom,
	onClose,
	onConfirm,
}: EmployeeDeactivateDialogProps) {
	const [effectiveTo, setEffectiveTo] = useState(todayLocal);
	const invalidDate = Boolean(
		latestActiveFrom && effectiveTo < latestActiveFrom,
	);

	return (
		<Dialog
			ariaLabelledBy="employee-delete-title"
			eyebrow="QUẢN LÝ NHÂN VIÊN"
			title="Ngừng hoạt động"
			icon={<UserX className="icon-size-19" />}
			tone="warning"
			className="employee-delete-dialog"
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
						<UserX className="icon-size-16" /> Ngừng hoạt động
					</button>
				</>
			}
		>
			<div className="dialog-body">
				<div className="employee-delete-target">
					<strong>{employee.name}</strong>
					<span>{employee.code}</span>
				</div>
				{activeAssignmentCount > 0 && (
					<>
						<label htmlFor="employee-effective-to">
							Ngày kết thúc phụ trách
							<DateInput
								id="employee-effective-to"
								ariaLabel="Ngày kết thúc phụ trách của nhân viên"
								value={effectiveTo}
								onChange={setEffectiveTo}
							/>
						</label>
						<Notice
							tone="warning"
							title={`${activeAssignmentCount} đơn vị sẽ trở về “Chưa phân công”`}
						>
							Các lượt đang hoạt động sẽ được đóng vào ngày đã chọn; sau đó có
							thể giao lại cho nhân viên khác.
						</Notice>
						{invalidDate && (
							<Notice tone="danger" announce>
								Ngày kết thúc không được trước ngày bắt đầu của lượt phân công
								gần nhất.
							</Notice>
						)}
					</>
				)}
				<Notice tone="info" title="Hồ sơ và lịch sử được giữ lại">
					{historyCount > 0
						? `${historyCount} lượt phân công liên quan vẫn được lưu để tra cứu và đối soát.`
						: "Nhân viên sẽ được chuyển sang trạng thái ngừng hoạt động và có thể kích hoạt lại sau."}
				</Notice>
			</div>
		</Dialog>
	);
}
