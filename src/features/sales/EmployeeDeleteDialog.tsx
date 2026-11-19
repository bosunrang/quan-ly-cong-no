import { Notice } from "../../shared/ui/Notice";
import { Trash2 } from "lucide-react";
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
	busy?: boolean;
	onConfirm: (effectiveTo: string) => void;
}

export function EmployeeDeleteDialog({
	employee,
	activeAssignmentCount,
	historyCount,
	latestActiveFrom,
	onClose,
	busy = false,
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
			icon={<Trash2 className="icon-size-19" />}
			tone="danger"
			className="employee-delete-dialog"
			onClose={onClose}
			disableClose={busy}
			footer={
				<>
					<button
						className="button secondary"
						type="button"
						disabled={busy}
						onClick={onClose}
					>
						Hủy
					</button>
					<button
						className="button danger"
						type="button"
						disabled={busy || invalidDate}
						onClick={() => onConfirm(effectiveTo)}
					>
						<Trash2 className="icon-size-16" /> Xóa nhân viên
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
						<label htmlFor="employee-remove-effective-to">
							Ngày kết thúc phụ trách
							<DateInput
								id="employee-remove-effective-to"
								ariaLabel="Ngày kết thúc phụ trách trước khi xóa nhân viên"
								value={effectiveTo}
								onChange={setEffectiveTo}
							/>
						</label>
						<Notice
							tone="warning"
							title={`${activeAssignmentCount} đơn vị sẽ trở về “Chưa phân công”`}
						>
							Các lượt đang phụ trách được kết thúc vào ngày đã chọn trước khi
							hồ sơ bị xóa.
						</Notice>
						{invalidDate && (
							<Notice tone="danger" announce>
								Ngày kết thúc không được trước ngày bắt đầu của lượt phân công
								gần nhất.
							</Notice>
						)}
					</>
				)}
				<Notice tone="info" title="Lịch sử phân công vẫn được giữ">
					{historyCount > 0
						? `${historyCount} lượt phân công vẫn lưu tên nhân viên để báo cáo và đối soát.`
						: "Nhân viên này chưa phát sinh lịch sử phân công."}
				</Notice>
				<Notice tone="danger" title="Hồ sơ nhân viên sẽ bị xóa khỏi danh sách">
					Thao tác này không thể hoàn tác trực tiếp. Bạn cần tạo lại hồ sơ nếu
					muốn sử dụng nhân viên này sau đó.
				</Notice>
			</div>
		</Dialog>
	);
}
