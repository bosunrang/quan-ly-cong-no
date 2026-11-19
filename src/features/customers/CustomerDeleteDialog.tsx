import { Notice } from "../../shared/ui/Notice";
import { Building2, Trash2 } from "lucide-react";
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
			icon={<Trash2 className="icon-size-19" />}
			tone="danger"
			className="customer-delete-dialog"
			onClose={onClose}
			footer={
				<>
					<button className="button secondary" type="button" onClick={onClose}>
						Hủy
					</button>
					<button className="button danger" type="button" onClick={onConfirm}>
						<Trash2 className="icon-size-16" /> Xóa khách hàng
					</button>
				</>
			}
		>
			<div className="customer-delete-body">
				<div className="customer-delete-target">
					<span>
						<Building2 className="icon-size-18" />
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
				<Notice tone="warning" title="Xóa dữ liệu liên kết với hồ sơ">
					Lịch sử phân công và thông tin liên kết trong hồ sơ sẽ bị xóa cùng
					khách hàng. Khách hàng đã có chứng từ thu trong sổ đối soát không thể
					xóa.
				</Notice>
				<Notice tone="danger" title="Thao tác không thể khôi phục">
					Hãy kiểm tra đúng tên khách hàng và mã MISA trước khi xác nhận.
				</Notice>
			</div>
		</Dialog>
	);
}
