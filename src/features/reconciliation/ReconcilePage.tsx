import {
	AlertCircle,
	CalendarDays,
	CheckCircle2,
	RefreshCcw,
	Search,
	SlidersHorizontal,
	WalletCards,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { readCustomers } from "../../domain/customers/customer.repository";
import { readMisaDataset } from "../../domain/misa/misa.repository";
import { queryMisaRange } from "../../domain/misa/misa.repository";
import { readProductCatalog } from "../../domain/products/product.repository";
import { calculateReconciliation } from "../../domain/reconciliation/reconciliation.engine";
import type {
	CalculatedReconciliation,
	CalculatedReconciliationRow,
	ReconciliationIssue,
} from "../../domain/reconciliation/reconciliation.model";
import { formatDateOnly, todayLocal } from "../../shared/lib/date";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { StatusPill } from "../../shared/ui/StatusPill";

type PeriodMode = "quarter" | "custom";
type ResultStatus = CalculatedReconciliationRow["status"];
type StatusFilter = ResultStatus | "all";

const money = new Intl.NumberFormat("vi-VN", {
	style: "currency",
	currency: "VND",
	maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("vi-VN");
const PAGE_SIZE = 50;

const issueLabels: Record<ReconciliationIssue, string> = {
	unmatched_customer: "Chưa khớp khách hàng",
	unmatched_product: "Chưa khớp sản phẩm",
	missing_quantity: "Thiếu số lượng",
	missing_recipient: "Thiếu người nhận",
	missing_opening_balance: "Thiếu số dư đầu kỳ để phân bổ FIFO",
};

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

function quarterRange(year: number, quarter: number) {
	const startMonth = (quarter - 1) * 3 + 1;
	const endMonth = startMonth + 2;
	const endDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
	return {
		dateFrom: `${year}-${pad(startMonth)}-01`,
		dateTo: `${year}-${pad(endMonth)}-${pad(endDay)}`,
		label: `Quý ${["I", "II", "III", "IV"][quarter - 1]}/${year}`,
	};
}

function currentQuarter() {
	const today = new Date();
	return {
		year: today.getFullYear(),
		quarter: Math.floor(today.getMonth() / 3) + 1,
	};
}

function ReconciliationDetail({
	row,
	dateFrom,
	dateTo,
	onClose,
}: {
	row: CalculatedReconciliationRow;
	dateFrom: string;
	dateTo: string;
	onClose: () => void;
}) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Backdrop click closes the detail drawer; the aside remains the semantic dialog.
		<div
			className="reconcile-overlay"
			role="presentation"
			onMouseDown={onClose}
		>
			<aside
				className="reconcile-drawer"
				role="dialog"
				aria-modal="true"
				aria-labelledby="reconcile-detail-title"
				onMouseDown={(event) => event.stopPropagation()}
			>
				<header>
					<div>
						<span>
							{row.customerCode || "Chưa có mã MISA"} ·{" "}
							{formatDateOnly(dateFrom)} – {formatDateOnly(dateTo)}
						</span>
						<h2 id="reconcile-detail-title">{row.customer}</h2>
					</div>
					<button type="button" onClick={onClose} aria-label="Đóng chi tiết">
						<X size={19} />
					</button>
				</header>
				<div className="reconcile-drawer-summary">
					<div>
						<span>Doanh số ròng</span>
						<strong>{money.format(row.revenue)}</strong>
					</div>
					<div>
						<span>Đã phân bổ cho kỳ</span>
						<strong>{money.format(row.collected)}</strong>
					</div>
					<div>
						<span>Thu công nợ cũ</span>
						<strong>{money.format(row.priorDebtSettled)}</strong>
					</div>
					<div>
						<span>Thu dư</span>
						<strong>{money.format(row.unallocatedCollected)}</strong>
					</div>
					<StatusBadge status={row.status} />
				</div>
				<p className="reconcile-collection-note">
					Tổng phiếu thu trong kỳ: {money.format(row.rawCollected)}. Hệ thống
					phân bổ FIFO cho công nợ cũ trước
					{row.adjustmentSettled > 0 &&
						`, sau đó phân bổ ${money.format(row.adjustmentSettled)} cho điều chỉnh công nợ`}
					.
				</p>
				{(row.issues.length > 0 || row.warnings.length > 0) && (
					<div className="reconcile-detail-alerts">
						{row.issues.map((issue) => (
							<StatusPill key={issue} tone="danger">
								{issueLabels[issue]}
							</StatusPill>
						))}
						{row.warnings.map((warning) => (
							<StatusPill key={warning} tone="neutral">
								{warning}
							</StatusPill>
						))}
					</div>
				)}
				<section className="reconcile-product-summary">
					<header>
						<strong>Tổng hợp số lượng ròng</strong>
						<span>Nhóm theo sản phẩm và đơn giá MISA</span>
					</header>
					<div className="table-scroll">
						<table>
							<thead>
								<tr>
									<th>Sản phẩm</th>
									<th className="numeric">Đơn giá</th>
									<th className="numeric">Đã bán</th>
									<th className="numeric">Trả lại</th>
									<th className="numeric">SL ròng</th>
									<th className="numeric">Doanh số ròng</th>
								</tr>
							</thead>
							<tbody>
								{row.productSummaries.map((summary) => (
									<tr key={summary.id}>
										<td>
											<strong>{summary.productName}</strong>
											<span className="cell-meta">
												{summary.productCode || "Chưa xác định mã"} ·{" "}
												{summary.unit || "Chưa có ĐVT"}
											</span>
										</td>
										<td className="numeric">
											{summary.unitPrice === null
												? "—"
												: money.format(summary.unitPrice)}
										</td>
										<td className="numeric">
											{number.format(summary.soldQuantity)}
										</td>
										<td className="numeric negative-number">
											{summary.returnedQuantity
												? number.format(-summary.returnedQuantity)
												: "0"}
										</td>
										<td className="numeric strong-number">
											{number.format(summary.netQuantity)}
										</td>
										<td className="numeric strong-number">
											{money.format(summary.netRevenue)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
				<div className="reconcile-line-table table-scroll">
					<table>
						<thead>
							<tr>
								<th>Ngày / chứng từ</th>
								<th>Sản phẩm</th>
								<th className="numeric">SL phát sinh</th>
								<th className="numeric">Doanh số</th>
								<th className="numeric">Chiết khấu</th>
								<th>Kết quả</th>
							</tr>
						</thead>
						<tbody>
							{row.productLines.map((line) => (
								<tr key={line.id}>
									<td>
										{formatDateOnly(line.date)}
										<span className="cell-meta">
											{line.documentNumber || "Không có số chứng từ"}
										</span>
									</td>
									<td>
										<strong>{line.productName}</strong>
										<span className="cell-meta">
											{line.productCode || "Chưa xác định mã"}
											{line.recipients.length > 0 &&
												` · ${line.recipients.map((item) => `${item.recipientName} thực nhận: ${money.format(item.totalAmount)}`).join(" · ")}`}
										</span>
									</td>
									<td className="numeric">
										{line.quantity === null
											? "—"
											: number.format(line.quantity)}
									</td>
									<td className="numeric">{money.format(line.revenue)}</td>
									<td className="numeric strong-number">
										{money.format(line.discount)}
										{line.hasPolicy && line.retainedCost > 0 && (
											<span className="cell-meta">
												Tổng {money.format(line.grossDiscount)} · Giữ lại{" "}
												{money.format(line.retainedCost)}
											</span>
										)}
									</td>
									<td>
										{line.isReturn ? (
											<>
												<StatusPill tone="warning">
													Trả hàng · đã trừ
												</StatusPill>
												{line.issue && (
													<span className="cell-meta">
														{issueLabels[line.issue]}
													</span>
												)}
											</>
										) : line.issue ? (
											<StatusPill tone="danger">
												{issueLabels[line.issue]}
											</StatusPill>
										) : line.hasPolicy ? (
											<StatusPill tone="success">Đã tính</StatusPill>
										) : (
											<StatusPill tone="neutral">
												Không có chính sách
											</StatusPill>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{row.productLines.length === 0 && (
						<div className="empty-state">Không có dòng bán trong kỳ.</div>
					)}
				</div>
			</aside>
		</div>
	);
}

export function ReconcilePage() {
	const [{ year: initialYear, quarter: initialQuarter }] =
		useState(currentQuarter);
	const [dataset] = useState(readMisaDataset);
	const [customers] = useState(readCustomers);
	const [catalog] = useState(readProductCatalog);
	const [mode, setMode] = useState<PeriodMode>("quarter");
	const [year, setYear] = useState(initialYear);
	const [quarter, setQuarter] = useState(initialQuarter);
	const [customFrom, setCustomFrom] = useState(
		dataset?.periodFrom ?? `${initialYear}-01-01`,
	);
	const [customTo, setCustomTo] = useState(dataset?.periodTo ?? todayLocal());
	const [appliedRange, setAppliedRange] = useState(() =>
		quarterRange(initialYear, initialQuarter),
	);
	const [result, setResult] = useState<CalculatedReconciliation | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [province, setProvince] = useState("all");
	const [status, setStatus] = useState<StatusFilter>("all");
	const [currentPage, setCurrentPage] = useState(1);
	const [selectedRow, setSelectedRow] =
		useState<CalculatedReconciliationRow | null>(null);

	useEffect(() => {
		if (!dataset?.detailsAvailable) {
			setResult(null);
			return;
		}
		let active = true;
		setIsLoading(true);
		setError("");
		queryMisaRange({
			dateFrom: dataset.periodFrom ?? appliedRange.dateFrom,
			dateTo: appliedRange.dateTo,
		})
			.then((details) => {
				if (!active) return;
				setCurrentPage(1);
				setResult(
					calculateReconciliation(
						appliedRange.dateFrom,
						appliedRange.dateTo,
						details,
						dataset,
						customers,
						catalog,
					),
				);
			})
			.catch((reason) => {
				if (!active) return;
				setResult(null);
				setError(
					reason instanceof Error ? reason.message : "Không thể chạy đối soát.",
				);
			})
			.finally(() => {
				if (active) setIsLoading(false);
			});
		return () => {
			active = false;
		};
	}, [appliedRange, catalog, customers, dataset]);

	const provinces = useMemo(
		() =>
			[
				...new Set(
					(result?.rows ?? []).map((row) => row.region).filter(Boolean),
				),
			].sort((left, right) => left.localeCompare(right, "vi-VN")),
		[result?.rows],
	);
	const filteredRows = useMemo(() => {
		const search = query.trim().toLocaleLowerCase("vi-VN");
		return (result?.rows ?? []).filter(
			(row) =>
				(status === "all" || row.status === status) &&
				(province === "all" || row.region === province) &&
				(!search ||
					`${row.customer} ${row.customerCode} ${row.region} ${row.salesperson}`
						.toLocaleLowerCase("vi-VN")
						.includes(search)),
		);
	}, [province, query, result?.rows, status]);
	const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
	const safePage = Math.min(currentPage, pageCount);
	const rows = useMemo(
		() => filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
		[filteredRows, safePage],
	);
	const firstVisible = filteredRows.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
	const lastVisible = Math.min(safePage * PAGE_SIZE, filteredRows.length);

	function runReconciliation() {
		const next =
			mode === "quarter"
				? quarterRange(year, quarter)
				: {
						dateFrom: customFrom,
						dateTo: customTo,
						label: `${formatDateOnly(customFrom)} – ${formatDateOnly(customTo)}`,
					};
		if (!next.dateFrom || !next.dateTo || next.dateTo < next.dateFrom) {
			setError("Khoảng ngày đối soát không hợp lệ.");
			return;
		}
		setSelectedRow(null);
		setCurrentPage(1);
		setAppliedRange(next);
	}

	return (
		<div className="page-stack reconcile-page">
			<section className="panel reconcile-period-panel">
				<div className="reconcile-period-title">
					<CalendarDays size={19} />
					<div>
						<strong>Thời gian đối soát</strong>
						<span>
							Doanh số và tiền thu được lọc độc lập theo ngày chứng từ.
						</span>
					</div>
				</div>
				<fieldset className="segmented-control reconcile-mode">
					<legend className="visually-hidden">Cách chọn thời gian</legend>
					<button
						type="button"
						className={mode === "quarter" ? "is-active" : ""}
						onClick={() => setMode("quarter")}
					>
						Theo quý
					</button>
					<button
						type="button"
						className={mode === "custom" ? "is-active" : ""}
						onClick={() => setMode("custom")}
					>
						Khoảng ngày
					</button>
				</fieldset>
				{mode === "quarter" ? (
					<div className="reconcile-quarter-fields">
						<select
							aria-label="Năm đối soát"
							value={year}
							onChange={(event) => setYear(Number(event.target.value))}
						>
							{Array.from(
								{ length: 7 },
								(_, index) => initialYear - 5 + index,
							).map((item) => (
								<option key={item} value={item}>
									Năm {item}
								</option>
							))}
						</select>
						<select
							aria-label="Quý đối soát"
							value={quarter}
							onChange={(event) => setQuarter(Number(event.target.value))}
						>
							<option value={1}>Quý I</option>
							<option value={2}>Quý II</option>
							<option value={3}>Quý III</option>
							<option value={4}>Quý IV</option>
						</select>
					</div>
				) : (
					<div className="reconcile-custom-fields">
						<DateInput
							value={customFrom}
							onChange={setCustomFrom}
							ariaLabel="Từ ngày đối soát"
						/>
						<span>đến</span>
						<DateInput
							value={customTo}
							onChange={setCustomTo}
							ariaLabel="Đến ngày đối soát"
						/>
					</div>
				)}
				<button
					className="button primary"
					type="button"
					onClick={runReconciliation}
					disabled={isLoading}
				>
					<RefreshCcw size={16} />{" "}
					{isLoading ? "Đang đối soát..." : "Chạy đối soát"}
				</button>
			</section>

			{error && (
				<div className="misa-error" role="alert">
					<AlertCircle size={17} /> {error}
				</div>
			)}

			<section className="summary-banner reconcile-summary-banner">
				<div className="summary-banner-icon">
					<WalletCards size={24} />
				</div>
				<div>
					<span>{appliedRange.label}</span>
					<h2>Đối soát doanh số – thu tiền – chiết khấu</h2>
					<p>Đã thu bằng hoặc lớn hơn doanh số thì đủ điều kiện chi.</p>
				</div>
				<div className="summary-banner-metric">
					<span>Đủ điều kiện chi</span>
					<strong>{money.format(result?.totals.eligibleDiscount ?? 0)}</strong>
				</div>
				<button
					className="button primary"
					type="button"
					disabled
					title="Sẽ mở sau khi hoàn thiện chống lập đề nghị trùng"
				>
					<CheckCircle2 size={16} /> Lập đề nghị chi
				</button>
			</section>

			<section className="reconcile-overview" aria-label="Tổng quan đối soát">
				<article>
					<span>Doanh số bán ròng</span>
					<strong>{money.format(result?.totals.revenue ?? 0)}</strong>
				</article>
				<article>
					<span>Đã phân bổ cho kỳ</span>
					<strong>{money.format(result?.totals.collected ?? 0)}</strong>
				</article>
				<article>
					<span>Đơn vị đủ điều kiện</span>
					<strong>
						{number.format(result?.totals.eligibleCustomers ?? 0)}
					</strong>
				</article>
				<article>
					<span>Cần kiểm tra</span>
					<strong>{number.format(result?.totals.reviewCustomers ?? 0)}</strong>
				</article>
			</section>

			<section className="panel data-panel">
				<div className="data-toolbar reconcile-toolbar">
					<label className="table-search">
						<span className="visually-hidden">Tìm dữ liệu đối soát</span>
						<Search size={16} />
						<input
							value={query}
							onChange={(event) => {
								setQuery(event.target.value);
								setCurrentPage(1);
							}}
							placeholder="Tìm khách hàng, mã MISA, khu vực..."
						/>
					</label>
					<select
						value={province}
						onChange={(event) => {
							setProvince(event.target.value);
							setCurrentPage(1);
						}}
					>
						<option value="all">Tất cả tỉnh/thành</option>
						{provinces.map((item) => (
							<option key={item}>{item}</option>
						))}
					</select>
					<fieldset className="segmented-control">
						<legend className="visually-hidden">Lọc trạng thái</legend>
						{[
							["all", "Tất cả"],
							["eligible", "Đủ điều kiện"],
							["pending", "Chưa thu đủ"],
							["review", "Cần kiểm tra"],
						].map(([value, label]) => (
							<button
								type="button"
								key={value}
								className={status === value ? "is-active" : ""}
								onClick={() => {
									setStatus(value as StatusFilter);
									setCurrentPage(1);
								}}
							>
								{label}
							</button>
						))}
					</fieldset>
					<span className="reconcile-result-count">
						<strong>{number.format(filteredRows.length)}</strong> đơn vị
					</span>
				</div>
				<div className="table-scroll large-table reconcile-table">
					<table>
						<thead>
							<tr>
								<th>Khách hàng</th>
								<th>Khu vực / NVKD</th>
								<th className="numeric">Doanh số</th>
								<th className="numeric">Đã phân bổ</th>
								<th className="numeric">Còn thiếu</th>
								<th>Tỷ lệ thu</th>
								<th className="numeric">CK dự kiến</th>
								<th>Trạng thái</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => {
								const visibleRate = Math.min(100, row.collectionRate);
								return (
									<tr key={row.id}>
										<td>
											<strong>{row.customer}</strong>
											<span className="cell-meta">
												{row.customerCode || "Chưa khớp mã MISA"}
											</span>
										</td>
										<td>
											{row.region}
											<span className="cell-meta">{row.salesperson}</span>
										</td>
										<td className="numeric">{money.format(row.revenue)}</td>
										<td className="numeric">{money.format(row.collected)}</td>
										<td className="numeric">
											{money.format(row.remainingReceivable)}
										</td>
										<td>
											<div className="rate-cell">
												<div>
													<i style={{ width: `${visibleRate}%` }} />
												</div>
												<strong>{Math.round(row.collectionRate)}%</strong>
											</div>
										</td>
										<td className="numeric strong-number">
											{money.format(row.expectedDiscount)}
										</td>
										<td>
											<StatusBadge status={row.status} />
										</td>
										<td>
											<button
												className="row-action"
												type="button"
												onClick={() => setSelectedRow(row)}
												aria-label={`Mở chi tiết ${row.customer}`}
											>
												<SlidersHorizontal size={16} />
											</button>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					{isLoading && (
						<div className="misa-table-state">Đang chạy đối soát...</div>
					)}
					{!isLoading && filteredRows.length === 0 && (
						<div className="empty-state">
							{dataset
								? "Không có dữ liệu phù hợp trong khoảng ngày đã chọn."
								: "Chưa có dữ liệu MISA. Hãy nhập file MISA trước khi đối soát."}
						</div>
					)}
				</div>
				{filteredRows.length > 0 && (
					<footer className="reconcile-table-footer">
						<span>
							Hiển thị{" "}
							<strong>
								{number.format(firstVisible)}–{number.format(lastVisible)}
							</strong>{" "}
							/ {number.format(filteredRows.length)} đơn vị
						</span>
						<PaginationControls
							currentPage={safePage}
							pageCount={pageCount}
							onPageChange={setCurrentPage}
							previousLabel="Trang đối soát trước"
							nextLabel="Trang đối soát sau"
							showPageWord
						/>
					</footer>
				)}
			</section>

			{selectedRow && (
				<ReconciliationDetail
					row={selectedRow}
					dateFrom={appliedRange.dateFrom}
					dateTo={appliedRange.dateTo}
					onClose={() => setSelectedRow(null)}
				/>
			)}
		</div>
	);
}
