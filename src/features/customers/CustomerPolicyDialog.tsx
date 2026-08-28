import { BadgeDollarSign, PackageSearch, UserRound } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type { Customer } from "../../domain/customers/customer.model";
import { currentRecipient } from "../../domain/customers/customer.selectors";
import type {
	CustomerProductPolicy,
	PolicyRecipientAllocation,
	Product,
} from "../../domain/products/product.model";
import type { PolicyDraft } from "../../domain/products/product-policy.service";
import { todayLocal } from "../../shared/lib/date";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { Dialog } from "../../shared/ui/Dialog/Dialog";

interface Props {
	customer: Customer;
	products: Product[];
	policy?: CustomerProductPolicy;
	onClose: () => void;
	onSave: (draft: PolicyDraft) => void;
}

const number = new Intl.NumberFormat("vi-VN");

function initialAmounts(
	customer: Customer,
	policy?: CustomerProductPolicy,
): Record<string, number> {
	if (policy)
		return Object.fromEntries(
			policy.recipientAllocations.map((item) => [
				item.recipientId,
				item.amount,
			]),
		);
	const recipient = currentRecipient(customer);
	return recipient ? { [recipient.id]: 0 } : {};
}

function initialRetainedAmounts(
	policy?: CustomerProductPolicy,
): Record<string, number> {
	if (!policy) return {};
	return Object.fromEntries(
		policy.recipientAllocations.map((item, index) => [
			item.recipientId,
			item.retainedAmount ?? (index === 0 ? (policy.retainedAmount ?? 0) : 0),
		]),
	);
}

