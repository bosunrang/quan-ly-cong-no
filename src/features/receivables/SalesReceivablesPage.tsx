import { ArrowRight, ChevronDown, FilterX, Search } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	agingBuckets,
	type AgingFilter,
} from "../../domain/payments/receivable-aging";
import type {
	InvoiceCustomer,
	ReceivablesView,
} from "../../domain/reports/view-types";
import {
	pageControls,
	resourceWithQuery,
	useServerData,
} from "../../shared/hooks/useServerData";
import { formatDateOnly } from "../../shared/lib/date";
import { AgingSwatch } from "../../shared/ui/AgingSwatch/AgingSwatch";
import { Notice } from "../../shared/ui/Notice";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";
import { SalesInvoiceDrawer } from "./SalesInvoiceDrawer";

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const missing = "?";
const searchDelay = 250;
const initialFilters = {
	q: "",
	employee: "",
	province: "",
	aging: "" as AgingFilter,
	page: 1,
};
const summaryAgingCards: AgingFilter[] = [
	"",
	"overdue",
	"current",
	"no-due-date",
];
const overdueAgingCards: readonly AgingFilter[] = agingBuckets.filter(
	(bucket) => bucket !== "current" && bucket !== "no-due-date",
);
const agingLabels: Record<AgingFilter, string> = {
	"": "Tất cả",
	overdue: "Nợ quá hạn",
	current: "Chưa quá hạn",
	"1-30": "Quá hạn 1–30 ngày",
	"31-60": "Quá hạn 31–60 ngày",
	"61-90": "Quá hạn 61–90 ngày",
	"90+": "Quá hạn trên 90 ngày",
	"no-due-date": "Chưa có hạn",
};

/** Số tiền của thẻ: "Tất cả" là tổng còn phải thu, "Nợ quá hạn" đã trừ giảm trừ chung. */
function agingCardAmount(data: ReceivablesView, filter: AgingFilter) {
	if (filter === "overdue") return data.agingOverdueAmount;
	if (filter) return data.agingAmounts[filter];
	return (
		agingBuckets.reduce((sum, bucket) => sum + data.agingAmounts[bucket], 0) -
		data.agingReductionAmount
	);
}

