import {
	BadgeDollarSign,
	PackageSearch,
	PauseCircle,
	Pencil,
	PlayCircle,
	Plus,
	Search,
	Trash2,
	UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Customer } from "../../../domain/customers/customer.model";
import type {
	CustomerProductPolicy,
	Product,
	ProductCatalog,
} from "../../../domain/products/product.model";
import {
	netPolicyValue,
	policyRetainedValue,
} from "../../../domain/products/product-policy.service";
import { formatDateOnly, todayLocal } from "../../../shared/lib/date";
import { StatusPill, type StatusTone } from "../../../shared/ui/StatusPill";

interface Props {
	customer: Customer;
	catalog: ProductCatalog;
	onAddPolicy: () => void;
	onChangePolicy: (policyId: string) => void;
	onTogglePolicy: (policyId: string) => void;
	onDeletePolicy: (policyId: string) => void;
}

const number = new Intl.NumberFormat("vi-VN");

function policyState(policy: CustomerProductPolicy): {
	label: string;
	tone: StatusTone;
	current: boolean;
} {
	const today = todayLocal();
	if (policy.status === "paused")
		return { label: "Tạm dừng", tone: "neutral", current: false };
	if (policy.effectiveFrom > today)
		return { label: "Sắp hiệu lực", tone: "info", current: false };
	if (policy.effectiveTo && policy.effectiveTo < today)
		return { label: "Đã hết hiệu lực", tone: "neutral", current: false };
	return { label: "Đang áp dụng", tone: "success", current: true };
}

function moneyPerUnit(value: number, product?: Product): string {
	return `${number.format(value)} ₫ / ${product?.unit || "ĐVT"}`;
}

export function CustomerPolicyPanel({
	customer,
	catalog,
	onAddPolicy,
	onChangePolicy,
	onTogglePolicy,
	onDeletePolicy,
}: Props) {
	const [query, setQuery] = useState("");
	const productMap = useMemo(
		() => new Map(catalog.products.map((item) => [item.id, item])),
		[catalog.products],
	);
	const customerPolicies = useMemo(
		() =>
			catalog.policies
				.filter((item) => item.customerId === customer.id)
				.sort((left, right) => {
					const currentDifference =
						Number(policyState(right).current) -
						Number(policyState(left).current);
					return (
						currentDifference ||
						right.effectiveFrom.localeCompare(left.effectiveFrom)
					);
				}),
		[catalog.policies, customer.id],
	);
	const currentCount = customerPolicies.filter(
		(policy) => policyState(policy).current,
	).length;
	const visiblePolicies = customerPolicies.filter((policy) => {
		const product = productMap.get(policy.productId);
		return `${product?.code ?? ""} ${product?.name ?? ""} ${product?.group ?? ""}`
			.toLocaleLowerCase("vi-VN")
			.includes(query.trim().toLocaleLowerCase("vi-VN"));
	});

	return (
		<section className="customer-policy-panel">
			<div className="customer-policy-overview">
				<div>
					<span>Mặt hàng đang áp dụng</span>
					<strong>{number.format(currentCount)}</strong>
				</div>
				<div>
					<span>Tổng phiên bản chính sách</span>
					<strong>{number.format(customerPolicies.length)}</strong>
				</div>
			</div>

			<div className="customer-policy-tools">
				<label>
					<Search size={15} />
					<input
						aria-label="Tìm chính sách theo mặt hàng"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Tìm mã hoặc tên mặt hàng..."
					/>
				</label>
				<button className="button primary" type="button" onClick={onAddPolicy}>
					<Plus size={15} /> Thêm chính sách
				</button>
			</div>

			<div className="customer-policy-records">
				{visiblePolicies.map((policy) => {
					const product = productMap.get(policy.productId);
					const state = policyState(policy);
					return (
						<article key={policy.id}>
							<div className="customer-policy-product-icon">
								<PackageSearch size={18} />
							</div>
							<div className="customer-policy-record-copy">
								<div>
									<strong>
										{product?.name ?? "Mặt hàng không còn trong danh mục"}
									</strong>
									<StatusPill tone={state.tone}>{state.label}</StatusPill>
								</div>
								<span>
									{product?.code ?? policy.productId} ·{" "}
									{product?.group || "Chưa phân nhóm"}
								</span>
								<div className="customer-policy-allocation-list">
									{policy.recipientAllocations.map((allocation) => {
										const recipient = customer.recipients.find(
											(item) => item.id === allocation.recipientId,
										);
										return (
											<small key={allocation.recipientId}>
												<UserRound size={13} />
												<span>
													{recipient?.fullName ??
														"Người nhận không còn trong hồ sơ"}
												</span>
											</small>
										);
									})}
									{policy.recipientAllocations.length === 0 && (
										<small className="is-missing">
											<UserRound size={13} /> Chưa gắn người nhận chiết khấu
										</small>
									)}
								</div>
								<small className="customer-policy-period">
									Hiệu lực {formatDateOnly(policy.effectiveFrom)} –{" "}
									{formatDateOnly(policy.effectiveTo, "không thời hạn")}
								</small>
								{policy.note && <em>{policy.note}</em>}
							</div>
							<div className="customer-policy-record-value">
								<span>Tổng chính sách</span>
								<strong>{moneyPerUnit(policy.value, product)}</strong>
								<small>
									Giữ lại {moneyPerUnit(policyRetainedValue(policy), product)}
								</small>
								<em>
									Thực nhận {moneyPerUnit(netPolicyValue(policy), product)}
								</em>
								<div>
									<button
										className="text-button"
										type="button"
										onClick={() => onChangePolicy(policy.id)}
									>
										<Pencil size={14} /> Thay đổi
									</button>
									<button
										className="text-button"
										type="button"
										onClick={() => onTogglePolicy(policy.id)}
									>
										{policy.status === "active" ? (
											<PauseCircle size={15} />
										) : (
											<PlayCircle size={15} />
										)}
										{policy.status === "active" ? "Tạm dừng" : "Bật lại"}
									</button>
									<button
										className="text-button danger-text-button"
										type="button"
										onClick={() => onDeletePolicy(policy.id)}
									>
										<Trash2 size={14} /> Xóa
									</button>
								</div>
							</div>
						</article>
					);
				})}
				{visiblePolicies.length === 0 && (
					<div className="customer-policy-empty">
						<BadgeDollarSign size={29} />
						<strong>
							{query
								? "Không tìm thấy chính sách phù hợp"
								: "Chưa có chính sách mặt hàng"}
						</strong>
						<span>
							Thiết lập trực tiếp tại đây để không phải tìm lại sản phẩm và đơn
							vị ở màn hình khác.
						</span>
						{!query && (
							<button
								className="button primary"
								type="button"
								onClick={onAddPolicy}
							>
								<Plus size={15} /> Thêm chính sách đầu tiên
							</button>
						)}
					</div>
				)}
			</div>
		</section>
	);
}
