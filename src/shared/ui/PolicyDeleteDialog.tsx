import { AlertTriangle, BadgeDollarSign, Trash2 } from "lucide-react";
import { Dialog } from "./Dialog/Dialog";

interface Props {
	policyName: string;
	context: string;
	details: string;
	onClose: () => void;
	onConfirm: () => void;
}

export function PolicyDeleteDialog({
	policyName,
	context,
	details,
	onClose,
	onConfirm,
}: Props) {
	return (
		<Dialog
			ariaLabelledBy="policy-delete-title"
			eyebrow="CHÍNH SÁCH CHIẾT KHẤU"
			title="Xóa chính sách"
			icon={<Trash2 size={19} />}
			tone="danger"
			className="policy-delete-dialog"
			onClose={onClose}
			footer={
				<>
					<button className="button secondary" type="button" onClick={onClose}>
						Hủy
					</button>
					<button className="button danger" type="button" onClick={onConfirm}>
						<Trash2 size={16} /> Xóa chính sách
					</button>
				</>
			}
		>
			<div className="policy-delete-body">
				<div className="policy-delete-target">
					<span>
						<BadgeDollarSign size={19} />
					</span>
					<div>
						<strong>{policyName}</strong>
						<small>{context}</small>
						<small>{details}</small>
					</div>
				</div>
				<div className="policy-delete-warning">
					<AlertTriangle size={19} />
					<div>
						<strong>Chỉ xóa phiên bản chính sách này</strong>
						<span>
							Sản phẩm, khách hàng và các phiên bản chính sách khác vẫn được giữ
							nguyên. Thao tác này không thể khôi phục.
						</span>
					</div>
				</div>
			</div>
		</Dialog>
	);
}
