import { GitMerge, Plus, ReceiptText, Search, Undo2, X } from "lucide-react";
import { useDeferredValue, useRef, useState } from "react";
import type { Customer } from "../../domain/customers/customer.model";
import type { ReceiptDraft } from "../../domain/payments/receipt-ledger";
import {
	findReceipt,
	saveAllocation,
	saveReceipt,
	saveReversal,
} from "../../domain/payments/receipt-ledger.repository";
import type {
	ReceiptDetail,
	ReceiptList,
	SalesMetadata,
} from "../../domain/reports/view-types";
import { ApiError } from "../../shared/api/client";
import {
	accountingChanged,
	pageControls,
	resourceWithQuery,
	useServerData,
} from "../../shared/hooks/useServerData";
import { useTransientNotice } from "../../shared/hooks/useTransientNotice";
import { formatDateOnly, formatTimestamp } from "../../shared/lib/date";
import { Drawer } from "../../shared/ui/Dialog/Drawer";
import { Notice } from "../../shared/ui/Notice";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";
import { SalesInvoiceLinesTable } from "../../shared/ui/SalesInvoiceLinesDialog";
import { StatusPill } from "../../shared/ui/StatusPill";
import {
	money,
	ReceiptAllocationDialog,
	ReceiptReversalDialog,
} from "./ReceiptAllocationDialog";
import { ReceiptFormDialog } from "./ReceiptFormDialog";

type Action =
	| { kind: "create" | "allocate" | "reverseReceipt" }
	| { kind: "reverse"; id: string };

const emptyCustomers: Customer[] = [];

const statuses = {
	reversed: { tone: "neutral", label: "Đã hủy khoản thu" },
	closed: { tone: "success", label: "Đã phân bổ hết" },
	partial: { tone: "info", label: "Phân bổ một phần" },
	open: { tone: "neutral", label: "Chưa phân bổ" },
} as const;

const errorText = (reason: unknown) =>
	reason instanceof Error ? reason.message : "Không thể hoàn tất thao tác.";

