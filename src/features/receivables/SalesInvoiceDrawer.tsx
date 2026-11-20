import { Search, X } from "lucide-react";
import { useDeferredValue, useState } from "react";
import type {
	InvoiceCustomer,
	InvoiceRow,
	Page,
} from "../../domain/reports/view-types";
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
import { InvoiceReceiptAllocationsDialog } from "./InvoiceReceiptAllocationsDialog";

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

export function SalesInvoiceDrawer({
	customer,
	asOfDate,
	from,
	onClose,
}: {
	customer: InvoiceCustomer;
	from?: string;
	asOfDate?: string;
	onClose: () => void;
}) {
	const [query, setQuery] = useState("");
	const [detail, setDetail] = useState<{
		documentId: string;
		kind: "lines" | "allocations";
	}>();
	const [page, setPage] = useState(1);
	const search = useDeferredValue(query);
	const base = `receivables/${encodeURIComponent(customer.id)}/invoices`;
	const response = useServerData<Page<InvoiceRow>>(
		resourceWithQuery(base, { q: search, page, through: asOfDate, from }),
	);
	const detailResponse = useServerData<ReceivableDocument>(
		detail
			? resourceWithQuery(`${base}/${encodeURIComponent(detail.documentId)}`, {
					through: asOfDate,
					from,
				})
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
				className="customer-drawer receivable-invoice-drawer"
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
								<span className="receivable-invoice-cutoff">
									Ngày chốt {formatDateOnly(asOfDate)}
								</span>
							)}
						</div>
						<section
							className="table-scroll receivable-invoice-table"
							aria-label="Vùng cuộn bảng hóa đơn"
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
										<th scope="col">Dòng hàng</th>
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
												{document.invoiceNumber ? (
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
											<td className="receivable-number">
												{number.format(document.lineCount)}
											</td>
											<td className="receivable-number strong-number">
												{document.paymentTotal === null
													? "—"
													: number.format(document.paymentTotal)}
											</td>
											<td className="receivable-number">
												{document.balance ? (
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
												{document.allocationMismatch && (
													<span className="cell-meta">Cần đối chiếu</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
							{!total && !response.loading && !response.error && (
								<p className="empty-state">Không tìm thấy chứng từ phù hợp.</p>
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
