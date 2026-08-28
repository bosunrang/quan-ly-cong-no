import { PackagePlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Product } from "../../domain/products/product.model";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import type { ProductDraft } from "./useProductCatalog";

interface Props {
	product?: Product;
	onClose: () => void;
	onSave: (draft: ProductDraft, productId?: string) => void;
}

export function ProductFormDialog({ product, onClose, onSave }: Props) {
	const [draft, setDraft] = useState<ProductDraft>(() => ({
		code: product?.code ?? "",
		name: product?.name ?? "",
		group: product?.group ?? "",
		unit: product?.unit ?? "",
		status: product?.status ?? "active",
	}));
	const [error, setError] = useState("");
	const submit = (event: FormEvent) => {
		event.preventDefault();
		try {
			onSave(draft, product?.id);
			onClose();
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Không thể lưu sản phẩm.",
			);
		}
	};
	return (
		<Dialog
			ariaLabelledBy="product-form-title"
			eyebrow="Danh mục sản phẩm"
			title={product ? "Cập nhật sản phẩm" : "Thêm sản phẩm"}
			icon={<PackagePlus size={19} />}
			onClose={onClose}
			onSubmit={submit}
			footer={
				<>
					<button className="button secondary" type="button" onClick={onClose}>
						Hủy
					</button>
					<button className="button primary" type="submit">
						Lưu sản phẩm
					</button>
				</>
			}
		>
			<div className="dialog-body product-form-body">
				{error && <p className="form-alert">{error}</p>}
				<div className="dialog-grid">
					<label>
						Mã sản phẩm
						<input
							value={draft.code}
							onChange={(event) =>
								setDraft({ ...draft, code: event.target.value })
							}
							autoFocus
						/>
					</label>
					<label>
						Tên sản phẩm
						<input
							value={draft.name}
							onChange={(event) =>
								setDraft({ ...draft, name: event.target.value })
							}
						/>
					</label>
				</div>
				<div className="dialog-grid">
					<label>
						Nhóm sản phẩm
						<input
							value={draft.group}
							onChange={(event) =>
								setDraft({ ...draft, group: event.target.value })
							}
						/>
					</label>
					<label>
						Đơn vị tính
						<input
							value={draft.unit}
							onChange={(event) =>
								setDraft({ ...draft, unit: event.target.value })
							}
						/>
					</label>
				</div>
				<label>
					Trạng thái
					<select
						value={draft.status}
						onChange={(event) =>
							setDraft({
								...draft,
								status: event.target.value as Product["status"],
							})
						}
					>
						<option value="active">Đang hoạt động</option>
						<option value="paused">Tạm ngưng</option>
					</select>
				</label>
			</div>
		</Dialog>
	);
}
