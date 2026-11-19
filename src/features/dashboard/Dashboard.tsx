import {
	ArrowRight,
	CircleDollarSign,
	Database,
	ReceiptText,
	Search,
	Wallet,
} from "lucide-react";
import {
	type ComponentType,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { normalizeVietnamese } from "../../domain/customers/customer.province";
import { readCustomers } from "../../domain/customers/customer.repository";
import { readSalesEmployees } from "../../domain/employees/employee.repository";
import { readMisaSalesBook } from "../../domain/misa/misa.sales-book.repository";
import {
	readReceiptLedger,
	subscribeReceiptLedger,
} from "../../domain/payments/receipt-ledger.repository";
import { usePagination } from "../../shared/hooks/usePagination";
import { formatDateOnly, todayLocal } from "../../shared/lib/date";
import { sameJson } from "../../shared/lib/sameJson";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { Notice } from "../../shared/ui/Notice";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";
import { buildDashboardSummary } from "./dashboard.summary";

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

const views = [
	{ id: "receivables", title: "Còn phải thu", icon: Wallet },
	{ id: "period", title: "Tiền thu trong kỳ", icon: ReceiptText },
	{ id: "unallocated", title: "Thu chưa phân bổ", icon: CircleDollarSign },
] as const;

type View = (typeof views)[number]["id"];
type Summary = ReturnType<typeof buildDashboardSummary>;
type CustomerRow = Summary["receivables"][number];
type Row = CustomerRow | Summary["periodReceipts"][number];
type DashboardData = {
	book: Awaited<ReturnType<typeof readMisaSalesBook>>;
	ledger: Awaited<ReturnType<typeof readReceiptLedger>>;
	customers: Awaited<ReturnType<typeof readCustomers>>;
	employees: Awaited<ReturnType<typeof readSalesEmployees>>;
};

const emptyRows: Row[] = [];

export function Dashboard({
	onOpenMisa,
	onOpenPayments,
	InvoiceDrawer,
}: {
	onOpenMisa?: () => void;
	onOpenPayments?: () => void;
	InvoiceDrawer: ComponentType<{
		customer: CustomerRow;
		asOfDate: string;
		onClose: () => void;
	}>;
}) {
	const [data, setData] = useState<DashboardData>();
	const [error, setError] = useState("");
	const request = useRef(0);
	const [through, setThrough] = useState(todayLocal);
	const [periodStart, setPeriodStart] = useState<string>();
	const from = periodStart ?? (through ? `${through.slice(0, 7)}-01` : "");
	const [view, setView] = useState<View>("receivables");
	const [customerQuery, setCustomerQuery] = useState("");
	const [openedCustomerId, setOpenedCustomerId] = useState<string>();

	const refresh = useCallback(() => {
		const current = ++request.current;
		void Promise.all([
			readMisaSalesBook(),
			readReceiptLedger(),
			readCustomers(),
			readSalesEmployees(),
		])
			.then(([book, ledger, customers, employees]) => {
				if (current !== request.current) return;
				// Sổ chưa đổi thì giữ nguyên dữ liệu cũ để không tính lại khi chọn lại cửa sổ.
				setData((previous) =>
					previous?.book === book &&
					previous.ledger === ledger &&
					sameJson(previous.customers, customers) &&
					sameJson(previous.employees, employees)
						? previous
						: { book, ledger, customers, employees },
				);
				setError("");
			})
			.catch((reason: unknown) => {
				if (current !== request.current) return;
				setError(
					reason instanceof Error
						? reason.message
						: "Không thể đọc dữ liệu Dashboard.",
				);
			});
	}, []);

	useEffect(() => {
		const unsubscribe = subscribeReceiptLedger(refresh);
		window.addEventListener("focus", refresh);
		refresh();
		return () => {
			request.current += 1;
			unsubscribe();
			window.removeEventListener("focus", refresh);
		};
	}, [refresh]);

	const invalidDates = !from || !through || from > through;
	const summary = useMemo(
		() =>
			data && !invalidDates
				? buildDashboardSummary(
						data.book,
						data.ledger,
						data.customers,
						data.employees,
						from,
						through,
					)
				: undefined,
		[data, from, through, invalidDates],
	);
	const isReceivables = view === "receivables";
	const customerSearch = normalizeVietnamese(customerQuery);
	const receivableRows = useMemo(() => {
		const customers = summary?.receivables;
		if (!customerSearch) return customers;
		return customers?.filter(({ name, customerCode }) =>
			normalizeVietnamese(`${name} ${customerCode}`).includes(customerSearch),
		);
	}, [summary?.receivables, customerSearch]);
	const rows =
		(isReceivables
			? receivableRows
			: view === "period"
				? summary?.periodReceipts
				: summary?.unallocatedReceipts) ?? emptyRows;
	const pagination = usePagination<Row>(rows, 10);
	const openedCustomer = openedCustomerId
		? summary?.receivables.find(({ id }) => id === openedCustomerId)
		: undefined;

	useEffect(() => {
		if (openedCustomerId && !openedCustomer) setOpenedCustomerId(undefined);
	}, [openedCustomerId, openedCustomer]);

	if (error) {
		return (
			<div className="page-stack">
				<Notice tone="danger" title="Không thể tải Dashboard" announce>
					{error}
				</Notice>
				<div>
					<button className="button secondary" type="button" onClick={refresh}>
						Thử lại
					</button>
				</div>
			</div>
		);
	}

	if (!data)
		return (
			<p className="panel empty-state" role="status">
				Đang tổng hợp công nợ…
			</p>
		);

	const amounts = {
		receivables: summary?.hasVerifiedDocuments ? summary.remaining : null,
		period: summary?.periodReceived,
		unallocated: summary?.unallocated,
	};
	const counts = {
		receivables: summary?.hasVerifiedDocuments
			? `${number.format(summary.receivables.length)} khách hàng còn nợ`
			: summary?.salesRowCount
				? "Chưa có chứng từ đủ điều kiện"
				: "Chưa có dữ liệu MISA tại ngày chốt",
		period: `${number.format(summary?.periodReceipts.length ?? 0)} khoản thu trong kỳ`,
		unallocated: `${number.format(summary?.unallocatedReceipts.length ?? 0)} khoản thu còn tiền chờ phân bổ`,
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

	return (
		<div className="page-stack dashboard-page">
			<section
				className="panel dashboard-toolbar"
				aria-label="Kỳ theo dõi Dashboard"
			>
				<div className="dashboard-dates">
					<div className="ui-field">
						<label htmlFor="dashboard-through">Ngày chốt</label>
						<DateInput
							id="dashboard-through"
							ariaLabel="Ngày chốt"
							value={through}
							onChange={(date) => {
								setThrough(date);
								pagination.resetPage();
							}}
						/>
					</div>
					<div className="ui-field">
						<label htmlFor="dashboard-from">Thu trong kỳ từ ngày</label>
						<DateInput
							id="dashboard-from"
							ariaLabel="Thu trong kỳ từ ngày"
							value={from}
							onChange={(date) => {
								setPeriodStart(date);
								pagination.resetPage();
							}}
						/>
					</div>
				</div>
				{onOpenMisa && (
					<button
						className="button secondary"
						type="button"
						onClick={onOpenMisa}
					>
						<Database className="icon-size-16" aria-hidden="true" /> Dữ liệu
						MISA
					</button>
				)}
			</section>

			{summary ? (
				<>
					<section className="dashboard-metrics" aria-label="Chỉ tiêu công nợ">
						{views.map(({ id, title, icon: Icon }) => (
							<button
								className={`panel choice-card dashboard-metric${view === id ? " is-selected" : ""}`}
								type="button"
								key={id}
								aria-pressed={view === id}
								aria-controls="dashboard-details"
								onClick={() => {
									setView(id);
									pagination.resetPage();
								}}
							>
								<span className="dashboard-metric-icon">
									<Icon className="icon-size-22" aria-hidden="true" />
								</span>
								<span className="dashboard-metric-copy">
									<span>{title}</span>
									<strong>
										{amounts[id] == null ? "—" : number.format(amounts[id])}
									</strong>
									<small>{counts[id]}</small>
								</span>
							</button>
						))}
					</section>

					<Notice tone="info">
						Chưa có dữ liệu hạn thanh toán và số dư đầu kỳ. Chỉ tiêu đến hạn và
						quá hạn chưa thể tính.
						{summary.unverifiedCount > 0 &&
							` Có ${number.format(summary.unverifiedCount)} chứng từ chưa đủ điều kiện tính số còn phải thu.`}
						{summary.unmatchedCount > 0 &&
							` Có ${number.format(summary.unmatchedCount)} chứng từ có phân bổ chưa khớp sổ MISA.`}
					</Notice>

					<section
						className="panel data-panel"
						id="dashboard-details"
						aria-labelledby="dashboard-detail-title"
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
								<p>
									{view === "period"
										? `${formatDateOnly(from)} – ${formatDateOnly(through)}`
										: `Tại ngày ${formatDateOnly(through)}`}{" "}
									· VND
								</p>
							</div>
							{isReceivables ? (
								<label className="table-search dashboard-customer-search">
									<Search className="icon-size-16" aria-hidden="true" />
									<input
										type="search"
										aria-label="Tìm khách hàng hoặc mã MISA"
										placeholder="Tìm khách hàng hoặc mã MISA"
										value={customerQuery}
										onChange={(event) => {
											setCustomerQuery(event.target.value);
											pagination.resetPage();
										}}
									/>
								</label>
							) : (
								onOpenPayments && (
									<button
										className="button secondary"
										type="button"
										onClick={onOpenPayments}
									>
										Mở Đối soát khoản thu{" "}
										<ArrowRight className="icon-size-16" aria-hidden="true" />
									</button>
								)
							)}
						</div>
						{rows.length > 0 ? (
							<>
								<div className="table-scroll table-scroll-auto-gutter dashboard-table">
									<table aria-labelledby="dashboard-detail-title">
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
											{pagination.pageItems.map((row) =>
												"remaining" in row ? (
													<tr key={row.id}>
														<td>
															<button
																className="text-button dashboard-customer-link table-customer-name"
																type="button"
																aria-haspopup="dialog"
																onClick={() => setOpenedCustomerId(row.id)}
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
														<td>{number.format(row.documents.length)}</td>
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
										{number.format(rows.length)}{" "}
										{isReceivables ? "khách hàng" : "khoản thu"}
									</span>
									<PaginationControls
										currentPage={pagination.currentPage}
										pageCount={pagination.pageCount}
										onPageChange={pagination.setCurrentPage}
										previousLabel="Trang Dashboard trước"
										nextLabel="Trang Dashboard sau"
									/>
								</div>
							</>
						) : (
							<div className="empty-state">
								{isReceivables
									? customerSearch && summary.receivables.length > 0
										? "Không tìm thấy khách hàng phù hợp."
										: summary.salesRowCount
											? "Chưa có khách hàng còn phải thu theo dữ liệu đủ điều kiện."
											: "Chưa có dòng bán hàng MISA tại ngày chốt."
									: view === "period"
										? "Chưa có khoản thu trong kỳ đã chọn."
										: "Chưa có khoản thu chờ phân bổ tại ngày chốt."}
							</div>
						)}
					</section>
				</>
			) : (
				<Notice tone="warning" announce>
					Chọn ngày chốt và ngày bắt đầu kỳ thu hợp lệ. Ngày bắt đầu phải bằng
					hoặc trước ngày chốt.
				</Notice>
			)}
			{openedCustomer && (
				<InvoiceDrawer
					key={openedCustomer.id}
					customer={openedCustomer}
					asOfDate={through}
					onClose={() => setOpenedCustomerId(undefined)}
				/>
			)}
		</div>
	);
}
