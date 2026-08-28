import { AlertTriangle, History, Trash2 } from "lucide-react";
import { useState } from "react";
import type { SalesEmployee } from "../../domain/employees/employee.model";
import { todayLocal } from "../../shared/lib/date";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { Dialog } from "../../shared/ui/Dialog/Dialog";

interface EmployeeDeleteDialogProps {
	employee: SalesEmployee;
	activeAssignmentCount: number;
	historyCount: number;
	latestActiveFrom?: string;
	onClose: () => void;
	onConfirm: (effectiveTo: string) => void;
}

export function EmployeeDeleteDialog({
	employee,
	activeAssignmentCount,
	historyCount,
	latestActiveFrom,
	onClose,
	onConfirm,
}: EmployeeDeleteDialogProps) {
	const [effectiveTo, setEffectiveTo] = useState(todayLocal);
	const invalidDate = Boolean(
		latestActiveFrom && effectiveTo < latestActiveFrom,
	);

	return (
		<Dialog
			ariaLabelledBy="employee-remove-title"
			eyebrow="XÓA NHÂN VIÊN"
			title="Xác nhận xóa hồ sơ"
			icon={<Trash2 size={19} />}
			tone="danger"
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
						<Trash2 size={16} /> Xóa nhân viên
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
						<label htmlFor="employee-remove-effective-to">
							Ngày kết thúc phụ trách
							<DateInput
								id="employee-remove-effective-to"
								ariaLabel="Ngày kết thúc phụ trách trước khi xóa nhân viên"
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
									Các lượt đang phụ trách được kết thúc vào ngày đã chọn trước
									khi hồ sơ bị xóa.
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
						<strong>Lịch sử phân công vẫn được giữ</strong>
						<span>
							{historyCount > 0
								? `${historyCount} lượt phân công vẫn lưu tên nhân viên để báo cáo và đối soát.`
								: "Nhân viên này chưa phát sinh lịch sử phân công."}
						</span>
					</div>
				</div>
				<div className="delete-rule-card danger">
					<Trash2 size={19} />
					<div>
						<strong>Hồ sơ nhân viên sẽ bị xóa khỏi danh sách</strong>
						<span>
							Thao tác này không thể hoàn tác trực tiếp. Bạn cần tạo lại hồ sơ
							nếu muốn sử dụng nhân viên này sau đó.
						</span>
					</div>
				</div>
			</div>
		</Dialog>
	);
}
