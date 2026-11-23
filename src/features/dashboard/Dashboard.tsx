import {
	ArrowLeft,
	ArrowRight,
	CalendarClock,
	CircleDollarSign,
	ReceiptText,
	Search,
	Wallet,
} from "lucide-react";
import {
	type ComponentType,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { SalesEmployee } from "../../domain/employees/employee.model";
import type {
	DashboardView,
	InvoiceCustomer,
} from "../../domain/reports/view-types";
import {
	pageControls,
	resourceWithQuery,
	useServerData,
} from "../../shared/hooks/useServerData";
import {
	formatDateOnly,
	isIsoDate,
	previousDay,
	todayLocal,
} from "../../shared/lib/date";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { Notice } from "../../shared/ui/Notice";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";
import { DashboardCustomerSearch } from "./DashboardCustomerSearch";
import { DashboardInsights } from "./DashboardInsights";

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("vi-VN", {
	style: "percent",
	maximumFractionDigits: 1,
});
const searchDelay = 250;

const views = [
	{ id: "receivables", title: "Còn phải thu", icon: Wallet },
	{ id: "overdue", title: "Nợ quá hạn", icon: CalendarClock },
	{ id: "period", title: "Tiền thu trong kỳ", icon: ReceiptText },
	{ id: "unallocated", title: "Thu chưa phân bổ", icon: CircleDollarSign },
] as const;

type View = (typeof views)[number]["id"];
export function Dashboard({
	showEmployeeFilter = false,
	onOpenPayments,
	InvoiceDrawer,
}: {
	showEmployeeFilter?: boolean;
	onOpenPayments?: () => void;
	InvoiceDrawer: ComponentType<{
		customer: InvoiceCustomer;
		from: string;
		asOfDate: string;
		employee?: string;
		province?: string;
		onClose: () => void;
	}>;
}) {
	const [through, setThrough] = useState(todayLocal);
	const [periodStart, setPeriodStart] = useState<string>();
	const [selectedEmployee, setSelectedEmployee] = useState("");
	const [province, setProvince] = useState("");
	const employee =
		showEmployeeFilter && selectedEmployee ? selectedEmployee : undefined;
	const directory = useServerData<SalesEmployee[]>(
		showEmployeeFilter ? "employees" : undefined,
	);
	const employeeOptions = useMemo(
		() =>
			[...(directory.data ?? [])].sort(
				(a, b) =>
					Number(b.status === "active") - Number(a.status === "active") ||
					a.name.localeCompare(b.name, "vi"),
			),
		[directory.data],
	);
	const from = periodStart ?? (through ? `${through.slice(0, 7)}-01` : "");
	const today = todayLocal();
	const monthStart = `${today.slice(0, 7)}-01`;
	const lastMonthEnd = previousDay(monthStart);
	const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01`;
	const quickPeriod =
		through === today
			? from === monthStart
				? "this-month"
				: isIsoDate(from) && from <= today
					? "through-today"
					: ""
			: through === lastMonthEnd && from === lastMonthStart
				? "last-month"
				: "";
	const [detailsView, setDetailsView] = useState<View>();
	const detailsOpen = detailsView !== undefined;
	const view = detailsView ?? "receivables";
	const detailsRef = useRef<HTMLElement>(null);
	const overviewTrigger = useRef<HTMLButtonElement>(null);
	const [customerQuery, setCustomerQuery] = useState("");
	const [openedCustomer, setOpenedCustomer] = useState<InvoiceCustomer>();
	const [{ q, page }, setFilters] = useState({ q: "", page: 1 });
	const invalidDates =
		!isIsoDate(from) || !isIsoDate(through) || from > through;
	const isReceivables = view === "receivables";
	// Hai danh sách theo khách (còn phải thu, nợ quá hạn) dùng chung ô tìm khách hàng.
	const isCustomerView = isReceivables || view === "overdue";
	const customerSearch = customerQuery.trim();
	const searchPending = isCustomerView && !invalidDates && customerSearch !== q;
	const periodScope = {
		from,
		through,
		employee,
		province: province || undefined,
	};
	const viewScope = { ...periodScope, view };
	const resource = invalidDates
		? undefined
		: resourceWithQuery("dashboard", {
				...viewScope,
				q: isCustomerView ? q : undefined,
				page,
			});
	const response = useServerData<DashboardView>(resource);
	const provinceOptions =
		response.data?.provinceOptions ?? response.previous?.provinceOptions ?? [];
	const { error, refresh } = response;
	const sameView = response.previousResource?.startsWith(
		`${resourceWithQuery("dashboard", viewScope)}&`,
	);
	const samePeriod = response.previousResource?.startsWith(
		`${resourceWithQuery("dashboard", periodScope)}&`,
	);
	const summary = response.data ?? (samePeriod ? response.previous : undefined);
	const details = response.data ?? (sameView ? response.previous : undefined);
	const loading = searchPending || response.loading;
	const total = details?.rows.total ?? 0;
	const currentPage = details?.rows.page ?? page;
	const pagination = pageControls(
		currentPage,
		details?.rows.limit ?? 10,
		total,
	);
	const rows = details?.rows.items ?? [];
	const setPage = (page: number) =>
		setFilters((current) => ({ ...current, page }));
	function openDetails(next: View, trigger: HTMLButtonElement) {
		overviewTrigger.current = trigger;
		setDetailsView(next);
		setPage(1);
	}
	useEffect(() => {
		if (detailsOpen) {
			const details = detailsRef.current;
			const main = details?.closest("main");
			if (main?.scrollTop) main.scrollTo({ top: 0 });
			else if (window.scrollY) window.scrollTo({ top: 0 });
			details?.focus({ preventScroll: true });
		} else {
			overviewTrigger.current?.focus();
			overviewTrigger.current = null;
		}
	}, [detailsOpen]);

	useEffect(() => {
		if (!searchPending) return;
		const timer = window.setTimeout(() => {
			setFilters({ q: customerSearch, page: 1 });
		}, searchDelay);
		return () => window.clearTimeout(timer);
	}, [searchPending, customerSearch]);

	const amounts = {
		receivables: summary?.hasVerifiedDocuments ? summary.remaining : null,
		overdue: summary?.hasVerifiedDocuments ? summary.aging.overdueAmount : null,
		period: summary?.periodReceived,
		unallocated: summary?.unallocated,
	};
	const aging = summary?.aging;
	const counts = summary && {
		receivables: summary.hasVerifiedDocuments
			? `${number.format(summary.receivablesCount)} khách hàng còn nợ${
					summary.creditCount
						? ` · trừ ${number.format(summary.creditCount)} khách dư có ${number.format(summary.creditAmount)}`
						: ""
				}`
			: summary.salesRowCount
				? "Chưa có chứng từ đủ điều kiện"
				: "Chưa có dữ liệu MISA tại ngày chốt",
		overdue: !summary.hasVerifiedDocuments
			? "Chưa có chứng từ đủ điều kiện"
			: summary.aging.overdueCount
				? `${number.format(summary.aging.overdueCount)} khách hàng · ${percent.format(summary.remaining > 0 ? summary.aging.overdueAmount / summary.remaining : 0)} tổng còn phải thu`
				: "Chưa có khách hàng quá hạn",
		period: `${number.format(summary.periodCount - summary.periodReversalCount)} khoản thu trong kỳ${
			summary.periodReversalCount
				? ` · trừ ${number.format(summary.periodReversalCount)} khoản kỳ trước bị hủy`
				: ""
		}`,
		unallocated: `${number.format(summary.unallocatedCount)} khoản thu còn tiền chờ phân bổ`,
	};
	const headings = isReceivables
		? [
				"Khách hàng",
				"Nhân viên phụ trách",
				"Khu vực",
				"Chứng từ còn nợ",
				"Còn phải thu",
			]
		: view === "overdue"
			? [
					"Khách hàng",
					"Nhân viên phụ trách",
					"Khu vực",
					"Quá hạn tối đa",
					"Nợ quá hạn",
				]
			: [
					"Chứng từ thu",
					"Ngày thu",
					"Khách hàng",
					"Số tiền thu",
					"Chưa phân bổ",
				];
	const coverageNote =
		isReceivables && summary
			? [
					summary.unverifiedCount > 0 &&
						`${number.format(summary.unverifiedCount)} chứng từ chưa đủ điều kiện tính số còn phải thu.`,
					summary.unmatchedCount > 0 &&
						`${number.format(summary.unmatchedCount)} chứng từ có phân bổ chưa khớp sổ MISA.`,
				]
					.filter(Boolean)
					.join(" ")
			: "";
	const closeDetails = (
		<button
			className="button secondary"
			type="button"
			onClick={() => setDetailsView(undefined)}
		>
			<ArrowLeft className="icon-size-16" aria-hidden="true" />
			Về tổng quan
		</button>
	);

	return (
		<div
			className={`page-stack dashboard-page${detailsOpen ? " dashboard-expanded" : ""}`}
		>
			<section
				className={`panel dashboard-filters${showEmployeeFilter ? " dashboard-filters-with-employee" : ""}`}
				aria-label="Kỳ theo dõi Dashboard"
			>
				<div className="ui-field">
					<label htmlFor="dashboard-quick-period">Kỳ nhanh</label>
					<select
						id="dashboard-quick-period"
						value={quickPeriod}
						onChange={(event) => {
							const period = event.target.value;
							if (period === "last-month") {
								setPeriodStart(lastMonthStart);
								setThrough(lastMonthEnd);
							} else {
								if (period === "this-month" || !isIsoDate(from) || from > today)
									setPeriodStart(monthStart);
								else setPeriodStart(from);
								setThrough(today);
							}
							setPage(1);
						}}
					>
						<option value="" disabled>
							Tùy chỉnh
						</option>
						<option value="this-month">Tháng này</option>
						<option value="last-month">Tháng trước</option>
						<option value="through-today">Đến hôm nay</option>
					</select>
				</div>
				<div className="ui-field">
					<label htmlFor="dashboard-from">Từ ngày</label>
					<DateInput
						id="dashboard-from"
						ariaLabel="Từ ngày"
						value={from}
						onChange={(date) => {
							setPeriodStart(date);
							setPage(1);
						}}
					/>
				</div>
				<div className="ui-field">
					<label htmlFor="dashboard-through">Ngày chốt</label>
					<DateInput
						id="dashboard-through"
						ariaLabel="Ngày chốt"
						value={through}
						onChange={(date) => {
							setThrough(date);
							setPage(1);
						}}
					/>
				</div>
				{showEmployeeFilter && (
					<div className="ui-field">
						<label htmlFor="dashboard-employee">Nhân viên phụ trách</label>
						<select
							id="dashboard-employee"
							value={selectedEmployee}
							onChange={(event) => {
								setSelectedEmployee(event.target.value);
								setOpenedCustomer(undefined);
								setPage(1);
							}}
						>
							<option value="">Tất cả nhân viên</option>
							{employeeOptions.map(({ id, name, status }) => (
								<option key={id} value={id}>
									{name}
									{status === "inactive" ? " · Đã ngừng" : ""}
								</option>
							))}
						</select>
					</div>
				)}
				<div className="ui-field">
					<label htmlFor="dashboard-province">Khu vực</label>
					<select
						id="dashboard-province"
						value={province}
						onChange={(event) => {
							setProvince(event.target.value);
							setOpenedCustomer(undefined);
							setPage(1);
						}}
					>
						<option value="">Tất cả khu vực</option>
						{provinceOptions.map((name) => (
							<option key={name} value={name || "?"}>
								{name || "Chưa có khu vực"}
							</option>
						))}
					</select>
				</div>
				<DashboardCustomerSearch
					{...periodScope}
					disabled={invalidDates}
					onSelect={setOpenedCustomer}
				/>
			</section>

			{!invalidDates ? (
				<>
					<div className="dashboard-overview" hidden={detailsOpen}>
						<section
							className="dashboard-metrics"
							aria-label="Chỉ tiêu công nợ"
						>
							{views.map(({ id, title, icon: Icon }) => (
								<button
									className={`panel choice-card dashboard-metric${id === "receivables" ? " dashboard-metric-primary" : ""}`}
									type="button"
									key={id}
									aria-expanded={detailsOpen && view === id}
									aria-controls={detailsOpen ? "dashboard-details" : undefined}
									onClick={(event) => openDetails(id, event.currentTarget)}
								>
									<span className="dashboard-metric-icon">
										<Icon className="icon-size-18" aria-hidden="true" />
									</span>
									<span className="dashboard-metric-label">{title}</span>
									<strong>
										{amounts[id] == null ? "—" : number.format(amounts[id])}
									</strong>
									<small>{counts?.[id]}</small>
								</button>
							))}
						</section>

						{aging && aging.noDueDateCount > 0 && (
							<Notice tone="warning" announce>
								<strong>Thiếu hạn thanh toán.</strong>{" "}
								{number.format(aging.noDueDateCount)} khách hàng còn hóa đơn
								chưa có hạn, trị giá{" "}
								<strong>
									{number.format(aging.amounts["no-due-date"])} VND
								</strong>
								. Các khoản này chưa được tính vào nợ quá hạn.
							</Notice>
						)}

						{summary?.receiptTrend && summary.topDebtors && (
							<DashboardInsights
								summary={summary}
								onOpenCustomer={setOpenedCustomer}
							/>
						)}
					</div>

					{(detailsOpen || error) && (
						<section
							ref={detailsRef}
							className="panel data-panel dashboard-details"
							id="dashboard-details"
							tabIndex={detailsOpen ? -1 : undefined}
							aria-labelledby="dashboard-detail-title"
							aria-describedby={
								coverageNote ? "dashboard-detail-coverage" : undefined
							}
						>
							<div className="panel-header">
								<div className="dashboard-detail-heading">
									{detailsOpen && closeDetails}
									<div className="dashboard-detail-title-group">
										<h3 id="dashboard-detail-title">
											{isReceivables
												? "Công nợ theo khách hàng"
												: view === "overdue"
													? "Nợ quá hạn theo khách hàng"
													: view === "period"
														? "Khoản thu trong kỳ"
														: "Khoản thu còn tiền chờ phân bổ"}
										</h3>
										{!isReceivables && (
											<p>
												{view === "period"
													? `${formatDateOnly(from)} – ${formatDateOnly(through)}`
													: `Tại ngày ${formatDateOnly(through)}`}
												{view === "overdue" &&
													" · Đã trừ hàng bán trả lại và giảm giá"}
											</p>
										)}
										{coverageNote && (
											<p id="dashboard-detail-coverage">{coverageNote}</p>
										)}
									</div>
								</div>
								{isCustomerView ? (
									<label className="table-search dashboard-customer-search">
										<Search className="icon-size-16" aria-hidden="true" />
										<input
											type="search"
											aria-label="Tìm khách hàng hoặc mã MISA"
											placeholder="Tìm khách hàng hoặc mã MISA"
											value={customerQuery}
											onChange={(event) => setCustomerQuery(event.target.value)}
										/>
									</label>
								) : (
									onOpenPayments && (
										<button
											className="button secondary dashboard-open-payments"
											type="button"
											onClick={onOpenPayments}
										>
											Mở Đối soát khoản thu{" "}
											<ArrowRight className="icon-size-16" aria-hidden="true" />
										</button>
									)
								)}
							</div>
							{error && !searchPending ? (
								<div className="dashboard-load-error">
									<Notice
										tone="danger"
										title="Không thể tải Dashboard"
										announce
									>
										{error}
									</Notice>
									<button
										className="button secondary"
										type="button"
										onClick={refresh}
									>
										Thử lại
									</button>
								</div>
							) : rows.length > 0 ? (
								<>
									<div className="table-scroll dashboard-table">
										<table
											aria-labelledby="dashboard-detail-title"
											aria-busy={loading}
										>
											<thead>
												<tr>
													{headings.map((heading) => (
														<th key={heading} scope="col">
															{heading}
														</th>
													))}
												</tr>
											</thead>
											<tbody>
												{rows.map((row) =>
													"overdueAmount" in row ? (
														<tr key={row.id}>
															<td>
																<button
																	className="text-button dashboard-customer-link table-customer-name"
																	type="button"
																	aria-haspopup="dialog"
																	onClick={() => setOpenedCustomer(row)}
																>
																	{row.name}
																</button>
																{row.customerCode && (
																	<small className="cell-meta">
																		{row.customerCode}
																	</small>
																)}
															</td>
															<td>{row.employeeName || "—"}</td>
															<td>{row.province || "—"}</td>
															<td>
																{row.maxOverdueDays === null
																	? "—"
																	: `${number.format(row.maxOverdueDays)} ngày`}
															</td>
															<td className="strong-number dashboard-overdue-amount">
																{number.format(row.overdueAmount)}
																<small className="cell-meta">
																	Còn phải thu {number.format(row.remaining)}
																</small>
															</td>
														</tr>
													) : "remaining" in row ? (
														<tr key={row.id}>
															<td>
																<button
																	className="text-button dashboard-customer-link table-customer-name"
																	type="button"
																	aria-haspopup="dialog"
																	onClick={() => setOpenedCustomer(row)}
																>
																	{row.name}
																</button>
																{row.customerCode && (
																	<small className="cell-meta">
																		{row.customerCode}
																	</small>
																)}
															</td>
															<td>{row.employeeName || "—"}</td>
															<td>{row.province || "—"}</td>
															<td>{number.format(row.documentCount)}</td>
															<td className="strong-number">
																{number.format(row.remaining)}
															</td>
														</tr>
													) : (
														<tr key={row.id}>
															<td>
																<strong>{row.number}</strong>
																{row.reversedOn && (
																	<small className="cell-meta">
																		Hủy ngày {formatDateOnly(row.reversedOn)}
																	</small>
																)}
															</td>
															<td>{formatDateOnly(row.date)}</td>
															<td>
																<strong>{row.customerName}</strong>
																{row.customerCode && (
																	<small className="cell-meta">
																		{row.customerCode}
																	</small>
																)}
															</td>
															<td>{number.format(row.amount)}</td>
															<td className="strong-number">
																{row.reversedOn
																	? "—"
																	: number.format(row.unallocated)}
															</td>
														</tr>
													),
												)}
											</tbody>
										</table>
									</div>
									<div className="dashboard-table-footer">
										<span>
											{number.format(pagination.firstVisible)}–
											{number.format(pagination.lastVisible)} /{" "}
											{number.format(total)}{" "}
											{isCustomerView ? "khách hàng" : "khoản thu"}
										</span>
										<PaginationControls
											currentPage={currentPage}
											pageCount={pagination.pageCount}
											onPageChange={setPage}
											previousLabel="Trang Dashboard trước"
											nextLabel="Trang Dashboard sau"
											disabled={loading}
										/>
									</div>
								</>
							) : loading ? (
								<p className="empty-state" role="status">
									Đang tổng hợp công nợ…
								</p>
							) : (
								<div className="empty-state">
									{view === "overdue"
										? q && (summary?.aging.overdueCount ?? 0) > 0
											? "Không tìm thấy khách hàng phù hợp."
											: `Chưa có khách hàng nợ quá hạn tại ngày chốt.${
													summary?.aging.noDueDateCount
														? ` ${number.format(summary.aging.noDueDateCount)} khách hàng còn hóa đơn chưa có hạn thanh toán.`
														: ""
												}`
										: isReceivables
											? q && (summary?.receivablesCount ?? 0) > 0
												? "Không tìm thấy khách hàng phù hợp."
												: summary?.salesRowCount
													? "Chưa có khách hàng còn phải thu theo dữ liệu đủ điều kiện."
													: "Chưa có dòng bán hàng MISA tại ngày chốt."
											: view === "period"
												? "Chưa có khoản thu trong kỳ đã chọn."
												: "Chưa có khoản thu chờ phân bổ tại ngày chốt."}
								</div>
							)}
						</section>
					)}
				</>
			) : (
				<>
					{detailsOpen && <div>{closeDetails}</div>}
					<Notice tone="warning" announce>
						Chọn ngày chốt và ngày bắt đầu kỳ thu hợp lệ. Ngày bắt đầu phải bằng
						hoặc trước ngày chốt.
					</Notice>
				</>
			)}
			{openedCustomer && (
				<InvoiceDrawer
					key={openedCustomer.id}
					customer={openedCustomer}
					asOfDate={through}
					from={from}
					employee={employee}
					province={periodScope.province}
					onClose={() => setOpenedCustomer(undefined)}
				/>
			)}
		</div>
	);
}
