import { AlertTriangle, Package, Trash2 } from "lucide-react";
import type { Product } from "../../domain/products/product.model";
import { Dialog } from "../../shared/ui/Dialog/Dialog";

interface Props {
	product: Product;
	policyCount: number;
	onClose: () => void;
	onConfirm: () => void;
}

export function ProductDeleteDialog({
	product,
	policyCount,
	onClose,
	onConfirm,
}: Props) {
	return (
		<Dialog
			ariaLabelledBy="product-delete-title"
			eyebrow="QUẢN LÝ SẢN PHẨM"
			title="Xóa sản phẩm và lịch sử"
			icon={<Trash2 size={19} />}
			tone="danger"
			className="product-delete-dialog"
			onClose={onClose}
			footer={
				<>
					<button className="button secondary" type="button" onClick={onClose}>
						Hủy
					</button>
					<button className="button danger" type="button" onClick={onConfirm}>
						<Trash2 size={16} /> Xóa sản phẩm và lịch sử
					</button>
				</>
			}
		>
			<div className="product-delete-body">
				<div className="product-delete-target">
					<span>
						<Package size={18} />
					</span>
					<div>
						<strong>{product.name}</strong>
						<small>
							{product.code} · {product.group || "Chưa phân nhóm"} ·{" "}
							{product.unit || "Chưa có ĐVT"}
						</small>
					</div>
				</div>
				<div className="product-delete-warning">
					<AlertTriangle size={19} />
					<div>
						<strong>
							{policyCount > 0
								? `${policyCount} bản ghi chính sách sẽ bị xóa cùng sản phẩm`
								: "Sản phẩm chưa có lịch sử chính sách"}
						</strong>
						<span>
							Dữ liệu đơn hàng đã nhập vẫn được giữ nguyên; sản phẩm và toàn bộ
							lịch sử chính sách trong danh mục sẽ bị xóa.
						</span>
					</div>
				</div>
				<div className="product-delete-danger">
					<Trash2 size={19} />
					<div>
						<strong>Thao tác không thể khôi phục</strong>
						<span>
							Hãy kiểm tra đúng mã, tên sản phẩm và số bản ghi chính sách trước
							khi xác nhận.
						</span>
					</div>
				</div>
			</div>
		</Dialog>
	);
}