export function PaymentsPage({ onOpenMisa }: { onOpenMisa?: () => void }) {
	const directory = useServerData<Customer[]>("customers");
	const customers = directory.data ?? emptyCustomers;
	const [query, setQuery] = useState("");
	// Ô tìm kiếm cập nhật ngay; danh sách lọc lại sau đó để gõ phím không bị khựng.
	const searchQuery = useDeferredValue(query);
	const [status, setStatus] = useState("active");
	const [selectedId, setSelectedId] = useState("");
	const [action, setAction] = useState<Action | null>(null);
	const [error, setError] = useState("");
	const { notice, showNotice, dismissNotice } = useTransientNotice(4000);
	const [busy, setBusy] = useState(false);
	const saving = useRef(false);
	const [page, setPage] = useState(1);
	const list = useServerData<ReceiptList>(
		resourceWithQuery("receipts", { page, q: searchQuery, status }),
	);
	const selectedData = useServerData<ReceiptDetail>(
		selectedId ? `receipts/${encodeURIComponent(selectedId)}` : undefined,
	);
	const sales = useServerData<SalesMetadata | null>("sales-book/status");
	const book = sales.data;
	const bookError = sales.error;
	const selected = selectedData.data?.receipt;
	const history = selectedData.data?.allocations ?? [];
	const allocatedInvoices = selectedData.data?.allocatedInvoices ?? [];
	// Giữ trang đang xem trong lúc chờ trang hoặc bộ lọc mới, không nháy về bảng trống.
	const receipts = list.data ?? list.previous;
	const total = receipts?.total ?? 0;
	const pagination = {
		...pageControls(receipts?.page ?? page, 20, total),
		currentPage: receipts?.page ?? page,
		setCurrentPage: setPage,
		resetPage: () => setPage(1),
		pageItems: receipts?.items ?? [],
	};

	const reversing =
		action?.kind === "reverse"
			? history.find((item) => item.id === action.id)
			: undefined;
	const undoTarget =
		reversing ?? (action?.kind === "reverseReceipt" ? selected : undefined);

	function openAction(next: Action) {
		setError("");
		dismissNotice();
		setAction(next);
	}

	async function commit(
		write: () => Promise<string>,
		message: string,
		recover?: (reason: unknown) => Promise<boolean>,
	) {
		if (saving.current) return;
		saving.current = true;
		setBusy(true);
		setError("");
		try {
			await write();
			setAction(null);
			showNotice(message);
			accountingChanged();
		} catch (reason) {
			if (await recover?.(reason)) return;
			setError(errorText(reason));
			// Sổ vừa đổi ở máy khác: tải lại phiên bản mới để lần lưu sau (hoặc mở lại) không bị từ chối tiếp.
			if (reason instanceof ApiError && reason.status === 409)
				accountingChanged();
		} finally {
			saving.current = false;
			setBusy(false);
		}
	}

	if (directory.error && !directory.data)
		return (
			<Notice tone="danger" announce>
				{directory.error}
			</Notice>
		);
	if (directory.loading && !directory.data)
		return (
			<p className="panel empty-state" role="status">
				Đang tải khách hàng…
			</p>
		);
	const allocatedAmount = selectedData.data?.allocated ?? 0;

	const remaining =
		selected && !selected.reversal ? selected.amount - allocatedAmount : 0;
	const closeAction = () => setAction(null);

	// Lưu lỗi (mất phản hồi, hoặc gửi lại sau khi đã sửa số liệu): khoản thu có thể đã được ghi ở
	// lần trước. Đọc lại theo mã yêu cầu để không bắt người dùng ghi trùng hay kẹt ở lỗi 409.
	async function recoverReceipt(customer: Customer, fields: ReceiptDraft) {
		const saved = fields.id ? await findReceipt(fields.id) : undefined;
		if (!saved) return false;
		setAction(null);
		accountingChanged();
		const same =
			saved.customerId === customer.id &&
			saved.amount === fields.amount &&
			saved.date === fields.date;
		if (same) showNotice("Đã ghi khoản thu.");
		else {
			setSelectedId(saved.id);
			showNotice(
				`Khoản thu ${saved.number} đã được ghi ở lần lưu trước: ${money.format(saved.amount)} đ, ngày ${formatDateOnly(saved.date)}, khách ${saved.customerName}. Kiểm tra lại; nếu sai, hủy khoản thu này rồi ghi khoản mới.`,
				15000,
				"warning",
			);
		}
		return true;
	}
	return (
		<div className="payment-page">
			<section className="panel import-strip" aria-label="Khoản thu khách hàng">
				<div className="import-icon">
					<ReceiptText />
				</div>
				<div>
					<h2>Khoản thu khách hàng</h2>
					<p>Ghi từ chứng từ thu và phân bổ theo hóa đơn đã đối chiếu.</p>
				</div>
				<button
					type="button"
					className="button primary"
					disabled={!customers.length}
					onClick={() => openAction({ kind: "create" })}
				>
					<Plus className="icon-size-16" /> Ghi khoản thu
				</button>
			</section>
			{notice && (
				<Notice tone={notice.tone} floating announce onDismiss={dismissNotice}>
					{notice.text}
				</Notice>
			)}
			{!customers.length && (
				<Notice tone="warning">
					Bổ sung khách hàng vào danh mục để ghi khoản thu.
				</Notice>
			)}
			{bookError && (
				<Notice tone="danger" title="Không thể đọc sổ bán hàng MISA">
					{bookError}
				</Notice>
			)}
			{book === null && (
				<Notice tone="info">
					Nhập sổ bán hàng để có chứng từ phân bổ.{" "}
					{onOpenMisa && (
						<button type="button" className="text-button" onClick={onOpenMisa}>
							Mở Dữ liệu MISA
						</button>
					)}
				</Notice>
			)}
			<section
				className="panel payment-panel"
				aria-label="Danh sách khoản thu"
				aria-busy={list.loading}
			>
				<div className="payment-toolbar">
					<label className="table-search">
						<Search className="icon-size-16" />
						<input
							type="search"
							aria-label="Tìm khoản thu"
							placeholder="Tìm chứng từ, khách hàng hoặc tham chiếu"
							value={query}
							onChange={(event) => {
								setQuery(event.target.value);
								pagination.resetPage();
							}}
						/>
					</label>
					<select
						aria-label="Trạng thái phân bổ"
						value={status}
						onChange={(event) => {
							setStatus(event.target.value);
							pagination.resetPage();
						}}
					>
						<option value="active">Khoản thu còn hiệu lực</option>
						<option value="open">Còn tiền phân bổ</option>
						<option value="closed">Đã phân bổ hết</option>
						<option value="reversed">{statuses.reversed.label}</option>
					</select>
				</div>
				<section
					className="table-scroll table-scroll-auto-gutter payment-receipts-table"
					// biome-ignore lint/a11y/noNoninteractiveTabindex: Bảng cuộn nhận focus để cuộn bằng bàn phím.
					tabIndex={0}
					aria-label="Vùng cuộn khoản thu"
				>
					<table aria-label="Danh sách khoản thu">
						<thead>
							<tr>
								<th scope="col" className="payment-receipt-number-column">
									Chứng từ thu
								</th>
								<th scope="col" className="payment-date-column">
									Ngày hạch toán
								</th>
								<th scope="col" className="payment-customer-column">
									Khách hàng
								</th>
								<th scope="col" className="payment-amount-column">
									Số tiền thu
								</th>
								<th scope="col" className="payment-amount-column">
									Chưa phân bổ
								</th>
								<th scope="col" className="payment-status-column">
									Trạng thái
								</th>
								<th scope="col" className="payment-action-column">
									Thao tác
								</th>
							</tr>
						</thead>
						<tbody>
							{pagination.pageItems.map(({ receipt, remaining, state }) => (
								<tr key={receipt.id}>
									<td>
										<button
											type="button"
											className="text-button payment-link"
											aria-haspopup="dialog"
											onClick={() => setSelectedId(receipt.id)}
										>
											{receipt.number}
										</button>
									</td>
									<td className="payment-date-column">
										{formatDateOnly(receipt.date)}
									</td>
									<td>
										<strong className="table-customer-name">
											{receipt.customerName}
										</strong>
										{receipt.customerCode && (
											<small className="cell-meta">
												{receipt.customerCode}
											</small>
										)}
									</td>
									<td className="payment-amount-column">
										{money.format(receipt.amount)}
									</td>
									<td className="payment-amount-column strong-number">
										{money.format(remaining)}
									</td>
									<td className="payment-status-column">
										<StatusPill tone={statuses[state].tone}>
											{statuses[state].label}
										</StatusPill>
									</td>
									<td className="payment-action-column">
										<button
											type="button"
											className="text-button payment-link"
											aria-label={`Xem chi tiết khoản thu ${receipt.number}`}
											aria-haspopup="dialog"
											onClick={() => setSelectedId(receipt.id)}
										>
											Xem chi tiết
										</button>
									</td>
								</tr>
							))}
							{!total && (
								<tr>
									<td colSpan={7}>
										{!receipts
											? "Đang tải khoản thu…"
											: receipts.count
												? "Không có khoản thu theo bộ lọc."
												: "Chưa ghi khoản thu nào."}
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</section>
				<footer className="payment-table-footer">
					<span>
						{pagination.firstVisible}–{pagination.lastVisible} / {total} khoản
						thu
					</span>
					<PaginationControls
						currentPage={pagination.currentPage}
						pageCount={pagination.pageCount}
						onPageChange={pagination.setCurrentPage}
						previousLabel="Trang khoản thu trước"
						nextLabel="Trang khoản thu sau"
					/>
				</footer>
			</section>
			{(list.error || selectedData.error || directory.error) && (
				<Notice tone="danger" announce>
					{list.error || selectedData.error || directory.error}
				</Notice>
			)}
			{(list.loading || selectedData.loading) && (
				<p role="status">Đang tải khoản thu…</p>
			)}
			{selected && (
				<Drawer
					ariaLabelledBy="receipt-detail-title"
					className="customer-drawer payment-detail-drawer"
					onClose={() => setSelectedId("")}
				>
					<header className="payment-detail-head">
						<div>
							<small>CHỨNG TỪ THU</small>
							<h2 id="receipt-detail-title">{selected.number}</h2>
						</div>
						<button
							type="button"
							className="drawer-close"
							aria-label="Đóng"
							onClick={() => setSelectedId("")}
						>
							<X className="icon-size-18" />
						</button>
					</header>
					<div className="payment-detail-body">
						<section
							className="panel payment-summary"
							aria-label="Thông tin khoản thu"
						>
							<strong>{selected.customerName}</strong>
							<span>
								{formatDateOnly(selected.date)}
								{selected.customerCode && ` · ${selected.customerCode}`}
							</span>
							{selected.reference && (
								<span>Tham chiếu {selected.reference}</span>
							)}
							<dl>
								<div>
									<dt>Tiền thu</dt>
									<dd>{money.format(selected.amount)} đ</dd>
								</div>
								<div>
									<dt>Đã phân bổ</dt>
									<dd>{money.format(allocatedAmount)} đ</dd>
								</div>
								<div>
									<dt>Chưa phân bổ</dt>
									<dd>{money.format(remaining)} đ</dd>
								</div>
							</dl>
						</section>
						{selected.reversal && (
							<Notice tone="info" title={statuses.reversed.label}>
								{formatDateOnly(selected.reversal.date)} ·{" "}
								{selected.reversal.reason}
							</Notice>
						)}
						{!selectedData.data?.hasInvoices && remaining > 0 && (
							<Notice tone="info">
								Chưa có chứng từ MISA phù hợp cho khoản thu này.
							</Notice>
						)}
						{allocatedInvoices.length > 0 && (
							<section
								className="payment-allocated-invoices"
								aria-labelledby="payment-allocated-invoices-title"
							>
								<h3 id="payment-allocated-invoices-title">
									Mặt hàng trong hóa đơn đã phân bổ
								</h3>
								{allocatedInvoices.map(({ invoice, lines }) => (
									<article
										key={invoice.id}
										className="panel payment-allocated-invoice"
									>
										<h4>
											{invoice.invoiceNumber
												? `HĐ ${[invoice.invoiceSeries, invoice.invoiceNumber].filter(Boolean).join(" ")} · ${invoice.documentNumber}`
												: `Chứng từ ${invoice.documentNumber}`}
										</h4>
										{lines?.length ? (
											<SalesInvoiceLinesTable
												lines={lines}
												label={`Mặt hàng trong chứng từ ${invoice.documentNumber}`}
											/>
										) : (
											<p>
												Không tìm được dòng hàng khớp trong sổ MISA hiện tại.
											</p>
										)}
									</article>
								))}
							</section>
						)}
						<section className="payment-history" aria-label="Lịch sử phân bổ">
							<h3>Lịch sử phân bổ</h3>
							{!history.length && <p>Chưa có phân bổ.</p>}
							{history.map((entry) => (
								<article key={entry.id} className="panel payment-history-entry">
									<div className="payment-history-head">
										<small>
											Hiệu lực {formatDateOnly(entry.date)} · Ghi{" "}
											{formatTimestamp(entry.createdAt)}
										</small>
										{entry.reversal ? (
											<StatusPill tone="neutral">Đã hoàn tác</StatusPill>
										) : (
											<button
												className="button secondary"
												type="button"
												onClick={() =>
													openAction({ kind: "reverse", id: entry.id })
												}
											>
												<Undo2 className="icon-size-16" /> Hoàn tác
											</button>
										)}
									</div>
									<ul>
										{entry.lines.map(({ invoice, amount }) => (
											<li key={invoice.id}>
												<span title={invoice.sourceFile}>
													{invoice.documentNumber}
													{invoice.invoiceNumber &&
														` · HĐ ${invoice.invoiceSeries} ${invoice.invoiceNumber}`}
												</span>
												<strong>{money.format(amount)} đ</strong>
											</li>
										))}
									</ul>
									{entry.reversal && (
										<p>
											Hoàn tác ngày {formatDateOnly(entry.reversal.date)} ·{" "}
											{entry.reversal.reason}
										</p>
									)}
								</article>
							))}
						</section>
					</div>
					<footer className="payment-detail-footer">
						{!selected.reversal && (
							<button
								type="button"
								className="button danger-outline"
								onClick={() => openAction({ kind: "reverseReceipt" })}
							>
								Hủy khoản thu
							</button>
						)}
						<button
							type="button"
							className="button primary"
							disabled={remaining <= 0 || !selectedData.data?.hasInvoices}
							onClick={() => openAction({ kind: "allocate" })}
						>
							<GitMerge className="icon-size-16" /> Phân bổ khoản thu
						</button>
					</footer>
				</Drawer>
			)}
			{action?.kind === "create" && (
				<ReceiptFormDialog
					customers={customers}
					busy={busy}
					error={error}
					onClose={closeAction}
					onSave={(customer, fields) =>
						void commit(
							() => saveReceipt(customer, fields),
							"Đã ghi khoản thu.",
							() => recoverReceipt(customer, fields),
						)
					}
				/>
			)}
			{action?.kind === "allocate" && selected && selectedData.data && (
				<ReceiptAllocationDialog
					receipt={selected}
					remaining={remaining}
					busy={busy}
					error={error}
					onClose={closeAction}
					onSave={(date, lines, advance) => {
						const detail = selectedData.data;
						if (detail)
							void commit(
								() =>
									saveAllocation(
										selected.id,
										date,
										lines,
										detail.revision,
										detail.bookStamp,
										advance,
									),
								"Đã lưu phân bổ.",
							);
					}}
				/>
			)}
			{undoTarget && (
				<ReceiptReversalDialog
					target={undoTarget}
					busy={busy}
					error={error}
					onClose={closeAction}
					onSave={(date, reason) => {
						// Hủy theo đúng phiên bản sổ đang xem: nếu người khác vừa phân bổ thêm thì máy chủ từ chối.
						const revision = selectedData.data?.revision;
						if (revision)
							void commit(
								() =>
									saveReversal(
										reversing ? "allocations" : "receipts",
										undoTarget.id,
										date,
										reason,
										revision,
									),
								reversing ? "Đã hoàn tác phân bổ." : "Đã hủy khoản thu.",
							);
					}}
				/>
			)}
		</div>
	);
}
