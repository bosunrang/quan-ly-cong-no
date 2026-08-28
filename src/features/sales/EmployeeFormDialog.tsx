import { AlertCircle, Pencil, Save, UserRoundPlus } from "lucide-react";
import { useState } from "react";
import type {
	EmployeeDraft,
	SalesEmployee,
} from "../../domain/employees/employee.model";
import { Dialog } from "../../shared/ui/Dialog/Dialog";

interface EmployeeFormDialogProps {
	employees: SalesEmployee[];
	employee?: SalesEmployee;
	assignedCount?: number;
	onClose: () => void;
	onSave: (draft: EmployeeDraft) => boolean;
}

export function EmployeeFormDialog({
	employees,
	employee,
	assignedCount = 0,
	onClose,
	onSave,
}: EmployeeFormDialogProps) {
	const [draft, setDraft] = useState<EmployeeDraft>(() =>
		employee
			? {
					code: employee.code,
					name: employee.name,
					phone: employee.phone,
					email: employee.email,
					status: employee.status,
				}
			: { code: "", name: "", phone: "", email: "", status: "active" },
	);
	const [error, setError] = useState("");
	const update = <K extends keyof EmployeeDraft>(
		key: K,
		value: EmployeeDraft[K],
	) => {
		setDraft((current) => ({ ...current, [key]: value }));
		setError("");
	};

	const submit = (event: React.FormEvent) => {
		event.preventDefault();
		if (!draft.code.trim() || !draft.name.trim()) {
			setError("Vui lòng nhập mã và tên nhân viên.");
			return;
		}
		if (
			employees.some(
				(item) =>
					item.id !== employee?.id &&
					item.code.toLowerCase() === draft.code.trim().toLowerCase(),
			)
		) {
			setError("Mã nhân viên đã tồn tại.");
			return;
		}
		if (onSave(draft)) onClose();
	};

	return (
		<Dialog
			ariaLabelledBy="employee-dialog-title"
			eyebrow="NHÂN VIÊN KINH DOANH"
			title={employee ? "Chỉnh sửa nhân viên" : "Thêm nhân viên"}
			icon={employee ? <Pencil size={19} /> : <UserRoundPlus size={19} />}
			className="employee-dialog"
			onClose={onClose}
			onSubmit={submit}
			footer={
				<>
					<button className="button secondary" type="button" onClick={onClose}>
						Hủy
					</button>
					<button className="button primary" type="submit">
						<Save size={16} /> {employee ? "Lưu thay đổi" : "Thêm nhân viên"}
					</button>
				</>
			}
		>
			<div className="dialog-body">
				{error && (
					<div className="form-alert">
						<AlertCircle size={17} />
						<span>{error}</span>
					</div>
				)}
				<div className="dialog-grid">
					<label>
						Mã nhân viên
						<input
							value={draft.code}
							onChange={(event) => update("code", event.target.value)}
							placeholder="Ví dụ: NVKD-005"
						/>
					</label>
					<label>
						Trạng thái
						<select
							value={draft.status}
							onChange={(event) =>
								update("status", event.target.value as EmployeeDraft["status"])
							}
						>
							<option value="active">Đang làm việc</option>
							<option value="inactive" disabled={assignedCount > 0}>
								Ngừng hoạt động
							</option>
						</select>
					</label>
				</div>
				<label>
					Họ và tên
					<input
						value={draft.name}
						onChange={(event) => update("name", event.target.value)}
						placeholder="Nhập tên nhân viên"
					/>
				</label>
				<div className="dialog-grid">
					<label>
						Số điện thoại
						<input
							value={draft.phone}
							onChange={(event) => update("phone", event.target.value)}
							placeholder="Nhập số điện thoại"
						/>
					</label>
					<label>
						Email
						<input
							type="email"
							value={draft.email}
							onChange={(event) => update("email", event.target.value)}
							placeholder="ten@congty.vn"
						/>
					</label>
				</div>
				<p className="dialog-note">
					Tỉnh/thành không được gắn cố định cho nhân viên. Bạn sẽ chọn từng đơn
					vị cụ thể để phân công ở màn hình chính.
				</p>
				{assignedCount > 0 && (
					<p className="assignment-warning">
						Nhân viên đang phụ trách {assignedCount} đơn vị. Cần chuyển giao hết
						trước khi chuyển sang trạng thái ngừng hoạt động.
					</p>
				)}
			</div>
		</Dialog>
	);
}
