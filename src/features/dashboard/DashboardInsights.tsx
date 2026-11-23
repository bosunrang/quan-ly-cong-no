import {
	ArrowUpRight,
	CalendarClock,
	ChartColumn,
	ChartNoAxesGantt,
	Wallet,
} from "lucide-react";
import { type CSSProperties, useState } from "react";
import {
	type AgingBucket,
	agingBuckets,
} from "../../domain/payments/receivable-aging";
import type {
	DashboardView,
	InvoiceCustomer,
} from "../../domain/reports/view-types";
import { formatDateOnly } from "../../shared/lib/date";
import {
	AgingSwatch,
	agingColor,
} from "../../shared/ui/AgingSwatch/AgingSwatch";

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
					<p>Tại ngày chốt {formatDateOnly(aging.asOf)}</p>
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
									title={`${agingLabels[bucket]}: ${money.format(aging.amounts[bucket])} · ${shareLabel(share(aging.amounts[bucket]))}`}
									style={{
										flexGrow: aging.amounts[bucket],
										background: agingColor(bucket),
									}}
								/>
							) : null,
						)}
					</div>
					<dl className="dashboard-aging-list">
						{agingBuckets.map((bucket) => (
							<div key={bucket}>
								<dt>
									<AgingSwatch bucket={bucket} />
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
				</p>
			)}
		</section>
	);
}

type ReceiptBucket = DashboardView["receiptTrend"]["buckets"][number];

function receiptActivity({ count, reversals, reversedAmount }: ReceiptBucket) {
	const receipts = `${money.format(count)} khoản thu`;
	return reversals
		? `${receipts} · Hủy ${money.format(reversals)} khoản kỳ trước (${money.format(reversedAmount)} VND)`
		: receipts;
}

function ReceiptTrend({ trend }: { trend: DashboardView["receiptTrend"] }) {
	const { buckets, daysPerBucket } = trend;
	const [selected, setSelected] = useState<string>();
	const receiptBuckets = buckets.filter(
		({ count, reversals }) => count > 0 || reversals > 0,
	);
	const active =
		buckets.find((bucket) => bucket.from === selected) ?? receiptBuckets.at(-1);
	const maxReceived = Math.max(
		0,
		...buckets.map(({ amount, reversedAmount }) => amount + reversedAmount),
	);
	const maxReversed = Math.max(
		0,
		...buckets.map(({ reversedAmount }) => reversedAmount),
	);
	// Chừa chỗ cho nhãn trục 0 khi hai phía chênh lệch lớn, vẫn dùng chung thang tiền.
	const upper = maxReceived > 0 ? Math.max(maxReceived, maxReversed / 3) : 0;
	const lower = maxReversed > 0 ? Math.max(maxReversed, maxReceived / 3) : 0;
	const range = upper + lower;
	const zero = range > 0 ? (upper / range) * 100 : 50;
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
							: `Mỗi cột tối đa ${daysPerBucket} ngày`}
					</p>
				</div>
				<ChartColumn
					className="dashboard-insight-icon icon-size-20"
					aria-hidden="true"
				/>
			</div>
			{active ? (
				<>
					<div className="dashboard-trend-readout" aria-live="polite">
						<strong>{money.format(active.amount)}</strong>
						<span>
							{active.reversals > 0 && "Thu ròng · "}
							{dateRange(active.from, active.through)} ·{" "}
							{receiptActivity(active)}
						</span>
					</div>
					<ul className="dashboard-trend-legend" aria-label="Chú giải biểu đồ">
						<li className="dashboard-trend-inflow">Thu trong kỳ</li>
						<li className="dashboard-trend-reversal">Hủy khoản thu kỳ trước</li>
					</ul>
					<div
						className={`dashboard-trend${receiptBuckets.length >= 4 ? " dashboard-trend-tall" : ""}`}
						style={{ "--trend-zero": `${zero}%` } as CSSProperties}
					>
						<div className="dashboard-trend-axis" aria-hidden="true">
							{upper > 0 && <span>{compact.format(upper)}</span>}
							<span className="dashboard-trend-axis-zero">0</span>
							{lower > 0 && (
								<span className="dashboard-trend-axis-min">
									{compact.format(-lower)}
								</span>
							)}
						</div>
						<fieldset className="dashboard-trend-bars">
							<legend className="visually-hidden">
								Khoản thu theo ngày hoặc nhóm ngày
							</legend>
							{buckets.map((bucket) => {
								const { from, through, amount, reversedAmount } = bucket;
								const received = amount + reversedAmount;
								const label = `${dateRange(from, through)} · Thu ròng ${money.format(amount)} VND · ${receiptActivity(bucket)}`;
								return (
									<button
										key={from}
										type="button"
										title={label}
										aria-label={label}
										aria-pressed={active.from === from}
										onClick={() => setSelected(from)}
									>
										{received > 0 && (
											<span
												className="dashboard-trend-inflow"
												aria-hidden="true"
												style={{ height: `${(received / range) * 100}%` }}
											/>
										)}
										{reversedAmount > 0 && (
											<span
												className="dashboard-trend-reversal"
												aria-hidden="true"
												style={{ height: `${(reversedAmount / range) * 100}%` }}
											/>
										)}
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
