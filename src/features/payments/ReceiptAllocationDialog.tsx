import { GitMerge, Search, Undo2 } from "lucide-react";
import { useDeferredValue, useRef, useState } from "react";
import type {
	Receipt,
	ReceiptAllocation,
	ReceiptInvoice,
} from "../../domain/payments/receipt-ledger";
import type { ReceivableDocument } from "../../domain/payments/receipt-receivables";
import type {
	AllocationCandidate,
	CandidateMatches,
	CandidatePage,
} from "../../domain/reports/view-types";
import {
	pageControls,
	resourceWithQuery,
	useServerData,
} from "../../shared/hooks/useServerData";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";
import { formatDateOnly, todayLocal } from "../../shared/lib/date";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { Notice } from "../../shared/ui/Notice";
import { SalesInvoiceLinesDialog } from "../../shared/ui/SalesInvoiceLinesDialog";
import { parseVnd, VndAmountInput } from "../../shared/ui/VndAmountInput";

export const money = new Intl.NumberFormat("vi-VN");
const documentOrder = new Intl.Collator("vi-VN", { numeric: true });

function compareNewestInvoice(
	left: { invoice: ReceiptInvoice },
	right: { invoice: ReceiptInvoice },
) {
	return (
		right.invoice.date.localeCompare(left.invoice.date) ||
		documentOrder.compare(
			right.invoice.documentNumber,
			left.invoice.documentNumber,
		)
	);
}

interface DialogState {
	busy: boolean;
	error: string;
	onClose: () => void;
}

