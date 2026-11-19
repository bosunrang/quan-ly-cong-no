import { Drawer } from "../../shared/ui/Dialog/Drawer";
import { Notice } from "../../shared/ui/Notice";
import { Building2, Save, X } from "lucide-react";
import { useState } from "react";
import {
	normalizeVietnamese,
	provinces,
} from "../../domain/customers/customer.province";
import { customerToDraft } from "../../domain/customers/customer.service";
import { SearchableInput } from "../../shared/ui/SearchableInput";
import type {
	Customer,
	CustomerDraft,
} from "../../domain/customers/customer.model";

interface CustomerFormDrawerProps {
	customer?: Customer;
	customers: Customer[];
	onClose: () => void;
	/** Trả về true khi đã lưu, hoặc nội dung lỗi cần hiển thị trong biểu mẫu. */
	onSave: (
		draft: CustomerDraft,
		customerId?: string,
	) => Promise<boolean | string>;
}

export function CustomerFormDrawer({
	customer,
	customers,
	onClose,
	onSave,
}: CustomerFormDrawerProps) {
	const [draft, setDraft] = useState<CustomerDraft>(() =>
		customerToDraft(customer),
	);
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);

	const update = <K extends keyof CustomerDraft>(
		key: K,
		value: CustomerDraft[K],
	) => {
		setDraft((current) => ({ ...current, [key]: value }));
		setError("");
	};

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (saving) return;
		if (!draft.misaCode.trim() || !draft.name.trim() || !draft.province) {
			setError("Vui lòng nhập mã MISA, tên khách hàng và tỉnh/thành.");
			return;
		}
		const duplicate = customers.some(
			(item) =>
				item.id !== customer?.id &&
				item.misaCode.toLowerCase() === draft.misaCode.trim().toLowerCase(),
		);
		if (duplicate) {
			setError("Mã khách hàng MISA đã tồn tại trong danh mục.");
			return;
		}
		const duplicateTaxCode =
			draft.taxCode.trim() &&
			customers.some(
				(item) =>
					item.id !== customer?.id && item.taxCode === draft.taxCode.trim(),
			);
		if (duplicateTaxCode) {
			setError("Mã số thuế đã được sử dụng bởi một khách hàng khác.");
			return;
		}
		setSaving(true);
		const result = await onSave(draft, customer?.id);
		setSaving(false);
		if (result === true) onClose();
		else if (typeof result === "string") setError(result);
	};

	return (
		<Drawer
			ariaLabelledBy="customer-form-title"
			className="customer-drawer customer-form-drawer"
			onClose={onClose}
		>
			<header className="customer-drawer-head">
				<div>
					<span>{customer ? "CẬP NHẬT HỒ SƠ" : "KHÁCH HÀNG MỚI"}</span>
					<h2 id="customer-form-title">
						{customer ? customer.name : "Thêm khách hàng"}
					</h2>
				</div>
				<button
					className="drawer-close"
					type="button"
					onClick={onClose}
					aria-label="Đóng"
				>
					<X className="icon-size-19" />
				</button>
			</header>

			<form className="customer-form" onSubmit={submit}>
				{error && (
					<Notice tone="danger" announce>
						{error}
					</Notice>
				)}

				<section className="customer-form-section">
					<div className="form-section-title">
						<Building2 className="icon-size-17" />
						<div>
							<strong>Thông tin khách hàng</strong>
							<span>Dữ liệu định danh và đồng bộ với MISA</span>
						</div>
					</div>
					<div className="customer-form-grid">
						<label>
							Mã khách hàng MISA
							<input
								value={draft.misaCode}
								onChange={(event) => update("misaCode", event.target.value)}
								placeholder="Ví dụ: KH-TH-001"
							/>
						</label>
						<label>
							Mã số thuế
							<input
								value={draft.taxCode}
								onChange={(event) => update("taxCode", event.target.value)}
								placeholder="Nhập mã số thuế"
							/>
						</label>
						<label className="field-span-2">
							Tên khách hàng
							<input
								value={draft.name}
								onChange={(event) => update("name", event.target.value)}
								placeholder="Nhập tên đầy đủ"
							/>
						</label>
						<label>
							Trạng thái
							<select
								value={draft.status}
								onChange={(event) =>
									update(
										"status",
										event.target.value as CustomerDraft["status"],
									)
								}
							>
								<option value="active">Đang hoạt động</option>
								<option value="paused">Tạm ngưng</option>
							</select>
						</label>
						<div className="ui-field">
							<label htmlFor="customer-province">Tỉnh/thành</label>
							<SearchableInput
								id="customer-province"
								label="tỉnh/thành"
								value={draft.province}
								options={provinces}
								normalize={normalizeVietnamese}
								onChange={(value) => update("province", value)}
								placeholder="Chọn hoặc nhập tỉnh/thành"
							/>
						</div>
						<label className="field-span-2">
							Địa chỉ
							<input
								value={draft.address}
								onChange={(event) => update("address", event.target.value)}
								placeholder="Nhập địa chỉ giao dịch"
							/>
						</label>
					</div>
				</section>

				<footer className="customer-form-actions">
					<button className="button secondary" type="button" onClick={onClose}>
						Hủy
					</button>
					<button className="button primary" type="submit" disabled={saving}>
						<Save className="icon-size-16" />{" "}
						{customer ? "Lưu thay đổi" : "Thêm khách hàng"}
					</button>
				</footer>
			</form>
		</Drawer>
	);
}
