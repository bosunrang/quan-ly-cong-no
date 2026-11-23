import { Check, Filter, Search, X } from "lucide-react";
import { useDeferredValue, useState } from "react";
import type { CustomerOpeningBalance } from "../../domain/misa/opening-balances.repository";
import type {
	InvoiceCustomer,
	InvoicePage,
	InvoiceRow,
} from "../../domain/reports/view-types";
import type { AgingFilter } from "../../domain/payments/receivable-aging";
import type { ReceivableDocument } from "../../domain/payments/receipt-receivables";
import {
	pageControls,
	resourceWithQuery,
	useServerData,
} from "../../shared/hooks/useServerData";
import { Notice } from "../../shared/ui/Notice";
import { formatDateOnly } from "../../shared/lib/date";
import { Drawer } from "../../shared/ui/Dialog/Drawer";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";
import { SalesInvoiceLinesDialog } from "../../shared/ui/SalesInvoiceLinesDialog";
import { StatusPill } from "../../shared/ui/StatusPill";
import { InvoiceReceiptAllocationsDialog } from "./InvoiceReceiptAllocationsDialog";
import { InvoiceDueDateDialog } from "./InvoiceDueDateDialog";
import { OpeningBalanceDialog } from "./OpeningBalanceDialog";
import { OpeningBalancePanel } from "./OpeningBalancePanel";

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