export function ReceiptAllocationDialog({
	receipt,
	remaining,
	busy,
	error,
	onClose,
	onSave,
}: DialogState & {
	receipt: Receipt;
	remaining: number;
	onSave: (
		date: string,
		lines: { invoice: ReceiptInvoice; amount: number }[],
		advance: boolean,
	) => void;
}) {
	const [date, setDate] = useState(todayLocal);
	// Mặc định chỉ chứng từ đến ngày thu; bật khi khách trả trước.
	const [advance, setAdvance] = useState(false);
	const isLater = (invoice: ReceiptInvoice) => invoice.date > receipt.date;
	const [query, setQuery] = useState("");
	const [amounts, setAmounts] = useState<Record<string, string>>({});
	const [verified, setVerified] = useState(false);
	const [showMatches, setShowMatches] = useState(false);
	const [groupIndex, setGroupIndex] = useState(0);
	const [nearGroupIndex, setNearGroupIndex] = useState(0);
	const [openedInvoiceId, setOpenedInvoiceId] = useState("");
	const invoiceScroll = useRef<HTMLElement>(null);
	const [page, setPage] = useState(1);
	const [chosen, setChosen] = useState<Record<string, AllocationCandidate>>({});
	const today = todayLocal();
	const validDate = date >= receipt.date && date <= today;
	const search = useDeferredValue(query);
	const base = `receipts/${encodeURIComponent(receipt.id)}/candidates`;
	const advanceQuery = advance ? "1" : undefined;
	const listing = useServerData<CandidatePage>(
		resourceWithQuery(base, { q: search, page, advance: advanceQuery }),
	);
	const visible = listing.data?.items ?? [];
	const totalRows = listing.data?.total ?? 0;
	const laterRows = listing.data?.later ?? 0;
	const pagination = pageControls(listing.data?.page ?? page, 20, totalRows);
	const matchResult = useServerData<CandidateMatches>(
		showMatches && validDate && remaining > 0
			? resourceWithQuery(`${base}/matches`, { date, advance: advanceQuery })
			: undefined,
	);
	const matches = matchResult.data;
	const detail = useServerData<
		Omit<ReceivableDocument, "balance"> & {
			balance: null | { received: number; remaining: number };
		}
	>(
		openedInvoiceId
			? `${base}/${encodeURIComponent(openedInvoiceId)}`
			: undefined,
	);
	const openedInvoice = detail.data;

	const matchIndex = Math.min(
		groupIndex,
		Math.max(0, (matches?.matches.length ?? 0) - 1),
	);
	const activeGroup = matches?.matches[matchIndex];
	const nearMatches = activeGroup ? [] : (matches?.nearMatches ?? []);
	const nearIndex = Math.min(
		nearGroupIndex,
		Math.max(0, nearMatches.length - 1),
	);
	const nearGroup = nearMatches[nearIndex];
	const nearDifference = (difference: number) =>
		`${difference > 0 ? "Dư" : "Thiếu"} ${money.format(Math.abs(difference))}`;
	const selected = Object.values(chosen)
		.filter(({ invoice }) => amounts[invoice.id]?.trim())
		.map(({ invoice, changed, remaining }) => ({
			invoice,
			changed,
			remaining,
			amount: parseVnd(amounts[invoice.id]),
		}));
	const total = selected.reduce((sum, row) => sum + row.amount, 0);
	const invalid = selected.some(
		(row) =>
			row.changed ||
			!Number.isSafeInteger(row.amount) ||
			row.amount <= 0 ||
			row.amount > row.remaining ||
			row.invoice.date > date ||
			(!advance && isLater(row.invoice)),
	);
	const canSave =
		verified &&
		!invalid &&
		Number.isSafeInteger(total) &&
		total > 0 &&
		total <= remaining &&
		validDate;

	function fillAllocation(
		items: (AllocationCandidate & { amount: number })[],
		searchText = "",
	) {
		setAmounts(
			Object.fromEntries(
				items.map(({ invoice, amount }) => [invoice.id, String(amount)]),
			),
		);
		setChosen(Object.fromEntries(items.map((item) => [item.invoice.id, item])));
		setQuery(searchText);
		setPage(1);
		setVerified(false);
		if (invoiceScroll.current) invoiceScroll.current.scrollTop = 0;
	}

	function renderLinesButton(
		invoice: ReceiptInvoice,
		kind: "document" | "invoice",
	) {
		const label =
			kind === "document"
				? invoice.documentNumber
				: `${invoice.invoiceSeries} ${invoice.invoiceNumber}`.trim();
		return (
			<button
				type="button"
				className="text-button payment-document-link"
				aria-haspopup="dialog"
				aria-label={`Xem dòng hàng ${kind === "document" ? "chứng từ" : "hóa đơn"} ${label}`}
				onClick={() => setOpenedInvoiceId(invoice.id)}
				disabled={busy}
			>
				{label}
			</button>
		);
	}

	const allocationDialog = (
		<Dialog
			ariaLabelledBy="receipt-allocation-title"
			eyebrow="ĐỐI SOÁT KHOẢN THU"
			title={`Phân bổ ${receipt.number}`}
			icon={<GitMerge className="icon-size-19" />}
			className="payment-allocation-dialog"
			disableClose={busy}
			onClose={onClose}
			onSubmit={(event) => {
				event.preventDefault();
				if (canSave && !busy)
					onSave(
						date,
						selected.map(({ invoice, amount }) => ({ invoice, amount })),
						advance,
					);
			}}
			footer={
				<>
					<label className="payment-verify">
						<input
							type="checkbox"
							checked={verified}
							onChange={(event) => setVerified(event.target.checked)}
							disabled={busy}
						/>
						Đã đối chiếu số phải thu của các chứng từ được chọn với MISA.
					</label>
					<div className="payment-allocation-actions">
						<span className="payment-total">
							Phân bổ{" "}
							<strong>{Number.isNaN(total) ? "—" : money.format(total)}</strong>{" "}
							/ {money.format(remaining)}
						</span>
						<button
							className="button secondary"
							type="button"
							onClick={onClose}
							disabled={busy}
						>
							Hủy
						</button>
						<button
							className="button primary"
							type="submit"
							disabled={!canSave || busy}
						>
							{busy ? "Đang lưu…" : "Xác nhận phân bổ"}
						</button>
					</div>
				</>
			}
		>
			<div className="dialog-body payment-allocation-body">
				<p>
					<strong>{receipt.customerName}</strong> · Còn phân bổ{" "}
					{money.format(remaining)}
				</p>
				{(error || listing.error || matchResult.error || detail.error) && (
					<Notice tone="danger" announce>
						{error || listing.error || matchResult.error || detail.error}
					</Notice>
				)}
				{!listing.loading && !totalRows && !query && !laterRows && (
					<Notice tone="info">
						Chưa có chứng từ phù hợp theo mã khách hàng trong sổ bán hàng MISA.
					</Notice>
				)}
				<div className="payment-toolbar payment-allocation-tools">
					{/* Chỉ để xem: mốc chặn chứng từ sau ngày thu, không sửa ở đây. */}
					<label className="ui-field payment-date" htmlFor="receipt-date">
						<span className="ui-field-label">Ngày thu</span>
						<DateInput
							id="receipt-date"
							ariaLabel="Ngày thu"
							value={receipt.date}
							onChange={() => {}}
							disabled
						/>
					</label>
					<label
						className="ui-field payment-date"
						htmlFor="receipt-allocation-date"
					>
						<span className="ui-field-label">Ngày phân bổ</span>
						<DateInput
							id="receipt-allocation-date"
							ariaLabel="Ngày phân bổ"
							value={date}
							onChange={(value) => {
								setDate(value);
								setVerified(false);
								setGroupIndex(0);
								setNearGroupIndex(0);
							}}
							disabled={busy}
						/>
					</label>
					<label className="ui-field payment-document-search">
						<span className="ui-field-label">Tìm chứng từ</span>
						<span className="table-search">
							<Search className="icon-size-16" aria-hidden="true" />
							<input
								type="search"
								aria-label="Tìm hóa đơn hoặc chứng từ"
								placeholder="Số hóa đơn hoặc chứng từ"
								value={query}
								onChange={(event) => {
									setQuery(event.target.value);
									setPage(1);
									if (invoiceScroll.current)
										invoiceScroll.current.scrollTop = 0;
								}}
							/>
						</span>
					</label>
					<button
						className="button secondary"
						type="button"
						aria-expanded={showMatches}
						aria-controls={showMatches ? "receipt-matches" : undefined}
						onClick={() => setShowMatches(!showMatches)}
						disabled={busy || !validDate || remaining <= 0}
					>
						{showMatches ? "Ẩn gợi ý" : "Gợi ý theo số tiền"}
					</button>
				</div>
				<div className="payment-advance">
					<label className="payment-verify">
						<input
							type="checkbox"
							checked={advance}
							onChange={(event) => {
								const next = event.target.checked;
								setAdvance(next);
								setPage(1);
								setGroupIndex(0);
								setNearGroupIndex(0);
								setVerified(false);
								if (!next) {
									// Tắt trả trước: bỏ số đã nhập cho chứng từ sau ngày thu.
									const later = Object.values(chosen)
										.filter(({ invoice }) => isLater(invoice))
										.map(({ invoice }) => invoice.id);
									setChosen((current) =>
										Object.fromEntries(
											Object.entries(current).filter(
												([id]) => !later.includes(id),
											),
										),
									);
									setAmounts((current) =>
										Object.fromEntries(
											Object.entries(current).filter(
												([id]) => !later.includes(id),
											),
										),
									);
								}
							}}
							disabled={busy}
						/>
						Khách trả trước: gồm cả chứng từ sau ngày thu{" "}
						{formatDateOnly(receipt.date)}
						{laterRows > 0 && ` (${laterRows} chứng từ)`}
					</label>
				</div>
				{advance ? (
					<Notice tone="warning">
						Đang gồm cả chứng từ ghi sổ sau ngày thu (
						{formatDateOnly(receipt.date)}). Chỉ phân bổ vào các chứng từ này
						khi khách thực sự trả trước cho hóa đơn xuất sau.
					</Notice>
				) : (
					!listing.loading &&
					!totalRows &&
					!query &&
					laterRows > 0 && (
						<Notice tone="info">
							Không có chứng từ còn nợ đến ngày thu{" "}
							{formatDateOnly(receipt.date)}. Có {laterRows} chứng từ sau ngày
							thu; chỉ chọn khi khách trả trước.
						</Notice>
					)
				)}
				{showMatches && (
					<section
						id="receipt-matches"
						className="payment-match-results"
						aria-label="Gợi ý phân bổ theo số tiền"
						aria-live="polite"
					>
						{matchResult.loading ? (
							<p role="status">Đang tìm chứng từ…</p>
						) : !matches ? (
							<Notice tone="info">
								Chọn ngày phân bổ hợp lệ để xem gợi ý.
							</Notice>
						) : matches.unavailable ? (
							<Notice tone="warning">
								Ngày đã chọn chưa có đủ số dư để phân bổ hết khoản thu. Kiểm tra
								lịch sử hoặc chọn ngày khác.
							</Notice>
						) : activeGroup ? (
							<div className="panel payment-match-panel">
								<div className="payment-match-head">
									{matches.matches.length > 1 && (
										<select
											aria-label="Chọn nhóm chứng từ"
											value={matchIndex}
											onChange={(event) =>
												setGroupIndex(Number(event.target.value))
											}
											disabled={busy}
										>
											{matches.matches.map((group, index) => (
												<option
													key={JSON.stringify(
														group.map(({ invoice }) => invoice.id),
													)}
													value={index}
												>
													Nhóm {index + 1} · {group.length} chứng từ
												</option>
											))}
										</select>
									)}
									<strong>Khớp đúng {money.format(remaining)}</strong>
									<button
										className="button secondary"
										type="button"
										disabled={busy}
										aria-label={`${selected.length ? "Thay số đã nhập bằng" : "Điền"} nhóm ${matchIndex + 1}`}
										onClick={() =>
											fillAllocation(
												activeGroup.map((item) => ({
													...item,
													amount: item.remaining,
												})),
											)
										}
									>
										{selected.length ? "Thay số đã nhập" : "Điền nhóm"}
									</button>
								</div>
								<section
									className="table-scroll table-compact table-scroll-auto-gutter payment-match-table"
									aria-label="Vùng cuộn nhóm gợi ý"
									// biome-ignore lint/a11y/noNoninteractiveTabindex: Cho phép cuộn bảng dài bằng bàn phím.
									tabIndex={0}
								>
									<table aria-label="Chứng từ trong nhóm gợi ý">
										<thead>
											<tr>
												<th scope="col">Chứng từ</th>
												<th scope="col">Số hóa đơn</th>
												<th scope="col">Ngày ghi sổ</th>
												<th scope="col">Số tiền khớp</th>
											</tr>
										</thead>
										<tbody>
											{[...activeGroup]
												.sort(compareNewestInvoice)
												.map(({ invoice, remaining }) => (
													<tr key={invoice.id}>
														<td>{renderLinesButton(invoice, "document")}</td>
														<td>
															{invoice.invoiceNumber
																? renderLinesButton(invoice, "invoice")
																: invoice.invoiceSeries || "—"}
														</td>
														<td>{formatDateOnly(invoice.date)}</td>
														<td>{money.format(remaining)}</td>
													</tr>
												))}
										</tbody>
									</table>
								</section>
							</div>
						) : (
							!nearMatches.length && (
								<Notice tone="info">
									{matches.incomplete
										? "Chưa tìm thấy chứng từ phù hợp trong phạm vi tìm kiếm."
										: "Không có chứng từ khớp đúng hoặc chênh lệch trong 5% số tiền còn phân bổ."}
								</Notice>
							)
						)}
						{!matchResult.loading && nearGroup && (
							<div className="panel payment-match-panel">
								<div className="payment-match-head payment-near-match-head">
									<strong>
										Gần khớp · {nearGroup.lines.length} chứng từ
										<span className="cell-meta">
											Tổng còn phải thu{" "}
											{money.format(remaining - nearGroup.difference)}
											{nearMatches.length === 1 &&
												` · ${nearDifference(nearGroup.difference)}`}
										</span>
									</strong>
									{nearMatches.length > 1 && (
										<select
											aria-label="Chọn gợi ý gần khớp"
											value={nearIndex}
											disabled={busy}
											onChange={(event) =>
												setNearGroupIndex(Number(event.target.value))
											}
										>
											{nearMatches.map(({ difference, lines }, index) => (
												<option
													key={JSON.stringify(
														lines.map(({ invoice }) => invoice.id),
													)}
													value={index}
												>
													{index + 1}. {lines.length} chứng từ ·{" "}
													{nearDifference(difference)}
												</option>
											))}
										</select>
									)}
									<button
										className="button secondary"
										type="button"
										disabled={busy}
										aria-label={
											selected.length
												? "Thay số đã nhập bằng gợi ý gần khớp"
												: "Điền gợi ý gần khớp"
										}
										onClick={() => {
											const invoice =
												nearGroup.lines.length === 1
													? nearGroup.lines[0].invoice
													: undefined;
											fillAllocation(
												nearGroup.lines,
												invoice?.documentNumber || invoice?.invoiceNumber,
											);
										}}
									>
										{selected.length ? "Thay số đã nhập" : "Điền nhóm"}
									</button>
								</div>
								<section
									className="table-scroll table-compact table-scroll-auto-gutter payment-match-table payment-near-match-table"
									aria-label="Vùng cuộn nhóm gần khớp"
									// biome-ignore lint/a11y/noNoninteractiveTabindex: Cho phép cuộn bảng dài bằng bàn phím.
									tabIndex={0}
								>
									<table aria-label="Chứng từ gần khớp số tiền">
										<thead>
											<tr>
												<th scope="col">Chứng từ</th>
												<th scope="col">Số hóa đơn</th>
												<th scope="col">Còn phải thu</th>
												<th scope="col">Số tiền phân bổ</th>
											</tr>
										</thead>
										<tbody>
											{[...nearGroup.lines]
												.sort(compareNewestInvoice)
												.map(({ invoice, remaining, amount }) => (
													<tr key={invoice.id}>
														<td>{renderLinesButton(invoice, "document")}</td>
														<td>
															{invoice.invoiceNumber
																? renderLinesButton(invoice, "invoice")
																: "—"}
														</td>
														<td>{money.format(remaining)}</td>
														<td>{money.format(amount)}</td>
													</tr>
												))}
										</tbody>
									</table>
								</section>
							</div>
						)}
					</section>
				)}
				<section
					ref={invoiceScroll}
					className="table-scroll table-scroll-auto-gutter payment-invoice-table table-editable"
					aria-label="Vùng cuộn chứng từ phân bổ"
					// biome-ignore lint/a11y/noNoninteractiveTabindex: Cho phép cuộn bảng bằng bàn phím.
					tabIndex={0}
				>
					<table aria-label="Chứng từ có thể phân bổ">
						<thead>
							<tr>
								<th scope="col">Chứng từ</th>
								<th scope="col">Số hóa đơn</th>
								<th scope="col">Ngày ghi sổ</th>
								<th scope="col" className="payment-amount-column">
									Giá trị
								</th>
								<th scope="col" className="payment-amount-column">
									Còn lại trong app
								</th>
								<th scope="col" className="payment-amount-column">
									Phân bổ
								</th>
							</tr>
						</thead>
						<tbody>
							{visible.map((item) => {
								const { invoice, remaining, changed, suggested } = item;
								return (
									<tr key={invoice.id}>
										<td>
											{renderLinesButton(invoice, "document")}
											{suggested && (
												<small className="cell-meta">Khớp tham chiếu</small>
											)}
											{isLater(invoice) && (
												<small className="cell-meta">Sau ngày thu</small>
											)}
										</td>
										<td>
											{invoice.invoiceNumber
												? renderLinesButton(invoice, "invoice")
												: "—"}
										</td>
										<td>{formatDateOnly(invoice.date)}</td>
										<td>{money.format(invoice.amount)}</td>
										<td>
											{changed ? "Nguồn đã thay đổi" : money.format(remaining)}
										</td>
										<td>
											<VndAmountInput
												aria-label={`Số tiền phân bổ ${invoice.documentNumber}`}
												className="payment-amount"
												placeholder="0"
												disabled={busy || changed}
												aria-invalid={
													Boolean(amounts[invoice.id]?.trim()) &&
													(!Number.isSafeInteger(
														parseVnd(amounts[invoice.id]),
													) ||
														parseVnd(amounts[invoice.id]) <= 0 ||
														parseVnd(amounts[invoice.id]) > remaining ||
														invoice.date > date ||
														(!advance && isLater(invoice)))
												}
												value={amounts[invoice.id] ?? ""}
												onValueChange={(value) => {
													setAmounts((current) => ({
														...current,
														[invoice.id]: value,
													}));
													setChosen((current) => ({
														...current,
														[invoice.id]: item,
													}));
													setVerified(false);
												}}
											/>
										</td>
									</tr>
								);
							})}

							{!visible.length && !listing.loading && (
								<tr>
									<td colSpan={6}>Không có chứng từ còn mở theo bộ lọc.</td>
								</tr>
							)}
						</tbody>
					</table>
				</section>
				{(listing.loading || detail.loading) && (
					<p role="status">Đang tải chứng từ…</p>
				)}
				<PaginationControls
					currentPage={listing.data?.page ?? page}
					pageCount={pagination.pageCount}
					onPageChange={setPage}
					previousLabel="Trang chứng từ trước"
					nextLabel="Trang chứng từ sau"
				/>
				{selected.length > 0 &&
					!canSave &&
					(invalid ||
						total > remaining ||
						date < receipt.date ||
						date > todayLocal()) && (
						<Notice tone="warning">
							Kiểm tra số tiền từng dòng, số dư khoản thu và ngày hiệu lực trước
							khi lưu.
						</Notice>
					)}
			</div>
		</Dialog>
	);

	return (
		<>
			{allocationDialog}
			{openedInvoice && (
				<SalesInvoiceLinesDialog
					document={openedInvoice}
					customerName={receipt.customerName}
					backLabel="Quay lại phân bổ"
					onClose={() => setOpenedInvoiceId("")}
				/>
			)}
		</>
	);
}

