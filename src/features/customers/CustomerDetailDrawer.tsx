import {
	BadgeDollarSign,
	Building2,
	CalendarDays,
	MapPinned,
	Pencil,
	Plus,
	Trash2,
	UserRound,
	X,
} from "lucide-react";
import { useState } from "react";
import {
	currentAssignment,
	currentRecipient,
} from "../../domain/customers/customer.selectors";
import {
	customerGroupLabels,
	customerStatusLabels,
	type Customer,
} from "../../domain/customers/customer.model";
import type { ProductCatalog } from "../../domain/products/product.model";
import {
	formatDateOnly,
	formatTimestamp,
	todayLocal,
} from "../../shared/lib/date";
import { StatusPill } from "../../shared/ui/StatusPill";
import { CustomerPolicyPanel } from "./components/CustomerPolicyPanel";

type DetailTab = "overview" | "assignments" | "recipients" | "policies";

interface CustomerDetailDrawerProps {
	customer: Customer;
	onClose: () => void;
	onEdit: () => void;
	onDelete: () => void;
	onAddRecipient: () => void;
	onEditRecipient: (recipientId: string) => void;
	productCatalog: ProductCatalog;
	onAddPolicy: () => void;
	onChangePolicy: (policyId: string) => void;
	onTogglePolicy: (policyId: string) => void;
	onDeletePolicy: (policyId: string) => void;
}

const date = (value: string | null) => formatDateOnly(value, "Hiện tại");

