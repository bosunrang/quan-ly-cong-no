import { ArrowRight, Database, FilterX, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import type {
	InvoiceCustomer,
	ReceivablesView,
} from "../../domain/reports/view-types";
import {
	pageControls,
	resourceWithQuery,
	useServerData,
} from "../../shared/hooks/useServerData";
import { Notice } from "../../shared/ui/Notice";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";
import { SalesInvoiceDrawer } from "./SalesInvoiceDrawer";

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const missing = "?";

export function SalesReceivablesPage({
	onOpenMisa,
	onOpenCustomers,
}: {
	onOpenMisa?: () => void;
	onOpenCustomers?: () => void;
}) {
	const [query, setQuery] = useState("");
	const searchQuery = useDeferredValue(query);
	const [employee, setEmployee] = useState("");
	const [province, setProvince] = useState("");
	const [opened, setOpened] = useState<InvoiceCustomer>();
	const [page, setPage] = useState(1);
	const response = useServerData<ReceivablesView>(
		resourceWithQuery("receivables", {
			q: searchQuery,
			employee,
			province,
			page,
		}),
	);
	const data = response.data ?? response.previous;
	if (response.error)
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
	const total = response.data?.rows.total ?? 0;
	const pagination = {
		...pageControls(response.data?.rows.page ?? page, data.rows.limit, total),
		currentPage: response.data?.rows.page ?? page,
		setCurrentPage: setPage,
		resetPage: () => setPage(1),
		pageItems: response.data?.rows.items ?? [],
	};

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

	return (
		<div className="page-stack" aria-busy={response.loading}>
			{response.loading && <p role="status">Đang tải kết quả…</p>}
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
			{missingTotalCount > 0 && (
				<Notice tone="warning">
					{number.format(missingTotalCount)} dòng thiếu Tổng thanh toán. Giá trị
					trong bảng chỉ cộng các dòng có số tiền.
				</Notice>
			)}
			<section
				className="panel data-source-card"
				aria-labelledby="receivables-heading"
			>
				<div className="data-source-icon" aria-hidden="true">
					<Database className="icon-size-22" />
				</div>
				<div className="data-source-copy">
					<h2 id="receivables-heading">Hóa đơn theo khách hàng</h2>
					<p>
						<strong>{data.fileName}</strong>
					</p>
					<p>
						Số đã thu lấy từ phân bổ đang hiệu lực. Số còn phải thu tính trên
						chứng từ đủ điều kiện trong sổ này. Số dư đầu kỳ chưa được tính.
					</p>
				</div>
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
								onChange={(event) => {
									setQuery(event.target.value);
									pagination.resetPage();
								}}
							/>
						</span>
					</label>
					<label className="ui-field">
						<span>Nhân viên phụ trách</span>
						<select
							aria-label="Lọc theo nhân viên phụ trách"
							value={employee}
							onChange={(event) => {
								setEmployee(event.target.value);
								pagination.resetPage();
							}}
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
					<label className="ui-field">
						<span>Khu vực</span>
						<select
							aria-label="Lọc theo khu vực"
							value={province}
							onChange={(event) => {
								setProvince(event.target.value);
								pagination.resetPage();
							}}
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
					{(query || employee || province) && (
						<button
							className="row-action"
							type="button"
							aria-label="Xóa bộ lọc"
							title="Xóa bộ lọc"
							onClick={() => {
								setQuery("");
								setEmployee("");
								setProvince("");
								pagination.resetPage();
							}}
						>
							<FilterX className="icon-size-16" />
						</button>
					)}
				</div>
				<section
					className="table-scroll receivable-table"
					aria-label="Vùng cuộn bảng khách hàng"
					// biome-ignore lint/a11y/noNoninteractiveTabindex: Support scrolling the table by keyboard.
					tabIndex={0}
				>
					<table aria-label="Hóa đơn theo khách hàng">
						<thead>
							<tr>
								<th scope="col">Khách hàng</th>
								<th scope="col">Nhân viên phụ trách</th>
								<th scope="col">Khu vực</th>
								<th scope="col">Hóa đơn có số</th>
								<th scope="col" className="receivable-amount-column">
									Giá trị
								</th>
								<th scope="col" className="receivable-amount-column">
									Đã thu
								</th>
								<th scope="col" className="receivable-amount-column">
									Còn phải thu
								</th>
							</tr>
						</thead>
						<tbody>
							{pagination.pageItems.map((group) => (
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
									<td className="receivable-number">
										{number.format(group.invoiceCount)}
										{group.documentCount > group.invoiceCount && (
											<span className="cell-meta">
												{number.format(
													group.documentCount - group.invoiceCount,
												)}{" "}
												chứng từ thiếu số HĐ
											</span>
										)}
									</td>
									<td className="receivable-number strong-number">
										{group.paymentTotal === null
											? "—"
											: number.format(group.paymentTotal)}
									</td>
									<td className="receivable-number">
										{group.balance
											? number.format(group.balance.received)
											: "—"}
									</td>
									<td className="receivable-number">
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
								</tr>
							))}
						</tbody>
					</table>
					{!total && (
						<p className="empty-state">Không tìm thấy khách hàng phù hợp.</p>
					)}
				</section>
				<footer className="receivable-footer">
					<span>
						{number.format(pagination.firstVisible)}–
						{number.format(pagination.lastVisible)} / {number.format(total)}{" "}
						khách hàng
					</span>
					<PaginationControls
						currentPage={pagination.currentPage}
						pageCount={pagination.pageCount}
						onPageChange={pagination.setCurrentPage}
						previousLabel="Trang khách hàng trước"
						nextLabel="Trang khách hàng sau"
					/>
				</footer>
			</section>
			{opened && (
				<SalesInvoiceDrawer
					key={opened.id}
					customer={opened}
					onClose={() => setOpened(undefined)}
				/>
			)}
		</div>
	);
}
