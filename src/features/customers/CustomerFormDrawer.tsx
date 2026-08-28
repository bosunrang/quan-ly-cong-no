import { AlertCircle, BadgeDollarSign, Building2, Save, X } from "lucide-react";
import { useState } from "react";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { provinces } from "../../domain/customers/customer.province";
import {
	customerToDraft,
	recipientTransitionError,
} from "../../domain/customers/customer.service";
import type {
	Customer,
	CustomerDraft,
} from "../../domain/customers/customer.model";

interface CustomerFormDrawerProps {
	customer?: Customer;
	customers: Customer[];
	onClose: () => void;
	onSave: (draft: CustomerDraft, customerId?: string) => boolean;
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

	const update = <K extends keyof CustomerDraft>(
		key: K,
		value: CustomerDraft[K],
	) => {
		setDraft((current) => ({ ...current, [key]: value }));
		setError("");
	};

	const submit = (event: React.FormEvent) => {
		event.preventDefault();
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
		if (customer) {
			const transitionError = recipientTransitionError(customer, draft);
			if (transitionError) {
				setError(transitionError);
				return;
			}
		}
		if (onSave(draft, customer?.id)) onClose();
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Backdrop click closes the modal; the dialog itself remains the semantic interactive surface.
		<div
			className="customer-overlay"
			role="presentation"
			onMouseDown={(event) => event.target === event.currentTarget && onClose()}
		>
			<aside
				className="customer-drawer customer-form-drawer"
				role="dialog"
				aria-modal="true"
				aria-labelledby="customer-form-title"
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
						<X size={19} />
					</button>
				</header>

				<form className="customer-form" onSubmit={submit}>
					{error && (
						<div className="form-alert">
							<AlertCircle size={17} />
							<span>{error}</span>
						</div>
					)}

					<section className="customer-form-section">
						<div className="form-section-title">
							<Building2 size={17} />
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
								Nhóm khách hàng
								<select
									value={draft.group}
									onChange={(event) =>
										update(
											"group",
											event.target.value as CustomerDraft["group"],
										)
									}
								>
									<option value="state">Nhà nước</option>
									<option value="private">Tư nhân</option>
								</select>
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
								Mã số thuế
								<input
									value={draft.taxCode}
									onChange={(event) => update("taxCode", event.target.value)}
									placeholder="Nhập mã số thuế"
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
							<label>
								Tỉnh/thành
								<input
									list="customer-province-options"
									value={draft.province}
									onChange={(event) => update("province", event.target.value)}
									placeholder="Chọn hoặc nhập tỉnh/thành"
								/>
								<datalist id="customer-province-options">
									{provinces.map((province) => (
										<option key={province} value={province} />
									))}
								</datalist>
							</label>
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

					<section className="customer-form-section">
						<div className="form-section-title">
							<BadgeDollarSign size={17} />
							<div>
								<strong>Người nhận chiết khấu mặc định</strong>
								<span>
									Thiết lập người đầu tiên; có thể thêm nhiều người trong hồ sơ
									khách hàng
								</span>
							</div>
						</div>
						<div className="customer-form-grid">
							<label>
								Họ và tên
								<input
									value={draft.recipientName}
									onChange={(event) =>
										update("recipientName", event.target.value)
									}
									placeholder="Nhập người nhận chính"
								/>
							</label>
							<label>
								Chức vụ/Bộ phận
								<input
									value={draft.recipientPosition}
									onChange={(event) =>
										update("recipientPosition", event.target.value)
									}
									placeholder="Ví dụ: Phòng vật tư"
								/>
							</label>
							<label>
								Số điện thoại
								<input
									value={draft.recipientPhone}
									onChange={(event) =>
										update("recipientPhone", event.target.value)
									}
									placeholder="Nhập số điện thoại"
								/>
							</label>
							<label htmlFor="customer-recipient-from">
								Hiệu lực từ
								<DateInput
									id="customer-recipient-from"
									ariaLabel="Ngày bắt đầu nhận chiết khấu"
									value={draft.recipientFrom}
									onChange={(value) => update("recipientFrom", value)}
								/>
							</label>
						</div>
					</section>

					<footer className="customer-form-actions">
						<button
							className="button secondary"
							type="button"
							onClick={onClose}
						>
							Hủy
						</button>
						<button className="button primary" type="submit">
							<Save size={16} /> {customer ? "Lưu thay đổi" : "Thêm khách hàng"}
						</button>
					</footer>
				</form>
			</aside>
		</div>
	);
}
