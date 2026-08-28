import {
	BadgeDollarSign,
	Building2,
	CalendarClock,
	Eye,
	EyeOff,
	Pencil,
	Plus,
	Search,
	ToggleRight,
	Trash2,
	UserRound,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Customer } from "../../domain/customers/customer.model";
import type {
	Product,
	ProductCatalog,
} from "../../domain/products/product.model";
import {
	netAllocationValue,
	netPolicyValue,
	policyRetainedValue,
} from "../../domain/products/product-policy.service";
import {
	formatDateOnly,
	formatTimestamp,
	todayLocal,
} from "../../shared/lib/date";
import { StatusPill } from "../../shared/ui/StatusPill";

type Tab = "policies" | "history" | "product";
const number = new Intl.NumberFormat("vi-VN");

interface Props {
	product: Product;
	catalog: ProductCatalog;
	customers: Customer[];
	onClose: () => void;
	onAddPolicy: () => void;
	onEditProduct: () => void;
	onDeleteProduct: () => void;
	onTogglePolicy: (policyId: string) => void;
	onChangePolicy: (policyId: string) => void;
	onDeletePolicy: (policyId: string) => void;
}

function policyValue(value: number, product: Product): string {
	return `${number.format(value)} ₫ / ${product.unit}`;
}

export function ProductPolicyDrawer({
	product,
	catalog,
	customers,
	onClose,
	onAddPolicy,
	onEditProduct,
	onDeleteProduct,
	onTogglePolicy,
	onChangePolicy,
	onDeletePolicy,
}: Props) {
	const [tab, setTab] = useState<Tab>("policies");
	const [query, setQuery] = useState("");
	const [province, setProvince] = useState("all");
	const customerMap = useMemo(
		() => new Map(customers.map((item) => [item.id, item])),
		[customers],
	);
	const eligibleCustomers = customers;
	const productPolicies = catalog.policies.filter(
		(item) => item.productId === product.id,
	);
	const current = productPolicies.filter(
		(item) =>
			item.status === "active" &&
			item.effectiveFrom <= todayLocal() &&
			(!item.effectiveTo || item.effectiveTo >= todayLocal()),
	);
	const activeCustomerIds = new Set(current.map((item) => item.customerId));
	const provinces = [
		...new Set(eligibleCustomers.map((item) => item.province).filter(Boolean)),
	].sort((a, b) => a.localeCompare(b, "vi"));
	const visible = current.filter((policy) => {
		const customer = customerMap.get(policy.customerId);
		if (!customer) return false;
		const recipientNames = policy.recipientAllocations
			.map(
				(allocation) =>
					customer.recipients.find((item) => item.id === allocation.recipientId)
						?.fullName ?? "",
			)
			.join(" ");
		const text =
			`${customer.misaCode} ${customer.name} ${customer.province} ${recipientNames}`.toLocaleLowerCase(
				"vi-VN",
			);
		return (
			text.includes(query.toLocaleLowerCase("vi-VN")) &&
			(province === "all" || customer.province === province)
		);
	});

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Backdrop click closes the drawer; the aside remains the semantic dialog.
		<div
			className="customer-overlay"
			role="presentation"
			onMouseDown={(event) => event.target === event.currentTarget && onClose()}
		>
			<aside
				className="customer-drawer product-policy-drawer"
				role="dialog"
				aria-modal="true"
				aria-labelledby="product-policy-title"
			>
				<header className="customer-drawer-head">
					<div>
						<span>
							{product.code} · {product.group}
						</span>
						<h2 id="product-policy-title">{product.name}</h2>
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
				<div className="product-policy-summary">
					<div>
						<span>Nguồn đơn giá bán</span>
						<strong>Dữ liệu đơn hàng MISA</strong>
					</div>
					<div>
						<span>Đơn vị có chính sách</span>
						<strong>
							{activeCustomerIds.size}/
							{
								eligibleCustomers.filter((item) => item.status === "active")
									.length
							}
						</strong>
					</div>
					<StatusPill
						tone={product.status === "active" ? "success" : "neutral"}
					>
						{product.status === "active" ? "Đang hoạt động" : "Tạm ngưng"}
					</StatusPill>
				</div>
				<nav className="customer-detail-tabs" aria-label="Chính sách sản phẩm">
					<button
						type="button"
						className={tab === "policies" ? "is-active" : ""}
						onClick={() => setTab("policies")}
					>
						Đơn vị & chính sách ({current.length})
					</button>
					<button
						type="button"
						className={tab === "history" ? "is-active" : ""}
						onClick={() => setTab("history")}
					>
						Lịch sử ({productPolicies.length})
					</button>
					<button
						type="button"
						className={tab === "product" ? "is-active" : ""}
						onClick={() => setTab("product")}
					>
						Thông tin sản phẩm
					</button>
				</nav>
				<div className="customer-detail-body product-policy-body">
					{tab === "policies" && (
						<>
							<div className="product-policy-tools">
								<span className="policy-search">
									<Search size={15} />
									<input
										aria-label="Tìm đơn vị hoặc người nhận"
										value={query}
										onChange={(event) => setQuery(event.target.value)}
										placeholder="Tìm đơn vị hoặc người nhận..."
									/>
								</span>
								<select
									value={province}
									onChange={(event) => setProvince(event.target.value)}
								>
									<option value="all">Tất cả tỉnh/thành</option>
									{provinces.map((item) => (
										<option key={item}>{item}</option>
									))}
								</select>
								<button
									className="button primary"
									type="button"
									onClick={onAddPolicy}
								>
									<Plus size={16} /> Thiết lập
								</button>
							</div>
							<div className="drawer-policy-list">
								{visible.map((policy) => {
									const customer = customerMap.get(policy.customerId);
									if (!customer) return null;
									return (
										<article key={policy.id}>
											<div className="policy-customer-icon">
												<Building2 size={17} />
											</div>
											<div>
												<strong>{customer.name}</strong>
												<span>
													{customer.misaCode} · {customer.province}
												</span>
												<div className="policy-recipient-list">
													{policy.recipientAllocations.map((allocation) => {
														const recipient = customer.recipients.find(
															(item) => item.id === allocation.recipientId,
														);
														return (
															<small
																className="policy-recipient"
																key={allocation.recipientId}
															>
																<UserRound size={13} />
																<span>
																	{recipient?.fullName ??
																		"Người nhận không còn trong hồ sơ"}
																</span>
															</small>
														);
													})}
													{policy.recipientAllocations.length === 0 && (
														<small className="policy-recipient missing">
															<UserRound size={13} /> Chưa gắn người nhận chiết
															khấu
														</small>
													)}
												</div>
												<small>
													Hiệu lực {formatDateOnly(policy.effectiveFrom)} –{" "}
													{formatDateOnly(policy.effectiveTo, "không thời hạn")}
												</small>
											</div>
											<div className="policy-record-value">
												<span>Tổng chính sách</span>
												<strong>{policyValue(policy.value, product)}</strong>
												<small>
													Giữ lại{" "}
													{policyValue(policyRetainedValue(policy), product)}
												</small>
												<em>
													Thực nhận{" "}
													{policyValue(netPolicyValue(policy), product)}
												</em>
												<div className="policy-record-actions">
													<button
														className="text-button"
														type="button"
														onClick={() => onChangePolicy(policy.id)}
													>
														<Pencil size={15} /> Thay đổi
													</button>
													<button
														className="text-button"
														type="button"
														onClick={() => onTogglePolicy(policy.id)}
													>
														<ToggleRight size={17} /> Tạm dừng
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
								{visible.length === 0 && (
									<div className="drawer-empty">
										<BadgeDollarSign size={28} />
										<strong>Chưa có chính sách phù hợp</strong>
										<span>
											Thiết lập riêng cho một hoặc nhiều đơn vị đang hoạt động.
										</span>
										<button
											className="button primary"
											type="button"
											onClick={onAddPolicy}
										>
											<Plus size={16} /> Thiết lập chính sách
										</button>
									</div>
								)}
							</div>
						</>
					)}
					{tab === "history" && (
						<section className="detail-card timeline-card">
							<div className="detail-card-title">
								<CalendarClock size={17} />
								<strong>Lịch sử chính sách</strong>
							</div>
							<div className="policy-history">
								{[...productPolicies]
									.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
									.map((policy) => {
										const customer = customerMap.get(policy.customerId);
										const recipients = policy.recipientAllocations
											.map(
												(allocation) =>
													`${customer?.recipients.find((item) => item.id === allocation.recipientId)?.fullName ?? "Không xác định"}: CS ${number.format(allocation.amount)} · giữ ${number.format(allocation.retainedAmount ?? 0)} · nhận ${number.format(netAllocationValue(allocation))} ₫`,
											)
											.join(" · ");
										return (
											<article key={policy.id}>
												<span
													className={`policy-history-marker ${policy.status === "active" ? "is-active" : "is-paused"}`}
													aria-hidden="true"
												/>
												<div className="policy-history-copy">
													<strong>
														{customer?.name ??
															"Đơn vị không còn trong danh mục"}
													</strong>
													<span>
														CK {policyValue(policy.value, product)} · Giữ lại{" "}
														{policyValue(policyRetainedValue(policy), product)}{" "}
														· Thực nhận{" "}
														{policyValue(netPolicyValue(policy), product)} ·{" "}
														{policy.status === "active"
															? "Đang áp dụng"
															: "Tạm dừng"}
													</span>
													<small>
														Người nhận CK: {recipients || "Chưa gắn người nhận"}
													</small>
													<small>
														{formatDateOnly(policy.effectiveFrom)} –{" "}
														{formatDateOnly(
															policy.effectiveTo,
															"không thời hạn",
														)}{" "}
														· Cập nhật {formatTimestamp(policy.updatedAt)}
													</small>
													{policy.note && <em>{policy.note}</em>}
												</div>
												<div className="policy-history-actions">
													<button
														className={`policy-history-toggle ${policy.status === "active" ? "is-active" : "is-paused"}`}
														type="button"
														onClick={() => onTogglePolicy(policy.id)}
														title={
															policy.status === "active"
																? "Đang bật – bấm để tạm dừng"
																: "Đang tắt – bấm để bật lại"
														}
														aria-label={
															policy.status === "active"
																? "Tạm dừng chính sách"
																: "Bật lại chính sách"
														}
													>
														{policy.status === "active" ? (
															<Eye size={19} />
														) : (
															<EyeOff size={19} />
														)}
													</button>
													<button
														className="policy-history-delete"
														type="button"
														onClick={() => onDeletePolicy(policy.id)}
														title="Xóa chính sách"
														aria-label="Xóa chính sách"
													>
														<Trash2 size={16} />
													</button>
												</div>
											</article>
										);
									})}
							</div>
							{productPolicies.length === 0 && (
								<p className="detail-empty">Chưa có lịch sử chính sách.</p>
							)}
						</section>
					)}
					{tab === "product" && (
						<section className="detail-card">
							<div className="detail-card-title">
								<Building2 size={17} />
								<strong>Thông tin danh mục</strong>
							</div>
							<dl className="detail-list">
								<div>
									<dt>Mã sản phẩm</dt>
									<dd>{product.code}</dd>
								</div>
								<div>
									<dt>Nhóm</dt>
									<dd>{product.group || "Chưa phân nhóm"}</dd>
								</div>
								<div>
									<dt>Đơn vị tính</dt>
									<dd>{product.unit || "Chưa cập nhật"}</dd>
								</div>
								<div>
									<dt>Cập nhật gần nhất</dt>
									<dd>{formatTimestamp(product.updatedAt)}</dd>
								</div>
							</dl>
						</section>
					)}
				</div>
				<footer className="customer-drawer-footer">
					{tab === "product" ? (
						<>
							<button
								className="button danger customer-delete-button"
								type="button"
								onClick={onDeleteProduct}
							>
								<Trash2 size={16} /> Xóa sản phẩm
							</button>
							<button
								className="button primary"
								type="button"
								onClick={onEditProduct}
							>
								<Pencil size={16} /> Chỉnh sửa sản phẩm
							</button>
						</>
					) : (
						<button
							className="button primary"
							type="button"
							onClick={onAddPolicy}
						>
							<Plus size={16} /> Thiết lập chính sách
						</button>
					)}
				</footer>
			</aside>
		</div>
	);
}
