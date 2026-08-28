import { BadgeDollarSign, Save } from "lucide-react";
import { useState } from "react";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import type {
	DiscountRecipient,
	RecipientDraft,
} from "../../domain/customers/customer.model";
import { todayLocal } from "../../shared/lib/date";

interface RecipientFormDialogProps {
	recipient?: DiscountRecipient;
	hasActiveRecipients: boolean;
	onClose: () => void;
	onSave: (draft: RecipientDraft, recipientId?: string) => boolean;
}

export function RecipientFormDialog({
	recipient,
	hasActiveRecipients,
	onClose,
	onSave,
}: RecipientFormDialogProps) {
	const [draft, setDraft] = useState<RecipientDraft>({
		fullName: recipient?.fullName ?? "",
		position: recipient?.position ?? "",
		phone: recipient?.phone ?? "",
		effectiveFrom: recipient?.effectiveFrom ?? todayLocal(),
		isPrimary: recipient?.isPrimary ?? !hasActiveRecipients,
	});
	const [error, setError] = useState("");

	const update = <K extends keyof RecipientDraft>(
		key: K,
		value: RecipientDraft[K],
	) => {
		setDraft((current) => ({ ...current, [key]: value }));
		setError("");
	};

	const submit = (event: React.FormEvent) => {
		event.preventDefault();
		if (!draft.fullName.trim()) {
			setError("Vui lòng nhập họ và tên người nhận chiết khấu.");
			return;
		}
		if (onSave(draft, recipient?.id)) onClose();
	};

	return (
		<Dialog
			ariaLabelledBy="recipient-dialog-title"
			eyebrow={recipient ? "CẬP NHẬT NGƯỜI NHẬN" : "NGƯỜI NHẬN MỚI"}
			title={recipient ? recipient.fullName : "Thêm người nhận chiết khấu"}
			icon={<BadgeDollarSign size={19} />}
			onClose={onClose}
			onSubmit={submit}
			footer={
				<>
					<button className="button secondary" type="button" onClick={onClose}>
						Hủy
					</button>
					<button className="button primary" type="submit">
						<Save size={16} /> {recipient ? "Lưu thay đổi" : "Thêm người nhận"}
					</button>
				</>
			}
		>
			<div className="dialog-body">
				{error && <div className="form-alert">{error}</div>}
				<label>
					Họ và tên
					<input
						autoFocus
						value={draft.fullName}
						onChange={(event) => update("fullName", event.target.value)}
						placeholder="Nhập họ và tên"
					/>
				</label>
				<div className="dialog-grid">
					<label>
						Chức vụ/Bộ phận
						<input
							value={draft.position}
							onChange={(event) => update("position", event.target.value)}
							placeholder="Ví dụ: Phòng vật tư"
						/>
					</label>
					<label>
						Số điện thoại
						<input
							value={draft.phone}
							onChange={(event) => update("phone", event.target.value)}
							placeholder="Nhập số điện thoại"
						/>
					</label>
				</div>
				<label htmlFor="recipient-effective-from">
					Hiệu lực từ
					<DateInput
						id="recipient-effective-from"
						ariaLabel="Ngày hiệu lực người nhận"
						value={draft.effectiveFrom}
						onChange={(value) => update("effectiveFrom", value)}
					/>
				</label>
				<label className="recipient-primary-check">
					<input
						type="checkbox"
						checked={draft.isPrimary}
						onChange={(event) => update("isPrimary", event.target.checked)}
					/>
					<span>
						<strong>Đặt làm người nhận mặc định</strong>
						<small>
							Hệ thống ưu tiên gợi ý người này khi lập khoản chi mới.
						</small>
					</span>
				</label>
				<p className="dialog-note">
					Một khách hàng có thể có nhiều người nhận đang hoạt động. Người nhận
					thực tế sẽ được chọn khi lập chiết khấu theo kỳ.
				</p>
			</div>
		</Dialog>
	);
}
