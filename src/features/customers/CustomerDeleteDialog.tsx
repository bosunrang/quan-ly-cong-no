import { AlertTriangle, Building2, Trash2 } from "lucide-react";
import type { Customer } from "../../domain/customers/customer.model";
import { Dialog } from "../../shared/ui/Dialog/Dialog";

interface CustomerDeleteDialogProps {
	customer: Customer;
	onClose: () => void;
	onConfirm: () => void;
}

export function CustomerDeleteDialog({
	customer,
	onClose,
	onConfirm,
}: CustomerDeleteDialogProps) {
	return (
		<Dialog
			ariaLabelledBy="customer-delete-title"
			eyebrow="QUẢN LÝ KHÁCH HÀNG"
			title="Xóa khách hàng"
			icon={<Trash2 size={19} />}
			tone="danger"
			className="customer-delete-dialog"
			onClose={onClose}
			footer={
				<>
					<button className="button secondary" type="button" onClick={onClose}>
						Hủy
					</button>
					<button className="button danger" type="button" onClick={onConfirm}>
						<Trash2 size={16} /> Xóa khách hàng
					</button>
				</>
			}
		>
			<div className="customer-delete-body">
				<div className="customer-delete-target">
					<span>
						<Building2 size={18} />
					</span>
					<div>
						<strong>{customer.name}</strong>
						<small>
							{customer.misaCode}
							{customer.taxCode ? ` · MST ${customer.taxCode}` : ""}
						</small>
						<small>
							{customer.province} · {customer.address}
						</small>
					</div>
				</div>
				<div className="customer-delete-warning">
					<AlertTriangle size={19} />
					<div>
						<strong>Xóa toàn bộ dữ liệu nằm trong hồ sơ</strong>
						<span>
							{customer.recipients.length} người nhận chiết khấu và{" "}
							{customer.assignments.length} lượt phân công liên quan sẽ bị xóa
							cùng khách hàng.
						</span>
					</div>
				</div>
				<div className="customer-delete-danger">
					<Trash2 size={19} />
					<div>
						<strong>Thao tác không thể khôi phục</strong>
						<span>
							Hãy kiểm tra đúng tên khách hàng và mã MISA trước khi xác nhận.
						</span>
					</div>
				</div>
			</div>
		</Dialog>
	);
}