export function SalesInvoiceDrawer({
	customer,
	asOfDate,
	from,
	employee,
	province,
	agingFilter,
	canEditDueDates = false,
	onClose,
}: {
	customer: InvoiceCustomer;
	from?: string;
	employee?: string;
	province?: string;
	asOfDate?: string;
	agingFilter?: AgingFilter;
	canEditDueDates?: boolean;
	onClose: () => void;
}) {
	const [query, setQuery] = useState("");
	const [missingInvoiceOnly, setMissingInvoiceOnly] = useState(false);
	const [detail, setDetail] = useState<{
		documentId: string;
		kind: "lines" | "allocations";
	}>();
	const [page, setPage] = useState(1);
	const [editingDueDate, setEditingDueDate] = useState<InvoiceRow>();
	const [editingOpeningBalance, setEditingOpeningBalance] =
		useState<CustomerOpeningBalance>();
	const openingCustomerId = asOfDate ? undefined : customer.customerId;
	const search = useDeferredValue(query);
	const base = `receivables/${encodeURIComponent(customer.id)}/invoices`;
	const periodScope = { through: asOfDate, from, employee, province };
	const response = useServerData<InvoicePage>(
		resourceWithQuery(base, {
			...periodScope,
			aging: agingFilter || undefined,
			missingInvoice: missingInvoiceOnly ? 1 : undefined,
			q: search,
			page,
		}),
	);
	const sameScope = response.previousResource?.startsWith(
		`${resourceWithQuery(base, periodScope)}&`,
	);
	const { totals, invoiceCount, missingInvoiceNumberCount } =
		response.data ??
		(sameScope && !response.error ? response.previous : undefined) ??
		{};
	const balance = totals?.balance;
	const amounts = [
		["Tổng giá trị", balance && balance.received + balance.remaining],
		["Đã thu", balance?.received],
		["Còn phải thu", balance?.remaining],
	] as const;
	const detailResponse = useServerData<ReceivableDocument>(
		detail
			? resourceWithQuery(
					`${base}/${encodeURIComponent(detail.documentId)}`,
					periodScope,
				)
			: undefined,
	);
	const openedDocument = detailResponse.data;
	const total = response.data?.total ?? 0;
	const pagination = {
		...pageControls(response.data?.page ?? page, 20, total),
		currentPage: response.data?.page ?? page,
		setCurrentPage: setPage,
		resetPage: () => setPage(1),
		pageItems: response.data?.items ?? [],
	};

	return (
		<>
			<Drawer
				ariaLabelledBy="sales-invoice-title"
				className={`customer-drawer receivable-invoice-drawer${asOfDate ? "" : " has-aging"}`}
				onClose={onClose}
			>
				<header className="customer-drawer-head">
					<div>
						<span>{customer.customerCode || "HÓA ĐƠN VÀ CHỨNG TỪ"}</span>
						<h2 id="sales-invoice-title">{customer.name}</h2>
					</div>
					<button
						className="drawer-close"
						type="button"
						aria-label="Đóng"
						onClick={onClose}
					>
						<X className="icon-size-19" />
					</button>
				</header>
				<div className="customer-detail-body">
					{openingCustomerId && (
						<OpeningBalancePanel
							customerId={openingCustomerId}
							canEdit={canEditDueDates}
							onEdit={setEditingOpeningBalance}
						/>
					)}
					{totals && (
						<section
							className="panel receivable-invoice-summary"
							aria-label="Tổng hợp công nợ tại ngày chốt"
						>
							<dl>
								{amounts.map(([label, value]) => (
									<div key={label}>
										<dt>{label}</dt>
										<dd>{value == null ? "—" : number.format(value)}</dd>
									</div>
								))}
							</dl>
							{totals.unverifiedCount > 0 && (
								<p>
									{number.format(totals.unverifiedCount)} chứng từ chưa đủ điều
									kiện tính công nợ.
								</p>
							)}
						</section>
					)}
					{(response.loading || detailResponse.loading) && (
						<p role="status">Đang tải chứng từ…</p>
					)}
					{(response.error || detailResponse.error) && (
						<Notice tone="danger" announce>
							{response.error || detailResponse.error}
						</Notice>
					)}
					<section className="panel data-panel">
						<div className="data-toolbar">
							<label className="table-search">
								<span className="visually-hidden">
									Tìm hóa đơn hoặc chứng từ
								</span>
								<Search className="icon-size-16" aria-hidden="true" />
								<input
									type="search"
									placeholder="Tìm hóa đơn hoặc chứng từ"
									value={query}
									onChange={(event) => {
										setQuery(event.target.value);
										pagination.resetPage();
									}}
								/>
							</label>
							{asOfDate && (
								<span className="receivable-invoice-meta">
									Ngày chốt {formatDateOnly(asOfDate)}
								</span>
							)}
							{(invoiceCount !== undefined || missingInvoiceOnly) && (
								<div className="receivable-invoice-meta receivable-invoice-counts">
									{invoiceCount !== undefined && (
										<span>
											<strong>{number.format(invoiceCount)}</strong> hóa đơn có
											số
										</span>
									)}
									{((missingInvoiceNumberCount ?? 0) > 0 ||
										missingInvoiceOnly) && (
										<button
											className="receivable-invoice-filter"
											type="button"
											aria-pressed={missingInvoiceOnly}
											aria-controls="receivable-invoice-results"
											title={
												missingInvoiceOnly
													? "Bỏ lọc chứng từ thiếu số HĐ"
													: "Lọc chứng từ thiếu số HĐ"
											}
											onClick={() => {
												setMissingInvoiceOnly((value) => !value);
												pagination.resetPage();
											}}
										>
											<StatusPill
												tone="warning"
												icon={
													missingInvoiceOnly ? (
														<Check aria-hidden="true" />
													) : (
														<Filter aria-hidden="true" />
													)
												}
											>
												{missingInvoiceNumberCount === undefined
													? "Chứng từ thiếu số HĐ"
													: `${number.format(missingInvoiceNumberCount)} chứng từ thiếu số HĐ`}
											</StatusPill>
										</button>
									)}
								</div>
							)}
						</div>
						<section
							className="table-scroll receivable-invoice-table"
							id="receivable-invoice-results"
							aria-label="Vùng cuộn bảng hóa đơn"
							aria-busy={response.loading}
							// biome-ignore lint/a11y/noNoninteractiveTabindex: Support scrolling the table by keyboard.
							tabIndex={0}
						>
							<table
								aria-label={
									asOfDate
										? "Hóa đơn và chứng từ còn nợ"
										: "Hóa đơn và chứng từ của khách hàng"
								}
							>
								<thead>
									<tr>
										<th scope="col">Ngày chứng từ</th>
										<th scope="col">Số hóa đơn</th>
										<th scope="col">Số chứng từ</th>
										{asOfDate && <th scope="col">Dòng hàng</th>}
										<th scope="col" className="receivable-amount-column">
											Giá trị
										</th>
										<th scope="col" className="receivable-amount-column">
											Đã thu
										</th>
										<th scope="col" className="receivable-amount-column">
											Còn phải thu
										</th>
										{!asOfDate && (
											<>
												<th scope="col">Hạn thanh toán</th>
												<th scope="col">Số ngày quá hạn</th>
											</>
										)}
									</tr>
								</thead>
								<tbody>
									{pagination.pageItems.map((document) => (
										<tr key={document.id}>
											<td>
												{formatDateOnly(document.firstDate)}
												{document.lastDate !== document.firstDate && (
													<span className="cell-meta">
														Đến {formatDateOnly(document.lastDate)}
													</span>
												)}
											</td>
											<td>
												{document.invoiceNumber ? (
													<button
														className="text-button receivable-invoice-link"
														type="button"
														aria-haspopup="dialog"
														onClick={() =>
															setDetail({
																documentId: document.id,
																kind: "lines",
															})
														}
													>
														{document.invoiceNumber}
													</button>
												) : (
													"—"
												)}
											</td>
											<td>
												{document.invoiceNumber || document.openingBalance ? (
													document.documentNumbers.join(", ")
												) : (
													<button
														className="text-button receivable-invoice-link"
														type="button"
														aria-haspopup="dialog"
														onClick={() =>
															setDetail({
																documentId: document.id,
																kind: "lines",
															})
														}
													>
														{document.documentNumbers.join(", ")}
													</button>
												)}
											</td>
											{asOfDate && (
												<td className="receivable-number">
													{document.openingBalance
														? "—"
														: number.format(document.lineCount)}
												</td>
											)}
											<td className="receivable-number strong-number">
												{document.paymentTotal === null
													? "—"
													: number.format(document.paymentTotal)}
											</td>
											<td className="receivable-number">
												{document.balance && !document.reduction ? (
													<button
														className="text-button receivable-invoice-link"
														type="button"
														aria-haspopup="dialog"
														aria-label={`Xem khoản thu đã phân bổ · ${number.format(document.balance.received)} · ${document.invoiceNumber || document.documentNumbers.join(", ")}`}
														onClick={() =>
															setDetail({
																documentId: document.id,
																kind: "allocations",
															})
														}
													>
														{number.format(document.balance.received)}
													</button>
												) : (
													"—"
												)}
											</td>
											<td className="receivable-number">
												<strong>
													{document.balance
														? number.format(document.balance.remaining)
														: "—"}
												</strong>
												{document.reduction && (
													<span className="cell-meta">
														{document.openingBalance
															? "Dư có đầu kỳ"
															: "Giảm trừ"}
													</span>
												)}
												{document.allocationMismatch && (
													<span className="cell-meta">Cần đối chiếu</span>
												)}
											</td>
											{!asOfDate && (
												<>
													<td>
														{canEditDueDates &&
														document.balance &&
														!document.reduction ? (
															<button
																className="text-button receivable-invoice-link"
																type="button"
																aria-haspopup="dialog"
																aria-label={`Sửa hạn thanh toán · ${document.invoiceNumber || document.documentNumbers.join(", ")}`}
																onClick={() => setEditingDueDate(document)}
															>
																{formatDateOnly(
																	document.aging?.dueDate,
																	"Đặt hạn",
																)}
															</button>
														) : (
															formatDateOnly(document.aging?.dueDate)
														)}
														{document.aging?.overrideDueDate && (
															<span className="cell-meta">Hạn riêng</span>
														)}
													</td>
													<td
														className={
															document.aging?.daysOverdue
																? "receivable-overdue receivable-number"
																: "receivable-number"
														}
													>
														{document.aging?.daysOverdue == null
															? "—"
															: number.format(document.aging.daysOverdue)}
													</td>
												</>
											)}
										</tr>
									))}
								</tbody>
							</table>
							{!total && !response.loading && !response.error && (
								<p className="empty-state">
									{asOfDate && !search.trim()
										? "Không có chứng từ còn nợ được tính tại ngày chốt."
										: missingInvoiceOnly
											? "Không tìm thấy chứng từ thiếu số hóa đơn phù hợp."
											: "Không tìm thấy chứng từ phù hợp."}
								</p>
							)}
						</section>
						<footer className="receivable-footer">
							<span>
								{number.format(pagination.firstVisible)}–
								{number.format(pagination.lastVisible)} / {number.format(total)}{" "}
								nhóm chứng từ
							</span>
							<PaginationControls
								currentPage={pagination.currentPage}
								pageCount={pagination.pageCount}
								onPageChange={pagination.setCurrentPage}
								previousLabel="Trang hóa đơn trước"
								nextLabel="Trang hóa đơn sau"
							/>
						</footer>
					</section>
				</div>
			</Drawer>
			{openingCustomerId && editingOpeningBalance && (
				<OpeningBalanceDialog
					customerId={openingCustomerId}
					customerName={customer.name}
					balance={editingOpeningBalance}
					onClose={() => setEditingOpeningBalance(undefined)}
				/>
			)}
			{editingDueDate && (
				<InvoiceDueDateDialog
					invoice={editingDueDate}
					resource={`${base}/${encodeURIComponent(editingDueDate.id)}/due-date`}
					onClose={() => setEditingDueDate(undefined)}
				/>
			)}
			{detail?.kind === "lines" && openedDocument && (
				<SalesInvoiceLinesDialog
					document={openedDocument}
					customerName={customer.name}
					onClose={() => setDetail(undefined)}
				/>
			)}
			{detail?.kind === "allocations" && openedDocument?.balance && (
				<InvoiceReceiptAllocationsDialog
					document={openedDocument}
					onClose={() => setDetail(undefined)}
				/>
			)}
		</>
	);
}
