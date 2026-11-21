import {
	ArrowUpRight,
	CalendarClock,
	ChartColumn,
	ChartNoAxesGantt,
	Wallet,
} from "lucide-react";
import { useState } from "react";
import {
	type AgingBucket,
	agingBuckets,
} from "../../domain/payments/receivable-aging";
import type {
	DashboardView,
	InvoiceCustomer,
} from "../../domain/reports/view-types";
import { formatDateOnly } from "../../shared/lib/date";

const money = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("vi-VN", {
	notation: "compact",
	maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat("vi-VN", {
	style: "percent",
	maximumFractionDigits: 1,
});

function dateRange(from: string, through: string) {
	return from === through
		? formatDateOnly(from)
		: `${formatDateOnly(from)} – ${formatDateOnly(through)}`;
}

export function DashboardInsights({
	summary,
	onOpenCustomer,
}: {
	summary: DashboardView;
	onOpenCustomer: (customer: InvoiceCustomer) => void;
}) {
	const { topDebtors, receiptTrend, remaining } = summary;
	const topShare =
		remaining > 0
			? topDebtors.reduce((total, row) => total + row.remaining, 0) / remaining
			: 0;
	return (
		<div className="dashboard-insights">
			<ReceiptTrend trend={receiptTrend} />
			<section
				className="panel dashboard-insight"
				aria-labelledby="dashboard-debtors-title"
			>
				<div className="dashboard-insight-head">
					<div>
						<h2 id="dashboard-debtors-title">Khách hàng còn nợ nhiều nhất</h2>
						{topDebtors.length > 0 && (
							<p>
								{topDebtors.length} khách hàng chiếm{" "}
								<strong>{percent.format(topShare)}</strong> tổng còn phải thu
							</p>
						)}
					</div>
					<Wallet
						className="dashboard-insight-icon icon-size-20"
						aria-hidden="true"
					/>
				</div>
				{topDebtors.length ? (
					<ol className="dashboard-debtors">
						{topDebtors.map((customer) => (
							<li key={customer.id}>
								<button
									type="button"
									className="dashboard-debtor"
									aria-haspopup="dialog"
									onClick={() => onOpenCustomer(customer)}
								>
									<span className="dashboard-debtor-name" title={customer.name}>
										{customer.name}
									</span>
									<strong>{money.format(customer.remaining)}</strong>
									<ArrowUpRight className="icon-size-14" aria-hidden="true" />
									<span className="dashboard-debtor-track" aria-hidden="true">
										<span
											style={{
												width: `${(customer.remaining / remaining) * 100}%`,
											}}
										/>
									</span>
								</button>
							</li>
						))}
					</ol>
				) : (
					<p className="dashboard-insight-empty">
						Chưa có khách hàng còn phải thu tại ngày chốt.
					</p>
				)}
			</section>
			<AgingOverview summary={summary} />
			<TopOverdue summary={summary} onOpenCustomer={onOpenCustomer} />
		</div>
	);
}

const agingLabels: Record<AgingBucket, string> = {
	current: "Chưa quá hạn",
	"1-30": "Quá hạn 1–30 ngày",
	"31-60": "Quá hạn 31–60 ngày",
	"61-90": "Quá hạn 61–90 ngày",
	"90+": "Quá hạn trên 90 ngày",
	"no-due-date": "Chưa có hạn",
};

// Hậu tố lớp CSS theo token màu (--chart-aging-*); tên nhóm có ký tự "+" không dùng được làm lớp.
const agingTone: Record<AgingBucket, string> = {
	current: "current",
	"1-30": "30",
	"31-60": "60",
	"61-90": "90",
	"90+": "over",
	"no-due-date": "none",
};

/** Tỷ trọng: phần rất nhỏ nhưng khác 0 ghi "<0,1%" thay vì "0%". */
function shareLabel(value: number) {
	return value > 0 && value < 0.001 ? "<0,1%" : percent.format(value);
}

/** Tuổi nợ tại ngày chốt: thanh tỷ trọng mảnh, số liệu đọc ở danh sách bên dưới. */
function AgingOverview({ summary }: { summary: DashboardView }) {
	const { aging, remaining } = summary;
	const gross = agingBuckets.reduce(
		(total, bucket) => total + aging.amounts[bucket],
		0,
	);
	const share = (amount: number) => (gross > 0 ? amount / gross : 0);
	const description = agingBuckets
		.filter((bucket) => aging.amounts[bucket] > 0)
		.map(
			(bucket) =>
				`${agingLabels[bucket]} ${money.format(aging.amounts[bucket])} (${shareLabel(share(aging.amounts[bucket]))})`,
		)
		.join("; ");
	return (
		<section
			className="panel dashboard-insight"
			aria-labelledby="dashboard-aging-title"
		>
			<div className="dashboard-insight-head">
				<div>
					<h2 id="dashboard-aging-title">Tuổi nợ</h2>
					<p>Tại ngày chốt {formatDateOnly(aging.asOf)} · VND</p>
				</div>
				<ChartNoAxesGantt
					className="dashboard-insight-icon icon-size-20"
					aria-hidden="true"
				/>
			</div>
			{gross > 0 ? (
				<>
					<div
						className="dashboard-aging-bar"
						role="img"
						aria-label={`Tuổi nợ theo nhóm: ${description}`}
					>
						{agingBuckets.map((bucket) =>
							aging.amounts[bucket] > 0 ? (
								<span
									key={bucket}
									className={`dashboard-aging-${agingTone[bucket]}`}
									title={`${agingLabels[bucket]}: ${money.format(aging.amounts[bucket])} · ${shareLabel(share(aging.amounts[bucket]))}`}
									style={{ flexGrow: aging.amounts[bucket] }}
								/>
							) : null,
						)}
					</div>
					<dl className="dashboard-aging-list">
						{agingBuckets.map((bucket) => (
							<div key={bucket}>
								<dt>
									<span
										className={`dashboard-aging-swatch dashboard-aging-${agingTone[bucket]}`}
										aria-hidden="true"
									/>
									{agingLabels[bucket]}
								</dt>
								<dd>
									{money.format(aging.amounts[bucket])}
									<span>{shareLabel(share(aging.amounts[bucket]))}</span>
								</dd>
							</div>
						))}
						{aging.reductionAmount > 0 && (
							<div>
								<dt>Giảm trừ chưa trừ vào hóa đơn</dt>
								<dd>−{money.format(aging.reductionAmount)}</dd>
							</div>
						)}
						<div className="dashboard-aging-total">
							<dt>Tổng còn phải thu</dt>
							<dd>{money.format(remaining)}</dd>
						</div>
					</dl>
					{aging.noDueDateCount > 0 && (
						<p className="dashboard-aging-note">
							{money.format(aging.noDueDateCount)} khách hàng còn hóa đơn chưa
							có hạn thanh toán. Đặt kỳ hạn trong Danh mục khách hàng để tính
							tuổi nợ.
						</p>
					)}
				</>
			) : (
				<p className="dashboard-insight-empty">
					Chưa có công nợ tại ngày chốt.
				</p>
			)}
		</section>
	);
}

function TopOverdue({
	summary,
	onOpenCustomer,
}: {
	summary: DashboardView;
	onOpenCustomer: (customer: InvoiceCustomer) => void;
}) {
	const { aging, topOverdue } = summary;
	return (
		<section
			className="panel dashboard-insight"
			aria-labelledby="dashboard-overdue-title"
		>
			<div className="dashboard-insight-head">
				<div>
					<h2 id="dashboard-overdue-title">Quá hạn nhiều nhất</h2>
					{aging.overdueCount > 0 && (
						<p>
							{money.format(aging.overdueCount)} khách hàng ·{" "}
							<strong>{money.format(aging.overdueAmount)}</strong> quá hạn
						</p>
					)}
				</div>
				<CalendarClock
					className="dashboard-insight-icon icon-size-20"
					aria-hidden="true"
				/>
			</div>
			{topOverdue.length ? (
				<ol className="dashboard-debtors dashboard-overdue-list">
					{topOverdue.map((customer) => (
						<li key={customer.id}>
							<button
								type="button"
								className="dashboard-debtor"
								aria-haspopup="dialog"
								onClick={() => onOpenCustomer(customer)}
							>
								<span className="dashboard-debtor-name" title={customer.name}>
									{customer.name}
									{customer.maxOverdueDays !== null && (
										<small>
											Quá hạn tối đa {money.format(customer.maxOverdueDays)}{" "}
											ngày
										</small>
									)}
								</span>
								<strong>{money.format(customer.overdueAmount)}</strong>
								<ArrowUpRight className="icon-size-14" aria-hidden="true" />
								<span className="dashboard-debtor-track" aria-hidden="true">
									<span
										style={{
											width: `${(customer.overdueAmount / aging.overdueAmount) * 100}%`,
										}}
									/>
								</span>
							</button>
						</li>
					))}
				</ol>
			) : (
				<p className="dashboard-insight-empty">
					Chưa có khách hàng quá hạn tại ngày chốt.
					{aging.noDueDateCount > 0 &&
						` ${money.format(aging.noDueDateCount)} khách hàng còn hóa đơn chưa có hạn thanh toán.`}
				</p>
			)}
		</section>
	);
}

const receiptCount = (count: number, reversals: number) =>
	`${money.format(count)} khoản thu${reversals ? ` · ${money.format(reversals)} khoản thu kỳ trước bị hủy` : ""}`;

function ReceiptTrend({ trend }: { trend: DashboardView["receiptTrend"] }) {
	const { buckets, daysPerBucket } = trend;
	const [selected, setSelected] = useState<string>();
	const receiptBuckets = buckets.filter(
		({ count, reversals }) => count > 0 || reversals > 0,
	);
	const active =
		buckets.find((bucket) => bucket.from === selected) ?? receiptBuckets.at(-1);
	const max = Math.max(0, ...buckets.map(({ amount }) => amount));
	return (
		<section
			className="panel dashboard-insight"
			aria-labelledby="dashboard-trend-title"
		>
			<div className="dashboard-insight-head">
				<div>
					<h2 id="dashboard-trend-title">Tiền về trong kỳ</h2>
					<p>
						{daysPerBucket === 1
							? "Theo ngày"
							: `Mỗi cột tối đa ${daysPerBucket} ngày`}{" "}
						· VND
					</p>
				</div>
				<ChartColumn
					className="dashboard-insight-icon icon-size-20"
					aria-hidden="true"
				/>
			</div>
			{max > 0 && active ? (
				<>
					<div className="dashboard-trend-readout" aria-live="polite">
						<strong>{money.format(active.amount)}</strong>
						<span>
							{dateRange(active.from, active.through)} ·{" "}
							{receiptCount(active.count, active.reversals)}
						</span>
					</div>
					<div
						className={`dashboard-trend${receiptBuckets.length >= 4 ? " dashboard-trend-tall" : ""}`}
					>
						<div className="dashboard-trend-axis" aria-hidden="true">
							<span>{compact.format(max)}</span>
							<span>{compact.format(max / 2)}</span>
							<span>0</span>
						</div>
						<fieldset className="dashboard-trend-bars">
							<legend className="visually-hidden">
								Khoản thu theo ngày hoặc nhóm ngày
							</legend>
							{buckets.map(({ from, through, amount, count, reversals }) => {
								const label = `${dateRange(from, through)} · ${money.format(amount)} · ${receiptCount(count, reversals)}`;
								return (
									<button
										key={from}
										type="button"
										title={label}
										aria-label={label}
										aria-pressed={active.from === from}
										onClick={() => setSelected(from)}
									>
										<span
											aria-hidden="true"
											style={{
												height: `${(Math.max(0, amount) / max) * 100}%`,
											}}
										/>
									</button>
								);
							})}
						</fieldset>
					</div>
					<div className="dashboard-trend-dates" aria-hidden="true">
						<span>{formatDateOnly(buckets[0].from)}</span>
						<span>{formatDateOnly(buckets.at(-1)?.through)}</span>
					</div>
				</>
			) : (
				<p className="dashboard-insight-empty">
					Chưa có khoản thu trong kỳ đã chọn.
				</p>
			)}
		</section>
	);
}
