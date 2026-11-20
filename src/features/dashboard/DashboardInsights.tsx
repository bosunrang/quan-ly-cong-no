import { ArrowUpRight, ChartColumn, Wallet } from "lucide-react";
import { useState } from "react";
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
		</div>
	);
}

function ReceiptTrend({ trend }: { trend: DashboardView["receiptTrend"] }) {
	const { buckets, daysPerBucket } = trend;
	const [selected, setSelected] = useState<string>();
	const receiptBuckets = buckets.filter(({ count }) => count > 0);
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
							{money.format(active.count)} khoản thu
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
							{buckets.map(({ from, through, amount, count }) => {
								const label = `${dateRange(from, through)} · ${money.format(amount)} · ${money.format(count)} khoản thu`;
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
											style={{ height: `${(amount / max) * 100}%` }}
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
