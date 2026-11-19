import { GitMerge, Plus, ReceiptText, Search, Undo2, X } from "lucide-react";
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { normalizeVietnamese } from "../../domain/customers/customer.province";
import { readCustomers } from "../../domain/customers/customer.repository";
import type { MisaSalesBook } from "../../domain/misa/misa.sales-book";
import { readMisaSalesBook } from "../../domain/misa/misa.sales-book.repository";
import {
	allocateReceipt,
	getReceiptInvoiceSources,
	getReceiptInvoices,
	type ReceiptLedger,
	recordReceipt,
	reverseAllocation,
	reverseReceipt,
	sameInvoice,
	totalsByReceipt,
} from "../../domain/payments/receipt-ledger";
import {
	readReceiptLedger,
	saveReceiptLedger,
	subscribeReceiptLedger,
} from "../../domain/payments/receipt-ledger.repository";
import { usePagination } from "../../shared/hooks/usePagination";
import { useTransientNotice } from "../../shared/hooks/useTransientNotice";
import { formatDateOnly, formatTimestamp } from "../../shared/lib/date";
import { captureActivity } from "../../shared/storage/activityLog";
import { Drawer } from "../../shared/ui/Dialog/Drawer";
import { Notice } from "../../shared/ui/Notice";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";
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

const statuses = {
	reversed: { tone: "neutral", label: "Đã hủy khoản thu" },
	closed: { tone: "success", label: "Đã phân bổ hết" },
	partial: { tone: "info", label: "Phân bổ một phần" },
	open: { tone: "neutral", label: "Chưa phân bổ" },
} as const;

const errorText = (reason: unknown) =>
	reason instanceof Error ? reason.message : "Không thể hoàn tất thao tác.";