export function CustomerDetailDrawer({
	customer,
	onClose,
	onEdit,
	onDelete,
	onAddRecipient,
	onEditRecipient,
	productCatalog,
	onAddPolicy,
	onChangePolicy,
	onTogglePolicy,
	onDeletePolicy,
}: CustomerDetailDrawerProps) {
	const [tab, setTab] = useState<DetailTab>("overview");
	const assignment = currentAssignment(customer);
	const recipient = currentRecipient(customer);
	const activeRecipients = customer.recipients.filter((item) => item.active);
	const today = todayLocal();
	const currentPolicyCount = productCatalog.policies.filter(
		(item) =>
			item.customerId === customer.id &&
			item.status === "active" &&
			item.effectiveFrom <= today &&
			(!item.effectiveTo || item.effectiveTo >= today),
	).length;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Backdrop click closes the modal; the dialog itself remains the semantic interactive surface.
		<div
			className="customer-overlay"
			role="presentation"
			onMouseDown={(event) => event.target === event.currentTarget && onClose()}
		>
			<aside
				className="customer-drawer customer-policy-enabled-drawer"
				role="dialog"
				aria-modal="true"
				aria-labelledby="customer-detail-title"
			>
				<header className="customer-drawer-head">
					<div>
						<span>{customer.misaCode}</span>
						<h2 id="customer-detail-title">{customer.name}</h2>
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
				<div className="customer-detail-summary">
					<span className={`customer-group-badge ${customer.group}`}>
						{customerGroupLabels[customer.group]}
					</span>
					<StatusPill
						tone={customer.status === "active" ? "success" : "neutral"}
					>
						{customerStatusLabels[customer.status]}
					</StatusPill>
					<span>
						<MapPinned size={14} /> {customer.province}
					</span>
				</div>
				<nav className="customer-detail-tabs" aria-label="Hồ sơ khách hàng">
					<button
						type="button"
						className={tab === "overview" ? "is-active" : ""}
						onClick={() => setTab("overview")}
					>
						Tổng quan
					</button>
					<button
						type="button"
						className={tab === "assignments" ? "is-active" : ""}
						onClick={() => setTab("assignments")}
					>
						Phân công ({customer.assignments.length})
					</button>
					<button
						type="button"
						className={tab === "recipients" ? "is-active" : ""}
						onClick={() => setTab("recipients")}
					>
						Người nhận CK ({activeRecipients.length})
					</button>
					<button
						type="button"
						className={tab === "policies" ? "is-active" : ""}
						onClick={() => setTab("policies")}
					>
						Chính sách CK ({currentPolicyCount})
					</button>
				</nav>

				<div className="customer-detail-body">
					{tab === "overview" && (
						<>
							<section className="detail-card">
								<div className="detail-card-title">
									<Building2 size={17} />
									<strong>Thông tin chung</strong>
								</div>
								<dl className="detail-list">
									<div>
										<dt>Mã số thuế</dt>
										<dd>{customer.taxCode || "Chưa cập nhật"}</dd>
									</div>
									<div>
										<dt>Địa chỉ</dt>
										<dd>{customer.address || "Chưa cập nhật"}</dd>
									</div>
									<div>
										<dt>Ngày cập nhật</dt>
										<dd>{formatTimestamp(customer.updatedAt)}</dd>
									</div>
								</dl>
							</section>
							<section className="detail-card">
								<div className="detail-card-title">
									<UserRound size={17} />
									<strong>Nhân viên đang phụ trách</strong>
								</div>
								{assignment ? (
									<div className="current-owner">
										<div className="customer-avatar">
											{assignment.employeeName.split(" ").at(-1)?.slice(0, 1)}
										</div>
										<div>
											<strong>{assignment.employeeName}</strong>
											<span>
												Phân công theo đơn vị · Từ{" "}
												{date(assignment.effectiveFrom)}
											</span>
										</div>
									</div>
								) : (
									<p className="detail-empty">
										Chưa phân công nhân viên kinh doanh.
									</p>
								)}
							</section>
							<section className="detail-card">
								<div className="detail-card-title">
									<BadgeDollarSign size={17} />
									<strong>Người nhận chiết khấu mặc định</strong>
								</div>
								{recipient ? (
									<div className="current-owner">
										<div className="customer-avatar recipient">
											{recipient.fullName.split(" ").at(-1)?.slice(0, 1)}
										</div>
										<div>
											<strong>{recipient.fullName}</strong>
											<span>
												{recipient.position || "Chưa cập nhật chức vụ"} ·{" "}
												{recipient.phone || "Chưa có SĐT"}
												{activeRecipients.length > 1
													? ` · +${activeRecipients.length - 1} người khác`
													: ""}
											</span>
										</div>
									</div>
								) : (
									<p className="detail-empty warning">
										Chưa thiết lập người nhận chiết khấu.
									</p>
								)}
							</section>
						</>
					)}

					{tab === "assignments" && (
						<section className="detail-card timeline-card">
							<div className="detail-card-title">
								<CalendarDays size={17} />
								<strong>Lịch sử phân công</strong>
							</div>
							<div className="customer-timeline">
								{[...customer.assignments].reverse().map((item) => (
									<article key={item.id}>
										<i />
										<div>
											<strong>{item.employeeName}</strong>
											<span>Phân công theo đơn vị · {item.province}</span>
											<small>
												{date(item.effectiveFrom)} – {date(item.effectiveTo)}
											</small>
										</div>
									</article>
								))}
							</div>
							{customer.assignments.length === 0 && (
								<p className="detail-empty">Chưa có lịch sử phân công.</p>
							)}
						</section>
					)}

					{tab === "recipients" && (
						<section className="detail-card recipient-list-card">
							<div className="recipient-list-head">
								<div className="detail-card-title">
									<BadgeDollarSign size={17} />
									<div>
										<strong>Danh sách người nhận chiết khấu</strong>
										<span>{activeRecipients.length} người đang hoạt động</span>
									</div>
								</div>
								<button
									className="button primary recipient-add-button"
									type="button"
									onClick={onAddRecipient}
								>
									<Plus size={15} /> Thêm người nhận
								</button>
							</div>
							<div className="recipient-record-list">
								{[...customer.recipients]
									.sort((a, b) => Number(b.active) - Number(a.active))
									.map((item) => (
										<article
											key={item.id}
											className={!item.active ? "is-inactive" : ""}
										>
											<div className="customer-avatar recipient">
												{item.fullName.split(" ").at(-1)?.slice(0, 1)}
											</div>
											<div>
												<strong>
													{item.fullName}
													{item.isPrimary && item.active && <em>Mặc định</em>}
												</strong>
												<span>
													{item.position || "Chưa có chức vụ"} ·{" "}
													{item.phone || "Chưa có SĐT"}
												</span>
												<small>
													Hiệu lực: {date(item.effectiveFrom)} –{" "}
													{date(item.effectiveTo)}
												</small>
											</div>
											<button
												className="row-action"
												type="button"
												onClick={() => onEditRecipient(item.id)}
												aria-label={`Sửa người nhận ${item.fullName}`}
											>
												<Pencil size={15} />
											</button>
										</article>
									))}
							</div>
							{customer.recipients.length === 0 && (
								<p className="detail-empty warning">
									Chưa có người nhận chiết khấu. Bấm “Thêm người nhận” để tạo hồ
									sơ đầu tiên.
								</p>
							)}
						</section>
					)}

					{tab === "policies" && (
						<CustomerPolicyPanel
							customer={customer}
							catalog={productCatalog}
							onAddPolicy={onAddPolicy}
							onChangePolicy={onChangePolicy}
							onTogglePolicy={onTogglePolicy}
							onDeletePolicy={onDeletePolicy}
						/>
					)}
				</div>
				<footer className="customer-drawer-footer">
					{tab === "policies" ? (
						<button
							className="button primary"
							type="button"
							onClick={onAddPolicy}
						>
							<Plus size={16} /> Thêm chính sách mặt hàng
						</button>
					) : (
						<>
							<button
								className="button danger customer-delete-button"
								type="button"
								onClick={onDelete}
							>
								<Trash2 size={16} /> Xóa khách hàng
							</button>
							<button className="button primary" type="button" onClick={onEdit}>
								<Pencil size={16} /> Chỉnh sửa hồ sơ
							</button>
						</>
					)}
				</footer>
			</aside>
		</div>
	);
}
