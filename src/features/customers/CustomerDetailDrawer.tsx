import { Drawer } from "../../shared/ui/Dialog/Drawer";
import {
	Building2,
	CalendarDays,
	MapPinned,
	Pencil,
	Trash2,
	UserRound,
	X,
} from "lucide-react";
import { useState } from "react";
import { currentAssignment } from "../../domain/customers/customer.selectors";
import {
	customerStatusLabels,
	type Customer,
} from "../../domain/customers/customer.model";
import { formatDateOnly, formatTimestamp } from "../../shared/lib/date";
import { StatusPill } from "../../shared/ui/StatusPill";

type DetailTab = "overview" | "assignments";

interface CustomerDetailDrawerProps {
	customer: Customer;
	onClose: () => void;
	onEdit: () => void;
	onDelete: () => void;
}

const date = (value: string | null) => formatDateOnly(value, "Hiện tại");

export function CustomerDetailDrawer({
	customer,
	onClose,
	onEdit,
	onDelete,
}: CustomerDetailDrawerProps) {
	const [tab, setTab] = useState<DetailTab>("overview");
	const assignment = currentAssignment(customer);

	return (
		<Drawer ariaLabelledBy="customer-detail-title" onClose={onClose}>
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
					<X className="icon-size-19" />
				</button>
			</header>
			<div className="customer-detail-summary">
				<StatusPill tone={customer.status === "active" ? "success" : "neutral"}>
					{customerStatusLabels[customer.status]}
				</StatusPill>
				<span>
					<MapPinned className="icon-size-14" /> {customer.province}
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
			</nav>

			<div className="customer-detail-body">
				{tab === "overview" && (
					<>
						<section className="detail-card">
							<div className="detail-card-title">
								<Building2 className="icon-size-17" />
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
									<dt>Thời hạn công nợ</dt>
									<dd>
										{customer.paymentTermDays == null
											? "Chưa thiết lập"
											: `${customer.paymentTermDays} ngày`}
									</dd>
								</div>
								<div>
									<dt>Ngày cập nhật</dt>
									<dd>{formatTimestamp(customer.updatedAt)}</dd>
								</div>
							</dl>
							<p className="cell-meta">
								Hạn thanh toán của các hóa đơn tự tính theo thời hạn công nợ,
								từ ngày hóa đơn hoặc ngày chứng từ. Hóa đơn đã đặt hạn riêng
								giữ nguyên ngày đã chọn.
							</p>
						</section>
						<section className="detail-card">
							<div className="detail-card-title">
								<UserRound className="icon-size-17" />
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
									Chưa phân công nhân viên.
								</p>
							)}
						</section>
					</>
				)}
				{tab === "assignments" && (
					<section className="detail-card timeline-card">
						<div className="detail-card-title">
							<CalendarDays className="icon-size-17" />
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
			</div>
			<footer className="customer-drawer-footer">
				<button
					className="button danger-outline customer-delete-button"
					type="button"
					onClick={onDelete}
				>
					<Trash2 className="icon-size-16" /> Xóa khách hàng
				</button>
				<button className="button primary" type="button" onClick={onEdit}>
					<Pencil className="icon-size-16" /> Chỉnh sửa hồ sơ
				</button>
			</footer>
		</Drawer>
	);
}