export function PaymentsPage({ onOpenMisa }: { onOpenMisa?: () => void }) {
	const [customers] = useState(readCustomers);
	const [ledger, setLedger] = useState<ReceiptLedger>();
	const [book, setBook] = useState<MisaSalesBook | null>();
	const [loadError, setLoadError] = useState("");
	const [bookError, setBookError] = useState("");
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
	const ledgerRequest = useRef(0);

	const refreshLedger = useCallback(() => {
		if (saving.current) return;
		const request = ++ledgerRequest.current;
		readReceiptLedger()
			.then((result) => {
				if (request !== ledgerRequest.current) return;
				setLedger(result);
				setLoadError("");
			})
			.catch((reason) => {
				if (request === ledgerRequest.current) setLoadError(errorText(reason));
			});
	}, []);

	useEffect(() => {
		const unsubscribe = subscribeReceiptLedger(refreshLedger);
		window.addEventListener("focus", refreshLedger);
		refreshLedger();
		return () => {
			++ledgerRequest.current;
			unsubscribe();
			window.removeEventListener("focus", refreshLedger);
		};
	}, [refreshLedger]);

	useEffect(() => {
		let active = true;
		readMisaSalesBook()
			.then((result) => {
				if (active) setBook(result);
			})
			.catch((reason) => {
				if (active) setBookError(errorText(reason));
			});
		return () => {
			active = false;
		};
	}, []);

	const allocated = useMemo(
		() => (ledger ? totalsByReceipt(ledger) : new Map<string, number>()),
		[ledger],
	);
	const rows = useMemo(() => {
		if (!ledger) return [];
		const needle = normalizeVietnamese(searchQuery);
		return [...ledger.receipts]
			.sort(
				(left, right) =>
					right.date.localeCompare(left.date) ||
					right.createdAt.localeCompare(left.createdAt),
			)
			.map((receipt) => {
				const remaining = receipt.reversal
					? 0
					: receipt.amount - (allocated.get(receipt.id) ?? 0);
				const state: keyof typeof statuses = receipt.reversal
					? "reversed"
					: remaining === 0
						? "closed"
						: remaining === receipt.amount
							? "open"
							: "partial";
				return { receipt, remaining, state };
			})
			.filter(
				({ receipt, remaining, state }) =>
					(status === "active"
						? state !== "reversed"
						: status === "open"
							? remaining > 0
							: status === state) &&
					normalizeVietnamese(
						`${receipt.number} ${receipt.customerName} ${receipt.customerCode} ${receipt.reference}`,
					).includes(needle),
			);
	}, [ledger, allocated, searchQuery, status]);
	const pagination = usePagination(rows);
	const selected = ledger?.receipts.find(
		(receipt) => receipt.id === selectedId,
	);
	const invoiceSources = useMemo(
		() =>
			selected && book
				? getReceiptInvoiceSources(book, selected, customers)
				: [],
		[book, selected, customers],
	);
	const history =
		ledger?.allocations
			.filter((item) => item.receiptId === selectedId)
			.slice()
			.reverse() ?? [];
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
		update: (
			current: ReceiptLedger,
			latestBook: MisaSalesBook | null,
		) => ReceiptLedger,
		message: string,
		{ requireBook = false, detail = "" } = {},
	) {
		if (saving.current) return;
		const log = captureActivity();
		saving.current = true;
		++ledgerRequest.current;
		setBusy(true);
		setError("");
		try {
			const current = await readReceiptLedger();
			setLedger(current);
			const latestBook = requireBook ? await readMisaSalesBook() : null;
			if (
				requireBook &&
				(!latestBook || latestBook.importedAt !== book?.importedAt)
			) {
				setBook(latestBook);
				throw new Error(
					"Sổ bán hàng MISA đã thay đổi. Hãy mở lại cửa sổ phân bổ để kiểm tra chứng từ.",
				);
			}
			const saved = await saveReceiptLedger(
				update(current, latestBook),
				latestBook?.importedAt,
			);
			const receipt =
				action?.kind === "create" ? saved.receipts.at(-1) : selected;
			void log(
				"payments",
				message.replace(/\.$/, ""),
				[receipt?.number, receipt?.customerName, detail]
					.filter(Boolean)
					.join(" · "),
			);
			setLedger(saved);
			setAction(null);
			showNotice(message);
		} catch (reason) {
			setError(errorText(reason));
		} finally {
			saving.current = false;
			setBusy(false);
			refreshLedger();
		}
	}

	if (!ledger && loadError)
		return (
			<Notice tone="danger" title="Không thể mở sổ đối soát" announce>
				{loadError}
			</Notice>
		);
	if (!ledger)
		return (
			<p role="status" className="panel empty-state">
				Đang đọc sổ đối soát…
			</p>
		);

	const allocatedAmount = allocated.get(selectedId) ?? 0;
	const remaining =
		selected && !selected.reversal ? selected.amount - allocatedAmount : 0;
	const closeAction = () => setAction(null);
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
			<section className="panel payment-panel" aria-label="Danh sách khoản thu">
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
								</tr>
							))}
							{!rows.length && (
								<tr>
									<td colSpan={6}>
										{ledger.receipts.length
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
						{pagination.firstVisible}–{pagination.lastVisible} / {rows.length}{" "}
						khoản thu
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
			{selected && (
				<Drawer
					ariaLabelledBy="receipt-detail-title"
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
						{!invoiceSources.length && remaining > 0 && (
							<Notice tone="info">
								Chưa có chứng từ MISA phù hợp cho khoản thu này.
							</Notice>
						)}
						<section className="payment-history" aria-label="Lịch sử phân bổ">
							<h3>Lịch sử phân bổ</h3>
							{!history.length && <p>Chưa có phân bổ.</p>}
							{history.map((entry) => (
								<article key={entry.id} className="panel payment-history-entry">
									<div className="payment-history-head">
										<div>
											<strong>
												{money.format(
													entry.lines.reduce(
														(sum, line) => sum + line.amount,
														0,
													),
												)}{" "}
												đ
											</strong>
											<small>
												Hiệu lực {formatDateOnly(entry.date)} · Ghi{" "}
												{formatTimestamp(entry.createdAt)}
											</small>
										</div>
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
							disabled={remaining <= 0 || !invoiceSources.length}
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
					receipts={ledger.receipts}
					busy={busy}
					error={error}
					onClose={closeAction}
					onSave={(customer, fields) =>
						void commit((current) => {
							const latest = readCustomers().find(
								(item) => item.id === customer.id,
							);
							if (!latest || latest.misaCode !== customer.misaCode)
								throw new Error(
									"Khách hàng đã thay đổi. Mở lại màn Đối soát để cập nhật danh mục.",
								);
							return recordReceipt(current, latest, fields);
						}, "Đã ghi khoản thu.")
					}
				/>
			)}
			{action?.kind === "allocate" && selected && (
				<ReceiptAllocationDialog
					key={book?.importedAt}
					receipt={selected}
					invoiceSources={invoiceSources}
					ledger={ledger}
					busy={busy}
					error={error}
					onClose={closeAction}
					onSave={(date, lines) =>
						void commit(
							(current, latestBook) => {
								const receipt = current.receipts.find(
									(item) => item.id === selected.id,
								);
								const candidates =
									latestBook && receipt
										? getReceiptInvoices(latestBook, receipt, readCustomers())
										: [];
								if (
									lines.some(
										({ invoice }) =>
											!candidates.some((candidate) =>
												sameInvoice(invoice, candidate),
											),
									)
								)
									throw new Error(
										"Chứng từ hoặc mã khách hàng đã thay đổi. Kiểm tra lại danh mục và sổ MISA.",
									);
								return allocateReceipt(current, selected.id, date, lines);
							},
							"Đã lưu phân bổ.",
							{
								requireBook: true,
								detail: `${lines.length} chứng từ · ${formatDateOnly(date)}`,
							},
						)
					}
				/>
			)}
			{undoTarget && (
				<ReceiptReversalDialog
					target={undoTarget}
					busy={busy}
					error={error}
					onClose={closeAction}
					onSave={(date, reason) =>
						void commit(
							(current) =>
								reversing
									? reverseAllocation(current, reversing.id, date, reason)
									: reverseReceipt(current, undoTarget.id, date, reason),
							reversing ? "Đã hoàn tác phân bổ." : "Đã hủy khoản thu.",
							{ detail: `${formatDateOnly(date)} · ${reason.trim()}` },
						)
					}
				/>
			)}
		</div>
	);
}