export function ReceiptReversalDialog({
	target,
	busy,
	error,
	onClose,
	onSave,
}: DialogState & {
	target: ReceiptAllocation | Receipt;
	onSave: (date: string, reason: string) => void;
}) {
	const [date, setDate] = useState(todayLocal);
	const [reason, setReason] = useState("");
	const allocation = "lines" in target ? target : undefined;
	const total =
		allocation?.lines.reduce((sum, line) => sum + line.amount, 0) ?? 0;
	const dateLabel = allocation ? "Ngày hoàn tác" : "Ngày hủy khoản thu";
	const canSave =
		!busy &&
		Boolean(reason.trim()) &&
		date >= target.date &&
		date <= todayLocal();
	return (
		<Dialog
			ariaLabelledBy="receipt-reversal-title"
			eyebrow="ĐỐI SOÁT KHOẢN THU"
			title={allocation ? "Hoàn tác phân bổ" : "Hủy khoản thu"}
			icon={<Undo2 className="icon-size-19" />}
			tone="warning"
			disableClose={busy}
			onClose={onClose}
			onSubmit={(event) => {
				event.preventDefault();
				if (canSave) onSave(date, reason);
			}}
			footer={
				<>
					<button
						type="button"
						className="button secondary"
						onClick={onClose}
						disabled={busy}
					>
						{allocation ? "Hủy" : "Quay lại"}
					</button>
					<button type="submit" className="button warning" disabled={!canSave}>
						{allocation ? "Xác nhận hoàn tác" : "Xác nhận hủy khoản thu"}
					</button>
				</>
			}
		>
			<div className="dialog-body payment-dialog-content">
				<Notice tone="warning">
					{allocation
						? `Hoàn tác sẽ trả ${money.format(total)} về khoản thu và mở lại số tương ứng của ${allocation.lines.length} chứng từ.`
						: "Hủy khoản thu sẽ hoàn tác mọi phân bổ còn hiệu lực của khoản thu này."}{" "}
					Chứng từ và phân bổ gốc được lưu trong lịch sử.
				</Notice>
				{error && (
					<Notice tone="danger" announce>
						{error}
					</Notice>
				)}
				<label
					className="ui-field payment-date"
					htmlFor="receipt-reversal-date"
				>
					{dateLabel}
					<DateInput
						id="receipt-reversal-date"
						ariaLabel={dateLabel}
						value={date}
						onChange={setDate}
						disabled={busy}
					/>
				</label>
				<label className="ui-field">
					Lý do
					<input
						required
						value={reason}
						onChange={(event) => setReason(event.target.value)}
						disabled={busy}
					/>
				</label>
			</div>
		</Dialog>
	);
}
