import { Notice } from "../../shared/ui/Notice";
import { Pencil, Save, UserRoundPlus } from "lucide-react";
import { useState } from "react";
import type { AccountProfile } from "../../domain/access/accounts.model";
import type {
	EmployeeDraft,
	SalesEmployee,
} from "../../domain/employees/employee.model";
import { Dialog } from "../../shared/ui/Dialog/Dialog";

interface EmployeeFormDialogProps {
	employees: SalesEmployee[];
	linkableAccounts?: readonly AccountProfile[];
	employee?: SalesEmployee;
	assignedCount?: number;
	onClose: () => void;
	busy?: boolean;
	onSave: (draft: EmployeeDraft) => Promise<boolean>;
}

export function EmployeeFormDialog({
	employees,
	linkableAccounts,
	employee,
	assignedCount = 0,
	onClose,
	busy = false,
	onSave,
}: EmployeeFormDialogProps) {
	const [draft, setDraft] = useState<EmployeeDraft>(() =>
		employee
			? {
					code: employee.code,
					name: employee.name,
					linkedAccountId: employee.linkedAccountId,
					status: employee.status,
				}
			: { code: "", name: "", status: "active" },
	);
	const [error, setError] = useState("");
	const accountsInUse = new Set(
		employees
			.filter((item) => item.id !== employee?.id)
			.map((item) => item.linkedAccountId),
	);
	const availableAccounts = linkableAccounts?.filter(
		(account) => !accountsInUse.has(account.id),
	);
	const missingAccount =
		draft.linkedAccountId &&
		!availableAccounts?.some((account) => account.id === draft.linkedAccountId);
	const update = <K extends keyof EmployeeDraft>(
		key: K,
		value: EmployeeDraft[K],
	) => {
		setDraft((current) => ({ ...current, [key]: value }));
		setError("");
	};

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (busy) return;
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
		if (linkableAccounts && draft.linkedAccountId) {
			if (accountsInUse.has(draft.linkedAccountId)) {
				setError("Tài khoản này đã liên kết với nhân viên khác.");
				return;
			}
			if (missingAccount) {
				setError("Tài khoản không còn trong danh sách. Hãy chọn lại.");
				return;
			}
		}
		if (await onSave(draft)) onClose();
		else setError("Không lưu được nhân viên. Kiểm tra dữ liệu rồi thử lại.");
	};

	return (
		<Dialog
			ariaLabelledBy="employee-dialog-title"
			eyebrow="NHÂN VIÊN"
			title={employee ? "Chỉnh sửa nhân viên" : "Thêm nhân viên"}
			icon={
				employee ? (
					<Pencil className="icon-size-19" />
				) : (
					<UserRoundPlus className="icon-size-19" />
				)
			}
			className="employee-dialog"
			onClose={onClose}
			disableClose={busy}
			onSubmit={submit}
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
					<button className="button primary" type="submit" disabled={busy}>
						<Save className="icon-size-16" />{" "}
						{employee ? "Lưu thay đổi" : "Thêm nhân viên"}
					</button>
				</>
			}
		>
			<div className="dialog-body">
				{error && (
					<Notice tone="danger" announce>
						{error}
					</Notice>
				)}
				<div className="dialog-grid">
					<label>
						Mã nhân viên
						<input
							value={draft.code}
							onChange={(event) => update("code", event.target.value)}
							placeholder="Ví dụ: NV-005"
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
				<label>
					Tài khoản liên kết
					<select
						value={draft.linkedAccountId ?? ""}
						disabled={!linkableAccounts}
						title={
							!linkableAccounts
								? "Chỉ quản trị viên được thay đổi liên kết."
								: undefined
						}
						onChange={(event) =>
							update("linkedAccountId", event.target.value || undefined)
						}
					>
						<option value="">Chưa liên kết</option>
						{missingAccount && (
							<option value={draft.linkedAccountId}>
								{linkableAccounts
									? "Tài khoản không còn trong danh sách"
									: "Đã liên kết"}
							</option>
						)}
						{availableAccounts?.map((account) => (
							<option key={account.id} value={account.id}>
								{account.name} · {account.username}
								{account.active ? "" : " · Đã khóa"}
							</option>
						))}
					</select>
				</label>
				{assignedCount > 0 && (
					<Notice tone="warning">
						Nhân viên đang phụ trách {assignedCount} đơn vị. Cần chuyển giao hết
						trước khi chuyển sang trạng thái ngừng hoạt động.
					</Notice>
				)}
			</div>
		</Dialog>
	);
}
