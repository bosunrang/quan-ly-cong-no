import { ArrowRight, Database, FilterX, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { normalizeVietnamese } from "../../domain/customers/customer.province";
import { readCustomers } from "../../domain/customers/customer.repository";
import { readSalesEmployees } from "../../domain/employees/employee.repository";
import type { MisaSalesBook } from "../../domain/misa/misa.sales-book";
import { readMisaSalesBook } from "../../domain/misa/misa.sales-book.repository";
import { buildSalesReceivables } from "../../domain/misa/misa.sales-receivables";
import type { ReceiptLedger } from "../../domain/payments/receipt-ledger";
import {
	readReceiptLedger,
	subscribeReceiptLedger,
} from "../../domain/payments/receipt-ledger.repository";
import { projectReceiptReceivables } from "../../domain/payments/receipt-receivables";
import { usePagination } from "../../shared/hooks/usePagination";
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
	const [book, setBook] = useState<MisaSalesBook | null>();
	const [error, setError] = useState("");
	const [ledger, setLedger] = useState<ReceiptLedger>();
	const [ledgerError, setLedgerError] = useState("");
	const [customers] = useState(readCustomers);
	const [employees] = useState(readSalesEmployees);
	const [query, setQuery] = useState("");
	// Ô tìm kiếm cập nhật ngay; danh sách lọc lại sau đó để gõ phím không bị khựng.
	const searchQuery = useDeferredValue(query);
	const [employee, setEmployee] = useState("");
	const [province, setProvince] = useState("");
	const [openedId, setOpenedId] = useState("");

	useEffect(() => {
		let active = true;
		readMisaSalesBook()
			.then((result) => {
				if (active) setBook(result);
			})
			.catch((reason: unknown) => {
				if (active)
					setError(
						reason instanceof Error
							? reason.message
							: "Không thể đọc sổ bán hàng đã lưu.",
					);
			});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		let request = 0;
		const refresh = () => {
			const current = ++request;
			void readReceiptLedger()
				.then((result) => {
					if (request !== current) return;
					setLedger(result);
					setLedgerError("");
				})
				.catch((reason: unknown) => {
					if (request !== current) return;
					setLedger(undefined);
					setLedgerError(
						reason instanceof Error
							? reason.message
							: "Không thể đọc sổ đối soát.",
					);
				});
		};
		const unsubscribe = subscribeReceiptLedger(refresh);
		window.addEventListener("focus", refresh);
		refresh();
		return () => {
			request += 1;
			unsubscribe();
			window.removeEventListener("focus", refresh);
		};
	}, []);

	const salesGroups = useMemo(
		() => (book ? buildSalesReceivables(book.rows, customers, employees) : []),
		[book, customers, employees],
	);
	const { customers: groups, unmatchedCount: unmatchedAllocationCount } =
		useMemo(
			() =>
				projectReceiptReceivables(salesGroups, book?.fileName ?? "", ledger),
			[salesGroups, book?.fileName, ledger],
		);
	const filterOptions = useMemo(() => {
		const names = new Map<string, string>();
		const provinces = new Set<string>();
		let unmatchedCount = 0;
		for (const group of salesGroups) {
			if (group.employeeId) names.set(group.employeeId, group.employeeName);
			if (group.province) provinces.add(group.province);
			if (!group.catalogMatch) unmatchedCount += 1;
		}
		return {
			employees: [...names].sort((left, right) =>
				left[1].localeCompare(right[1], "vi"),
			),
			provinces: [...provinces].sort((left, right) =>
				left.localeCompare(right, "vi"),
			),
			unmatchedCount,
		};
	}, [salesGroups]);
	const visible = useMemo(() => {
		const needle = normalizeVietnamese(searchQuery);
		return groups.filter(
			(group) =>
				(!employee || (group.employeeId || missing) === employee) &&
				(!province || (group.province || missing) === province) &&
				normalizeVietnamese(`${group.name} ${group.customerCode}`).includes(
					needle,
				),
		);
	}, [groups, searchQuery, employee, province]);
	const pagination = usePagination(visible);
	const opened = openedId
		? groups.find((group) => group.id === openedId)
		: undefined;

	if (error)
		return (
			<Notice tone="danger" title="Không thể mở sổ bán hàng MISA" announce>
				{error}
			</Notice>
		);
	if (book === undefined)
		return (
			<p className="panel empty-state" role="status">
				Đang đọc sổ bán hàng MISA…
			</p>
		);
	if (!book?.rows.length) {
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

	const missingTotalCount = visible.reduce(
		(count, group) => count + group.missingTotalCount,
		0,
	);

	return (
		<div className="page-stack">
			{ledgerError && (
				<Notice
					tone="danger"
					title="Không thể cập nhật số đã thu và còn phải thu"
					announce
				>
					{ledgerError}
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
						<strong>{book.fileName}</strong>
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
											onClick={() => setOpenedId(group.id)}
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
										{group.documents.length > group.invoiceCount && (
											<span className="cell-meta">
												{number.format(
													group.documents.length - group.invoiceCount,
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
					{!visible.length && (
						<p className="empty-state">Không tìm thấy khách hàng phù hợp.</p>
					)}
				</section>
				<footer className="receivable-footer">
					<span>
						{number.format(pagination.firstVisible)}–
						{number.format(pagination.lastVisible)} /{" "}
						{number.format(visible.length)} khách hàng
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
					onClose={() => setOpenedId("")}
				/>
			)}
		</div>
	);
}
