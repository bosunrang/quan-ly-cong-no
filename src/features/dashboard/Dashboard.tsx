import {
	ArrowRight,
	BanknoteArrowDown,
	ChartNoAxesCombined,
	CheckCircle2,
	CircleDollarSign,
	Download,
	FileSpreadsheet,
	PackageCheck,
	ReceiptText,
	RefreshCcw,
	TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { readDashboardData } from "../../domain/dashboard/dashboard.service";
import type { PageId } from "../../types";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { formatDateOnly } from "../../shared/lib/date";

const money = new Intl.NumberFormat("vi-VN", {
	style: "currency",
	currency: "VND",
	maximumFractionDigits: 0,
});

interface DashboardProps {
	onNavigate: (page: PageId) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
	const [
		{
			activityItems,
			monthlySeries,
			reconcileRows,
			periodLabel,
			updatedThrough,
		},
	] = useState(readDashboardData);
	const { revenue, collected, expected, eligible, collectedRate } = useMemo(() => {
		const revenue = reconcileRows.reduce((sum, row) => sum + row.revenue, 0);
		const collected = reconcileRows.reduce(
			(sum, row) => sum + row.collected,
			0,
		);
		const expected = reconcileRows.reduce(
			(sum, row) => sum + row.expectedDiscount,
			0,
		);
		const eligible = reconcileRows
			.filter((row) => row.status === "eligible")
			.reduce((sum, row) => sum + row.expectedDiscount, 0);
		const collectedRate =
			revenue > 0 ? Math.round((collected / revenue) * 100) : 0;
		return { revenue, collected, expected, eligible, collectedRate };
	}, [reconcileRows]);

	return (
		<div className="dashboard-page page-stack">
			<section className="welcome-strip">
				<div>
					<span className="welcome-kicker">
						<CheckCircle2 size={15} /> Dữ liệu cập nhật đến{" "}
						{formatDateOnly(updatedThrough)}
					</span>
					<h2>Tình hình chiết khấu {periodLabel}</h2>
					<p>
						Có{" "}
						<strong>
							{reconcileRows.filter((row) => row.status === "eligible").length}{" "}
							khách hàng
						</strong>{" "}
						đã thu đủ và đang chờ duyệt chiết khấu.
					</p>
				</div>
				<div className="welcome-actions">
					<button className="button secondary" type="button">
						<Download size={16} /> Xuất báo cáo
					</button>
					<button
						className="button primary"
						type="button"
						onClick={() => onNavigate("reconcile")}
					>
						<RefreshCcw size={16} /> Đối soát ngay
					</button>
				</div>
			</section>

			<section className="kpi-grid" aria-label="Chỉ số tổng quan">
				<article className="kpi-card">
					<div className="kpi-icon tone-blue">
						<ChartNoAxesCombined size={21} />
					</div>
					<div className="kpi-label">Doanh số bán ra</div>
					<strong className="kpi-value">{money.format(revenue)}</strong>
					<div className="kpi-meta positive">
						<TrendingUp size={14} /> +12,6% so với quý trước
					</div>
				</article>
				<article className="kpi-card">
					<div className="kpi-icon tone-teal">
						<BanknoteArrowDown size={21} />
					</div>
					<div className="kpi-label">Đã thu từ khách hàng</div>
					<strong className="kpi-value">{money.format(collected)}</strong>
					<div className="kpi-meta">
						<span className="mini-progress">
							<i style={{ width: `${collectedRate}%` }} />
						</span>
						{collectedRate}% doanh số
					</div>
				</article>
				<article className="kpi-card">
					<div className="kpi-icon tone-amber">
						<CircleDollarSign size={21} />
					</div>
					<div className="kpi-label">Chiết khấu dự kiến</div>
					<strong className="kpi-value">{money.format(expected)}</strong>
					<div className="kpi-meta">Theo chính sách đang hiệu lực</div>
				</article>
				<article className="kpi-card kpi-emphasis">
					<div className="kpi-icon tone-success">
						<PackageCheck size={21} />
					</div>
					<div className="kpi-label">Đủ điều kiện chi</div>
					<strong className="kpi-value">{money.format(eligible)}</strong>
					<button
						className="kpi-link"
						type="button"
						onClick={() => onNavigate("reconcile")}
					>
						Xem danh sách <ArrowRight size={14} />
					</button>
				</article>
			</section>

			<section className="dashboard-main-grid">
				<article className="panel chart-panel">
					<div className="panel-header">
						<div>
							<h3>Doanh số và tiền thu</h3>
							<p>Đơn vị: triệu đồng</p>
						</div>
						<div className="chart-legend">
							<span>
								<i className="legend-dot revenue-dot" /> Doanh số
							</span>
							<span>
								<i className="legend-dot collected-dot" /> Đã thu
							</span>
						</div>
					</div>
					<div
						className="bar-chart"
						role="img"
						aria-label="Biểu đồ doanh số và tiền thu sáu tháng đầu năm"
					>
						<div className="chart-y-labels">
							<span>12</span>
							<span>8</span>
							<span>4</span>
							<span>0</span>
						</div>
						<div className="chart-bars">
							{monthlySeries.map((item) => (
								<div className="bar-group" key={item.label}>
									<div className="bar-pair">
										<i
											className="bar revenue-bar"
											style={{ height: `${(item.revenue / 12) * 100}%` }}
											title={`${item.revenue} triệu`}
										/>
										<i
											className="bar collected-bar"
											style={{ height: `${(item.collected / 12) * 100}%` }}
											title={`${item.collected} triệu`}
										/>
									</div>
									<span>{item.label}</span>
								</div>
							))}
						</div>
					</div>
				</article>

				<article className="panel status-panel">
					<div className="panel-header">
						<div>
							<h3>Trạng thái đối soát</h3>
							<p>{reconcileRows.length} khách hàng trong kỳ</p>
						</div>
					</div>
					<div className="donut-wrap">
						<div className="donut-chart">
							<div>
								<strong>{reconcileRows.length}</strong>
								<span>khách hàng</span>
							</div>
						</div>
						<div className="donut-legend">
							<div>
								<span>
									<i className="donut-key key-eligible" /> Đủ điều kiện
								</span>
								<strong>
									{
										reconcileRows.filter((row) => row.status === "eligible")
											.length
									}
								</strong>
							</div>
							<div>
								<span>
									<i className="donut-key key-pending" /> Chưa thu đủ
								</span>
								<strong>
									{
										reconcileRows.filter((row) => row.status === "pending")
											.length
									}
								</strong>
							</div>
							<div>
								<span>
									<i className="donut-key key-paid" /> Đã chi
								</span>
								<strong>
									{reconcileRows.filter((row) => row.status === "paid").length}
								</strong>
							</div>
						</div>
					</div>
					<button
						className="panel-action"
						type="button"
						onClick={() => onNavigate("reconcile")}
					>
						Mở màn hình đối soát <ArrowRight size={15} />
					</button>
				</article>
			</section>

			<section className="dashboard-bottom-grid">
				<article className="panel reconcile-preview">
					<div className="panel-header">
						<div>
							<h3>Cần xử lý trong kỳ</h3>
							<p>Ưu tiên các khách hàng đã thu đủ</p>
						</div>
						<button
							className="text-button"
							type="button"
							onClick={() => onNavigate("reconcile")}
						>
							Xem tất cả <ArrowRight size={14} />
						</button>
					</div>
					<div className="table-scroll">
						<table>
							<thead>
								<tr>
									<th>Khách hàng</th>
									<th>Doanh số</th>
									<th>Đã thu</th>
									<th>Chiết khấu</th>
									<th>Trạng thái</th>
								</tr>
							</thead>
							<tbody>
								{reconcileRows.slice(0, 3).map((row) => (
									<tr key={row.id}>
										<td>
											<strong>{row.customer}</strong>
											<span className="cell-meta">
												{row.customerCode} · {row.region}
											</span>
										</td>
										<td className="numeric">{money.format(row.revenue)}</td>
										<td className="numeric">{money.format(row.collected)}</td>
										<td className="numeric strong-number">
											{money.format(row.expectedDiscount)}
										</td>
										<td>
											<StatusBadge status={row.status} />
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</article>

				<article className="panel activity-panel">
					<div className="panel-header">
						<div>
							<h3>Hoạt động gần đây</h3>
							<p>Nhật ký cập nhật dữ liệu</p>
						</div>
					</div>
					<div className="activity-list">
						{activityItems.map((item) => (
							<div className="activity-item" key={item.title}>
								<span className={`activity-icon tone-${item.tone}`}>
									{item.tone === "warning" ? (
										<ReceiptText size={16} />
									) : item.tone === "neutral" ? (
										<FileSpreadsheet size={16} />
									) : (
										<CheckCircle2 size={16} />
									)}
								</span>
								<div>
									<strong>{item.title}</strong>
									<span>{item.detail}</span>
									<small>{item.time}</small>
								</div>
							</div>
						))}
					</div>
				</article>
			</section>
		</div>
	);
}
