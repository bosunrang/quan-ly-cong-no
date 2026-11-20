import {
	ArrowLeft,
	ArrowRight,
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
import { formatDateOnly, isIsoDate, todayLocal } from "../../shared/lib/date";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { Notice } from "../../shared/ui/Notice";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";
import { DashboardCustomerSearch } from "./DashboardCustomerSearch";
import { DashboardInsights } from "./DashboardInsights";

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const searchDelay = 250;

const views = [
	{ id: "receivables", title: "Còn phải thu", icon: Wallet },
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
	const customerSearch = customerQuery.trim();
	const searchPending = isReceivables && !invalidDates && customerSearch !== q;
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
				q: isReceivables ? q : undefined,
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
		period: summary?.periodReceived,
		unallocated: summary?.unallocated,
	};
	const counts = summary && {
		receivables: summary.hasVerifiedDocuments
			? `${number.format(summary.receivablesCount)} khách hàng còn nợ`
			: summary.salesRowCount
				? "Chưa có chứng từ đủ điều kiện"
				: "Chưa có dữ liệu MISA tại ngày chốt",
		period: `${number.format(summary.periodCount)} khoản thu trong kỳ`,
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
		: ["Chứng từ thu", "Ngày thu", "Khách hàng", "Số tiền thu", "Chưa phân bổ"];
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
		<div className={`page-stack${detailsOpen ? " dashboard-expanded" : ""}`}>
			<section
				className="panel dashboard-filters"
				aria-label="Kỳ theo dõi Dashboard"
			>
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
					<label htmlFor="dashboard-through">Đến ngày (ngày chốt)</label>
					<DateInput
						id="dashboard-through"
						ariaLabel="Đến ngày (ngày chốt)"
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
										<Icon className="icon-size-22" aria-hidden="true" />
									</span>
									<span className="dashboard-metric-copy">
										<span>{title}</span>
										<strong>
											{amounts[id] == null ? "—" : number.format(amounts[id])}
										</strong>
										<small>{counts?.[id]}</small>
									</span>
								</button>
							))}
						</section>

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
								<div>
									<h3 id="dashboard-detail-title">
										{isReceivables
											? "Công nợ theo khách hàng"
											: view === "period"
												? "Khoản thu trong kỳ"
												: "Khoản thu còn tiền chờ phân bổ"}
									</h3>
									{!isReceivables && (
										<p>
											{view === "period"
												? `${formatDateOnly(from)} – ${formatDateOnly(through)}`
												: `Tại ngày ${formatDateOnly(through)}`}{" "}
											· VND
										</p>
									)}
									{coverageNote && (
										<p id="dashboard-detail-coverage">{coverageNote}</p>
									)}
								</div>
								{isReceivables ? (
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
								{detailsOpen && closeDetails}
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
													"remaining" in row ? (
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
																{number.format(row.unallocated)}
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
											{isReceivables ? "khách hàng" : "khoản thu"}
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
									{isReceivables
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