export function SalesReceivablesPage({
	showEmployeeFilter,
	canEditDueDates = false,
	onOpenMisa,
	onOpenCustomers,
}: {
	showEmployeeFilter: boolean;
	canEditDueDates?: boolean;
	onOpenMisa?: () => void;
	onOpenCustomers?: () => void;
}) {
	const [query, setQuery] = useState("");
	const [filters, setFilters] = useState(initialFilters);
	const [opened, setOpened] = useState<InvoiceCustomer>();
	const tableViewport = useRef<HTMLElement>(null);
	const shownResource = useRef<string | undefined>(undefined);
	const searchQuery = query.trim();
	const queryPending = searchQuery !== filters.q;
	const employee = showEmployeeFilter ? filters.employee : undefined;
	const resource = resourceWithQuery("receivables", { ...filters, employee });
	const response = useServerData<ReceivablesView>(resource);
	const { data: currentData } = response;
	const data = response.data ?? response.previous;
	const loading = queryPending || response.loading;

	useEffect(() => {
		if (!queryPending) return;
		const timer = window.setTimeout(() => {
			setFilters((current) => ({ ...current, q: searchQuery, page: 1 }));
		}, searchDelay);
		return () => window.clearTimeout(timer);
	}, [queryPending, searchQuery]);

	useLayoutEffect(() => {
		if (!currentData || shownResource.current === resource) return;
		shownResource.current = resource;
		if (tableViewport.current) tableViewport.current.scrollTop = 0;
	}, [currentData, resource]);

	if (response.error && !data)
		return (
			<Notice tone="danger" title="Không thể đọc công nợ" announce>
				{response.error}
			</Notice>
		);
	if (!data)
		return (
			<p className="panel empty-state" role="status">
				Đang tải công nợ…
			</p>
		);
	const { filterOptions, unmatchedAllocationCount, missingTotalCount } = data;
	const { province, aging } = filters;
	const overdueExpanded =
		aging === "overdue" || overdueAgingCards.includes(aging);
	const { page, limit, total, items } = data.rows;
	const pagination = pageControls(page, limit, total);

	if (!data.hasBook) {
		return (
			<section className="panel empty-state receivable-empty">
				<strong>Chưa có sổ bán hàng MISA</strong>
				{onOpenMisa && (
					<button className="button primary" type="button" onClick={onOpenMisa}>
						Đến Dữ liệu MISA <ArrowRight className="icon-size-16" />
					</button>
				)}
			</section>
		);
	}

	const renderAgingCard = (filter: AgingFilter) => {
		const count = data.agingUnitCounts?.[filter || "all"];
		const overdue = filter === "overdue";
		const noDueDate = filter === "no-due-date";
		const className = overdue
			? " is-overdue"
			: noDueDate
				? " is-no-due-date"
				: "";
		return (
			<button
				key={filter}
				className={`choice-card receivable-aging-card${className}`}
				type="button"
				aria-pressed={aging === filter}
				aria-expanded={overdue ? overdueExpanded : undefined}
				aria-controls={
					overdue
						? "receivable-overdue-groups receivable-customer-table"
						: "receivable-customer-table"
				}
				onClick={() =>
					setFilters((current) => ({
						...current,
						q: searchQuery,
						aging: overdue && current.aging === "overdue" ? "" : filter,
						page: 1,
					}))
				}
			>
				<span className="receivable-aging-card-label">
					<AgingSwatch bucket={filter} />
					{agingLabels[filter]}
					{overdue && (
						<ChevronDown
							className="receivable-aging-chevron icon-size-16"
							aria-hidden="true"
						/>
					)}
				</span>
				<strong>{number.format(agingCardAmount(data, filter))}</strong>
				<span className="cell-meta">
					{count === undefined ? "—" : number.format(count)} khách hàng
					{noDueDate && " có hóa đơn chưa đặt hạn"}
				</span>
			</button>
		);
	};

	return (
		<div className="page-stack">
			{response.error && (
				<Notice tone="danger" title="Không thể tải lại công nợ" announce>
					{response.error}
				</Notice>
			)}
			{unmatchedAllocationCount > 0 && (
				<Notice tone="warning">
					{number.format(unmatchedAllocationCount)} chứng từ có phân bổ đang
					hiệu lực chưa khớp với sổ MISA hiện tại. Kiểm tra trong Đối soát khoản
					thu.
				</Notice>
			)}
			{filterOptions.unmatchedCount > 0 && (
				<Notice tone="warning">
					{number.format(filterOptions.unmatchedCount)} khách hàng chưa khớp
					danh mục. Bộ lọc nhân viên và khu vực dùng thông tin từ danh mục.{" "}
					{onOpenCustomers && (
						<button
							className="text-button"
							type="button"
							onClick={onOpenCustomers}
						>
							Mở danh mục khách hàng
						</button>
					)}
				</Notice>
			)}
			<section
				className="panel receivable-invoice-summary receivable-aging"
				aria-labelledby="receivable-aging-title"
			>
				<div className="receivable-aging-head">
					<h2 id="receivable-aging-title">Tuổi nợ</h2>
					<span>Tính đến {formatDateOnly(data.agingAsOf)}</span>
				</div>
				<div className="receivable-aging-cards">
					{summaryAgingCards.map(renderAgingCard)}
				</div>
				<section
					id="receivable-overdue-groups"
					className="receivable-overdue-groups"
					aria-label="Nhóm nợ quá hạn theo số ngày"
					hidden={!overdueExpanded}
				>
					{overdueExpanded && (
						<div className="receivable-aging-cards">
							{overdueAgingCards.map(renderAgingCard)}
						</div>
					)}
				</section>
			</section>
			<section className="panel data-panel">
				<div className="panel-header receivable-toolbar">
					<label className="ui-field receivable-search-field">
						<span>Tìm khách hàng</span>
						<span className="table-search">
							<Search className="icon-size-16" aria-hidden="true" />
							<input
								type="search"
								aria-label="Tìm khách hàng hoặc mã MISA"
								value={query}
								placeholder="Tìm khách hàng hoặc mã MISA"
								onChange={(event) => setQuery(event.target.value)}
							/>
						</span>
					</label>
					{showEmployeeFilter && (
						<label className="ui-field">
							<span>Nhân viên phụ trách</span>
							<select
								aria-label="Lọc theo nhân viên phụ trách"
								value={employee}
								onChange={(event) =>
									setFilters({
										...filters,
										q: searchQuery,
										employee: event.target.value,
										page: 1,
									})
								}
							>
								<option value="">Tất cả nhân viên</option>
								{filterOptions.employees.map(([id, name]) => (
									<option key={id} value={id}>
										{name}
									</option>
								))}
								<option value={missing}>Chưa có người phụ trách</option>
							</select>
						</label>
					)}
					<label className="ui-field">
						<span>Khu vực</span>
						<select
							aria-label="Lọc theo khu vực"
							value={province}
							onChange={(event) =>
								setFilters({
									...filters,
									q: searchQuery,
									province: event.target.value,
									page: 1,
								})
							}
						>
							<option value="">Tất cả khu vực</option>
							{filterOptions.provinces.map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
							<option value={missing}>Chưa có khu vực</option>
						</select>
					</label>
					<button
						className="row-action"
						type="button"
						aria-label="Xóa bộ lọc"
						title="Xóa bộ lọc"
						disabled={!query && !employee && !province && !aging}
						onClick={() => {
							setQuery("");
							setFilters(initialFilters);
						}}
					>
						<FilterX className="icon-size-16" />
					</button>
				</div>
				<section
					className="table-scroll receivable-table"
					id="receivable-customer-table"
					ref={tableViewport}
					aria-busy={loading}
					aria-label="Vùng cuộn bảng khách hàng"
					// biome-ignore lint/a11y/noNoninteractiveTabindex: Support scrolling the table by keyboard.
					tabIndex={0}
				>
					<table aria-label="Hóa đơn theo khách hàng">
						<colgroup>
							<col />
							<col className="receivable-col-employee" />
							<col className="receivable-col-region" />
							<col className="receivable-col-value" />
							<col className="receivable-col-paid" />
							<col className="receivable-col-balance" />
							<col className="receivable-col-overdue" />
							<col className="receivable-col-due-date" />
							<col className="receivable-col-overdue-days" />
						</colgroup>
						<thead>
							<tr>
								<th scope="col">Khách hàng</th>
								<th scope="col">Nhân viên phụ trách</th>
								<th scope="col">Khu vực</th>
								<th scope="col" className="receivable-amount-column">
									Giá trị
								</th>
								<th scope="col" className="receivable-amount-column">
									Đã thu
								</th>
								<th scope="col" className="receivable-amount-column">
									Còn phải thu
								</th>
								<th scope="col" className="receivable-amount-column">
									Nợ quá hạn
								</th>
								<th scope="col">Hạn thanh toán sớm nhất</th>
								<th scope="col">Số ngày quá hạn tối đa</th>
							</tr>
						</thead>
						<tbody>
							{items.map((group) => (
								<tr key={group.id}>
									<td>
										<button
											type="button"
											className="text-button receivable-customer-link table-customer-name"
											aria-haspopup="dialog"
											onClick={() => setOpened(group)}
										>
											{group.name}
										</button>
										<span className="cell-meta">
											{group.customerCode && (
												<>
													{group.customerCode}
													{!group.catalogMatch && " · "}
												</>
											)}
											{!group.catalogMatch && "Chưa khớp danh mục"}
										</span>
									</td>
									<td>{group.employeeName || "—"}</td>
									<td>{group.province || "—"}</td>
									<td className="receivable-amount-column receivable-number strong-number">
										{group.paymentTotal === null
											? "—"
											: number.format(group.paymentTotal)}
									</td>
									<td className="receivable-amount-column receivable-number">
										{group.balance
											? number.format(group.balance.received)
											: "—"}
									</td>
									<td className="receivable-amount-column receivable-number">
										<strong>
											{group.balance
												? number.format(group.balance.remaining)
												: "—"}
										</strong>
										{group.unverifiedCount > 0 && (
											<span className="cell-meta">
												{number.format(group.unverifiedCount)} chứng từ chưa
												tính
											</span>
										)}
									</td>
									<td className="receivable-amount-column receivable-number">
										{group.overdueAmount > 0 ? (
											<strong className="receivable-overdue">
												{number.format(group.overdueAmount)}
											</strong>
										) : (
											"—"
										)}
										{group.unallocatedAmount > 0 && (
											<span className="cell-meta receivable-unallocated">
												Còn {number.format(group.unallocatedAmount)} thu chưa
												phân bổ
											</span>
										)}
									</td>
									<td className="receivable-number">
										{formatDateOnly(group.earliestDueDate)}
									</td>
									<td>
										{group.maxOverdueDays === null
											? "—"
											: `${number.format(group.maxOverdueDays)} ngày`}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{!loading && !total && (
						<p className="empty-state">Không tìm thấy khách hàng phù hợp.</p>
					)}
				</section>
				<footer className="receivable-footer">
					<span role="status">
						{loading
							? "Đang tải kết quả…"
							: `${number.format(pagination.firstVisible)}–${number.format(pagination.lastVisible)} / ${number.format(total)} khách hàng`}
					</span>
					<PaginationControls
						currentPage={page}
						pageCount={pagination.pageCount}
						disabled={loading}
						onPageChange={(nextPage) =>
							setFilters({ ...filters, page: nextPage })
						}
						previousLabel="Trang khách hàng trước"
						nextLabel="Trang khách hàng sau"
					/>
				</footer>
			</section>
			{missingTotalCount > 0 && (
				<Notice tone="warning">
					{number.format(missingTotalCount)} dòng thiếu Tổng thanh toán. Giá trị
					trong bảng chỉ cộng các dòng có số tiền.
				</Notice>
			)}
			{opened && (
				<SalesInvoiceDrawer
					key={opened.id}
					customer={opened}
					agingFilter={aging}
					canEditDueDates={canEditDueDates}
					onClose={() => setOpened(undefined)}
				/>
			)}
		</div>
	);
}