export function CustomerPolicyDialog({
	customer,
	products,
	policy,
	onClose,
	onSave,
}: Props) {
	const policyProduct = policy
		? products.find((item) => item.id === policy.productId)
		: undefined;
	const [selectedProductId, setSelectedProductId] = useState(
		policy?.productId ?? "",
	);
	const [productQuery, setProductQuery] = useState("");
	const [amounts, setAmounts] = useState<Record<string, number>>(() =>
		initialAmounts(customer, policy),
	);
	const [retainedAmounts, setRetainedAmounts] = useState<
		Record<string, number>
	>(() => initialRetainedAmounts(policy));
	const [effectiveFrom, setEffectiveFrom] = useState(todayLocal());
	const [effectiveTo, setEffectiveTo] = useState("");
	const [note, setNote] = useState(policy?.note ?? "");
	const [error, setError] = useState("");
	const selectedProduct = products.find(
		(item) => item.id === selectedProductId,
	);
	const activeRecipients = customer.recipients
		.filter((item) => item.active)
		.sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary));
	const visibleProducts = useMemo(() => {
		const query = productQuery.trim().toLocaleLowerCase("vi-VN");
		return products
			.filter(
				(product) =>
					(product.status === "active" || product.id === policy?.productId) &&
					`${product.code} ${product.name} ${product.group}`
						.toLocaleLowerCase("vi-VN")
						.includes(query),
			)
			.slice(0, 80);
	}, [policy?.productId, productQuery, products]);

	const toggleRecipient = (recipientId: string) =>
		setAmounts((current) => {
			const next = { ...current };
			if (recipientId in next) {
				delete next[recipientId];
				setRetainedAmounts((retained) => {
					const retainedNext = { ...retained };
					delete retainedNext[recipientId];
					return retainedNext;
				});
			} else {
				next[recipientId] = 0;
				setRetainedAmounts((retained) => ({
					...retained,
					[recipientId]: 0,
				}));
			}
			return next;
		});

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const allocations = Object.entries(amounts).map(
			([recipientId, amount]): PolicyRecipientAllocation => ({
				recipientId,
				amount,
				retainedAmount: retainedAmounts[recipientId] ?? 0,
			}),
		);
		try {
			onSave({
				productId: selectedProductId,
				customerIds: [customer.id],
				recipientAllocationsByCustomer: { [customer.id]: allocations },
				calculationType: "fixed",
				value: 0,
				effectiveFrom,
				effectiveTo: effectiveTo || null,
				note,
			});
			onClose();
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Không thể lưu chính sách.",
			);
		}
	};

	const total = Object.values(amounts).reduce(
		(sum, amount) => sum + (Number.isFinite(amount) ? amount : 0),
		0,
	);
	const retainedTotal = Object.keys(amounts).reduce(
		(sum, recipientId) => sum + (retainedAmounts[recipientId] ?? 0),
		0,
	);
	const netAmount = Math.max(0, total - retainedTotal);

	return (
		<Dialog
			className="customer-policy-dialog"
			ariaLabelledBy="customer-policy-dialog-title"
			eyebrow={`${customer.misaCode} · ${customer.name}`}
			title={
				policy ? "Tạo phiên bản chính sách mới" : "Thêm chính sách mặt hàng"
			}
			icon={<BadgeDollarSign size={19} />}
			onClose={onClose}
			onSubmit={submit}
			footer={
				<>
					<span className="customer-policy-dialog-total">
						{selectedProduct
							? `Thực nhận ${number.format(netAmount)} ₫ / ${selectedProduct.unit}`
							: "Chưa chọn mặt hàng"}
					</span>
					<button className="button secondary" type="button" onClick={onClose}>
						Hủy
					</button>
					<button className="button primary" type="submit">
						{policy ? "Lưu phiên bản mới" : "Thêm chính sách"}
					</button>
				</>
			}
		>
			<div className="dialog-body customer-policy-dialog-body">
				{error && <p className="form-alert">{error}</p>}
				<section className="customer-policy-product-step">
					<div className="customer-policy-step-title">
						<strong>1. Chọn mặt hàng</strong>
						{selectedProduct && (
							<span>
								{selectedProduct.code} · {selectedProduct.unit}
							</span>
						)}
					</div>
					{policy ? (
						<div className="customer-policy-selected-product">
							<PackageSearch size={18} />
							<div>
								<strong>
									{policyProduct?.name ?? "Mặt hàng không còn trong danh mục"}
								</strong>
								<span>{policyProduct?.code ?? policy.productId}</span>
							</div>
						</div>
					) : (
						<>
							<label className="customer-policy-product-search">
								<PackageSearch size={16} />
								<input
									aria-label="Tìm mặt hàng áp dụng chính sách"
									value={productQuery}
									onChange={(event) => setProductQuery(event.target.value)}
									placeholder="Tìm theo mã, tên hoặc nhóm mặt hàng..."
								/>
							</label>
							<div className="customer-policy-product-list">
								{visibleProducts.map((product) => (
									<label
										key={product.id}
										className={
											product.id === selectedProductId ? "is-selected" : ""
										}
									>
										<input
											type="radio"
											name="customer-policy-product"
											checked={product.id === selectedProductId}
											onChange={() => setSelectedProductId(product.id)}
										/>
										<span>
											<strong>{product.name}</strong>
											<small>
												{product.code} · {product.group || "Chưa phân nhóm"} ·{" "}
												{product.unit}
											</small>
										</span>
									</label>
								))}
								{visibleProducts.length === 0 && (
									<p>Không tìm thấy mặt hàng phù hợp.</p>
								)}
							</div>
						</>
					)}
				</section>

				<section className="customer-policy-recipient-step">
					<div className="customer-policy-step-title">
						<strong>2. Mức chiết khấu theo người nhận</strong>
						<span>{activeRecipients.length} người đang hoạt động</span>
					</div>
					<div className="customer-policy-recipient-list">
						{activeRecipients.map((recipient) => {
							const included = recipient.id in amounts;
							return (
								<div
									key={recipient.id}
									className={included ? "is-included" : ""}
								>
									<label>
										<input
											type="checkbox"
											checked={included}
											onChange={() => toggleRecipient(recipient.id)}
										/>
										<UserRound size={15} />
										<span>
											<strong>{recipient.fullName}</strong>
											<small>
												{recipient.position || "Chưa có chức vụ"}
												{recipient.isPrimary ? " · Mặc định" : ""}
											</small>
										</span>
									</label>
									<div className="customer-policy-person-amounts">
										<label>
											<span>Mức chính sách</span>
											<div className="customer-policy-amount-input">
												<input
													aria-label={`Mức chính sách của ${recipient.fullName}`}
													type="text"
													inputMode="numeric"
													disabled={!included}
													value={
														included ? number.format(amounts[recipient.id]) : ""
													}
													onChange={(event) =>
														setAmounts((current) => ({
															...current,
															[recipient.id]: Number(
																event.target.value.replace(/\D/g, ""),
															),
														}))
													}
												/>
												<em>₫ / {selectedProduct?.unit ?? "ĐVT"}</em>
											</div>
										</label>
										<label>
											<span>Giữ lại</span>
											<div className="customer-policy-amount-input">
												<input
													aria-label={`Chi phí giữ lại của ${recipient.fullName}`}
													type="text"
													inputMode="numeric"
													disabled={!included}
													value={
														included
															? number.format(
																	retainedAmounts[recipient.id] ?? 0,
																)
															: ""
													}
													onChange={(event) =>
														setRetainedAmounts((current) => ({
															...current,
															[recipient.id]: Number(
																event.target.value.replace(/\D/g, ""),
															),
														}))
													}
												/>
												<em>₫ / {selectedProduct?.unit ?? "ĐVT"}</em>
											</div>
										</label>
									</div>
								</div>
							);
						})}
						{activeRecipients.length === 0 && (
							<p className="customer-policy-no-recipient">
								Khách hàng chưa có người nhận chiết khấu. Hãy thêm người nhận
								trong tab bên cạnh trước khi tạo chính sách.
							</p>
						)}
					</div>
					<div className="customer-policy-money-summary">
						<div>
							<span>Tổng chính sách</span>
							<strong>{number.format(total)} ₫</strong>
						</div>
						<div>
							<span>Giữ lại</span>
							<strong>{number.format(retainedTotal)} ₫</strong>
						</div>
						<div className="is-net">
							<span>Thực nhận</span>
							<strong>{number.format(netAmount)} ₫</strong>
						</div>
					</div>
				</section>

				<section className="customer-policy-period-step">
					<strong>3. Thời gian hiệu lực</strong>
					<div className="dialog-grid">
						<label htmlFor="customer-policy-from">
							Hiệu lực từ
							<DateInput
								id="customer-policy-from"
								value={effectiveFrom}
								onChange={setEffectiveFrom}
								ariaLabel="Hiệu lực từ"
							/>
						</label>
						<label htmlFor="customer-policy-to">
							Kết thúc (không bắt buộc)
							<DateInput
								id="customer-policy-to"
								value={effectiveTo}
								onChange={setEffectiveTo}
								ariaLabel="Ngày kết thúc"
							/>
						</label>
					</div>
					<label>
						Ghi chú
						<input
							value={note}
							onChange={(event) => setNote(event.target.value)}
							placeholder="Ví dụ: chính sách theo hợp đồng 2026"
						/>
					</label>
				</section>
			</div>
		</Dialog>
	);
}
