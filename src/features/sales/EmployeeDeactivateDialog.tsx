import { AlertTriangle, History, UserX } from "lucide-react";
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
			icon={<UserX size={19} />}
			tone="warning"
			className="employee-delete-dialog"
			onClose={onClose}
			footer={
				<>
					<button className="button secondary" type="button" onClick={onClose}>
						Hủy
					</button>
					<button
						className="button danger"
						type="button"
						disabled={invalidDate}
						onClick={() => onConfirm(effectiveTo)}
					>
						<UserX size={16} /> Ngừng hoạt động
					</button>
				</>
			}
		>
			<div className="employee-delete-body">
				<div className="employee-delete-target">
					<strong>{employee.name}</strong>
					<span>
						{employee.code} ·{" "}
						{employee.phone || employee.email || "Chưa có thông tin liên hệ"}
					</span>
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
						<div className="delete-rule-card warning">
							<AlertTriangle size={19} />
							<div>
								<strong>
									{activeAssignmentCount} đơn vị sẽ trở về “Chưa phân công”
								</strong>
								<span>
									Các lượt đang hoạt động sẽ được đóng vào ngày đã chọn; sau đó
									có thể giao lại cho nhân viên khác.
								</span>
							</div>
						</div>
						{invalidDate && (
							<p className="assignment-error">
								Ngày kết thúc không được trước ngày bắt đầu của lượt phân công
								gần nhất.
							</p>
						)}
					</>
				)}
				<div className="delete-rule-card">
					<History size={19} />
					<div>
						<strong>Hồ sơ và lịch sử được giữ lại</strong>
						<span>
							{historyCount > 0
								? `${historyCount} lượt phân công liên quan vẫn được lưu để tra cứu và đối soát.`
								: "Nhân viên sẽ được chuyển sang trạng thái ngừng hoạt động và có thể kích hoạt lại sau."}
						</span>
					</div>
				</div>
			</div>
		</Dialog>
	);
}
