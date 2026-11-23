import {
	CalendarCheck,
	FileSpreadsheet,
	Landmark,
	Trash2,
	Upload,
} from "lucide-react";
import { type ChangeEvent, useId, useRef, useState } from "react";
import type { OpeningBalanceSource } from "../../domain/misa/opening-balances";
import {
	confirmOpeningBalances,
	type OpeningBalanceReview,
	type OpeningBalanceStatus,
	openingBalancesResource,
	previewOpeningBalances,
	removeOpeningBalances,
	saveOpeningBalanceDate,
} from "../../domain/misa/opening-balances.repository";
import {
	accountingChanged,
	useServerData,
} from "../../shared/hooks/useServerData";
import {
	formatDateOnly,
	formatTimestamp,
	todayLocal,
} from "../../shared/lib/date";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { Notice } from "../../shared/ui/Notice";
import { parseOpeningBalanceWorkbook } from "./opening-balance.import";

const number = new Intl.NumberFormat("vi-VN");
const message = (reason: unknown) =>
	reason instanceof Error ? reason.message : "Không thể xử lý số dư đầu kỳ.";

/** Số dư công nợ MISA tại ngày chốt chuyển sổ: xem, nhập từ báo cáo 131 và xóa. */
export function OpeningBalanceSection({
	disabled = false,
}: {
	disabled?: boolean;
}) {
	const input = useRef<HTMLInputElement>(null);
	const response = useServerData<OpeningBalanceStatus | null>(
		openingBalancesResource,
	);
	const status = response.data;
	const [source, setSource] = useState<OpeningBalanceSource>();
	const [review, setReview] = useState<OpeningBalanceReview>();
	const [pending, setPending] = useState<"parse" | "review" | "save">();
	const [removing, setRemoving] = useState(false);
	/** Ngày đang chọn trong hộp "Đặt ngày chốt" (undefined là hộp đang đóng). */
	const [cutoff, setCutoff] = useState<string>();
	const cutoffField = useId();
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const busy = pending !== undefined || disabled;

	async function load(next: OpeningBalanceSource) {
		setSource(next);
		setReview(undefined);
		if (!next.date) return;
		setPending("review");
		setError("");
		try {
			setReview(await previewOpeningBalances(next));
		} catch (reason) {
			setError(message(reason));
		} finally {
			setPending(undefined);
		}
	}

	async function handleFile(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file || busy) return;
		setError("");
		setSuccess("");
		setPending("parse");
		let parsed: OpeningBalanceSource;
		try {
			parsed = await parseOpeningBalanceWorkbook(file);
		} catch (reason) {
			setError(message(reason));
			setPending(undefined);
			return;
		}
		setPending(undefined);
		await load(parsed);
	}

	async function confirm() {
		if (!source || !review || review.issues.length || busy) return;
		setPending("save");
		setError("");
		try {
			const saved = await confirmOpeningBalances(source, review.token);
			setSuccess(
				`Đã nhập số dư đầu kỳ ngày ${formatDateOnly(saved.date)} cho ${number.format(saved.customerCount)} khách hàng.`,
			);
			setSource(undefined);
			setReview(undefined);
			accountingChanged();
		} catch (reason) {
			setError(message(reason));
			const next = await previewOpeningBalances(source).catch(() => undefined);
			if (next) setReview(next);
		} finally {
			setPending(undefined);
		}
	}

	async function remove() {
		if (!status || busy) return;
		setPending("save");
		setError("");
		try {
			await removeOpeningBalances(status.importedAt);
			setSuccess("Đã xóa số dư đầu kỳ.");
			setRemoving(false);
			accountingChanged();
		} catch (reason) {
			setError(message(reason));
		} finally {
			setPending(undefined);
		}
	}

	async function saveCutoff() {
		if (!cutoff || busy) return;
		setPending("save");
		setError("");
		try {
			const saved = await saveOpeningBalanceDate(
				cutoff,
				status?.importedAt ?? null,
			);
			setSuccess(
				`Đã đặt ngày chốt số dư đầu kỳ ${formatDateOnly(saved.date)}. Nhân viên điền số dư từng khách ở màn Công nợ phải thu.`,
			);
			setCutoff(undefined);
			accountingChanged();
		} catch (reason) {
			setError(message(reason));
		} finally {
			setPending(undefined);
		}
	}

	function close() {
		setSource(undefined);
		setReview(undefined);
		setRemoving(false);
		setCutoff(undefined);
		setError("");
	}

	return (
		<>
			<section className="panel data-source-card">
				<div className="data-source-icon">
					<Landmark className="icon-size-22" />
				</div>
				<div className="data-source-copy">
					<h2>Số dư đầu kỳ</h2>
					{status ? (
						<p>
							Ngày chốt <strong>{formatDateOnly(status.date)}</strong> ·{" "}
							{number.format(status.customerCount)} khách hàng · Dư Nợ{" "}
							{number.format(status.debitTotal)} đ · Dư Có{" "}
							{number.format(status.creditTotal)} đ
							{status.manualCount > 0 &&
								` · ${number.format(status.manualCount)} khách nhập tay`}
							{status.fileName && (
								<>
									{" "}
									· <strong>{status.fileName}</strong>
								</>
							)}{" "}
							· {formatTimestamp(status.importedAt)}
						</p>
					) : (
						<p>
							Chọn báo cáo Tổng hợp công nợ phải thu khách hàng (TK 131) xuất từ
							MISA (kỳ bắt đầu ngay sau ngày chốt chuyển sổ), hoặc đặt ngày chốt
							để nhân viên điền số dư từng khách ở màn Công nợ phải thu.
						</p>
					)}
				</div>
				<input
					ref={input}
					className="visually-hidden"
					type="file"
					accept=".xlsx"
					onChange={(event) => void handleFile(event)}
				/>
				<div className="misa-book-actions">
					{(!status || status.customerCount === 0) && (
						<button
							className="button secondary"
							type="button"
							disabled={busy}
							onClick={() => {
								setError("");
								setCutoff(
									status?.date ??
										`${Number(todayLocal().slice(0, 4)) - 1}-12-31`,
								);
							}}
						>
							<CalendarCheck className="icon-size-16" />
							{status ? "Đổi ngày chốt" : "Đặt ngày chốt"}
						</button>
					)}
					{status && (
						<button
							className="button secondary"
							type="button"
							disabled={busy || status.allocatedCustomers > 0}
							title={
								status.allocatedCustomers > 0
									? "Đã có khoản thu phân bổ vào số dư đầu kỳ"
									: undefined
							}
							onClick={() => {
								setError("");
								setRemoving(true);
							}}
						>
							<Trash2 className="icon-size-16" /> Xóa số dư
						</button>
					)}
					<button
						className="button secondary"
						type="button"
						disabled={busy}
						onClick={() => input.current?.click()}
					>
						<Upload className="icon-size-16" />
						{pending === "parse"
							? "Đang đọc file..."
							: status
								? "Nhập lại số dư"
								: "Nhập số dư đầu kỳ"}
					</button>
				</div>
			</section>
			{status && status.excludedSalesRows > 0 && (
				<Notice tone="info">
					{number.format(status.excludedSalesRows)} dòng sổ bán hàng hạch toán
					đến ngày {formatDateOnly(status.date)} không được tính thêm vào công
					nợ vì đã nằm trong số dư đầu kỳ.
				</Notice>
			)}
			{success && (
				<Notice tone="success" announce onDismiss={() => setSuccess("")}>
					{success}
				</Notice>
			)}
			{error && !source && !removing && cutoff === undefined && (
				<Notice tone="danger" announce>
					{error}
				</Notice>
			)}
			{response.error && (
				<Notice tone="danger" announce>
					{response.error}
				</Notice>
			)}
			{source && (
				<OpeningBalanceDialog
					source={source}
					review={review}
					pending={pending}
					error={error}
					replacing={Boolean(status)}
					onDateChange={(date) => void load({ ...source, date })}
					onConfirm={() => void confirm()}
					onClose={close}
				/>
			)}
			{cutoff !== undefined && (
				<Dialog
					ariaLabelledBy="opening-balance-cutoff"
					eyebrow="SỐ DƯ ĐẦU KỲ"
					title="Đặt ngày chốt số dư"
					icon={<CalendarCheck className="icon-size-19" />}
					disableClose={busy}
					onClose={close}
					footer={
						<>
							<button
								className="button secondary"
								type="button"
								disabled={busy}
								onClick={close}
							>
								Hủy
							</button>
							<button
								className="button primary"
								type="button"
								disabled={busy || !cutoff}
								onClick={() => void saveCutoff()}
							>
								{pending === "save" ? "Đang lưu..." : "Đặt ngày chốt"}
							</button>
						</>
					}
				>
					<div className="dialog-body">
						{error && (
							<Notice tone="danger" announce>
								{error}
							</Notice>
						)}
						<label className="ui-field" htmlFor={cutoffField}>
							<span>Số dư tính đến cuối ngày</span>
							<DateInput
								id={cutoffField}
								ariaLabel="Ngày chốt số dư"
								value={cutoff}
								disabled={busy}
								onChange={setCutoff}
							/>
						</label>
						<p>
							Cả công ty dùng chung ngày này. Nhân viên điền số dư từng khách
							trong ngăn chi tiết khách ở màn Công nợ phải thu. Dòng sổ bán hàng
							hạch toán đến ngày chốt không được cộng thêm, và không ghi được
							khoản thu có ngày đến ngày chốt.
						</p>
					</div>
				</Dialog>
			)}
			{removing && status && (
				<Dialog
					ariaLabelledBy="opening-balance-remove"
					eyebrow="SỐ DƯ ĐẦU KỲ"
					title="Xóa số dư đầu kỳ"
					tone="danger"
					icon={<Trash2 className="icon-size-19" />}
					disableClose={busy}
					onClose={close}
					footer={
						<>
							<button
								className="button secondary"
								type="button"
								disabled={busy}
								onClick={close}
							>
								Hủy
							</button>
							<button
								className="button danger"
								type="button"
								disabled={busy}
								onClick={() => void remove()}
							>
								{pending === "save" ? "Đang xóa..." : "Xóa số dư đầu kỳ"}
							</button>
						</>
					}
				>
					<div className="dialog-body">
						{error && (
							<Notice tone="danger" announce>
								{error}
							</Notice>
						)}
						<p>
							Công nợ của {number.format(status.customerCount)} khách hàng sẽ
							chỉ còn tính từ sổ bán hàng và khoản thu. Khách hàng đã thêm vào
							danh mục khi nhập số dư vẫn được giữ.
						</p>
					</div>
				</Dialog>
			)}
		</>
	);
}

function OpeningBalanceDialog({
	source,
	review,
	pending,
	error,
	replacing,
	onDateChange,
	onConfirm,
	onClose,
}: {
	source: OpeningBalanceSource;
	review: OpeningBalanceReview | undefined;
	pending: "parse" | "review" | "save" | undefined;
	error: string;
	replacing: boolean;
	onDateChange: (date: string) => void;
	onConfirm: () => void;
	onClose: () => void;
}) {
	const dateField = useId();
	const saving = pending === "save";
	const ready = review && !review.issues.length && pending === undefined;
	return (
		<Dialog
			ariaLabelledBy="opening-balance-preview"
			eyebrow="NHẬP DỮ LIỆU MISA"
			title="Xem trước số dư đầu kỳ"
			icon={<Landmark className="icon-size-19" />}
			className="opening-balance-dialog"
			disableClose={saving}
			onClose={onClose}
			footer={
				<>
					<button
						className="button secondary"
						type="button"
						disabled={saving}
						onClick={onClose}
					>
						Hủy
					</button>
					<button
						className="button primary"
						type="button"
						disabled={!ready}
						onClick={onConfirm}
					>
						<Upload className="icon-size-16" />{" "}
						{saving
							? "Đang lưu..."
							: review
								? `Nhập số dư ${number.format(review.customerCount)} khách hàng`
								: "Nhập số dư"}
					</button>
				</>
			}
		>
			<div className="dialog-body opening-balance-body">
				<div className="misa-import-preview-file">
					<span className="misa-preview-file-icon">
						<FileSpreadsheet className="icon-size-19" />
					</span>
					<div className="misa-preview-file-copy">
						<strong>{source.fileName}</strong>
						<span>{number.format(source.rows.length)} dòng khách hàng</span>
					</div>
				</div>
				<label className="ui-field" htmlFor={dateField}>
					<span>Ngày chốt số dư (cuối ngày)</span>
					<DateInput
						id={dateField}
						ariaLabel="Ngày chốt số dư"
						value={source.date}
						disabled={saving}
						onChange={(date) =>
							date && date !== source.date && onDateChange(date)
						}
					/>
					<small className="cell-meta">
						{source.date
							? 'Lấy từ ngày liền trước "Từ ngày" của báo cáo. Sổ bán hàng và khoản thu chỉ tính từ ngày sau ngày chốt.'
							: 'Báo cáo không ghi kỳ "Từ ngày". Chọn ngày chốt số dư trước khi xem trước.'}
					</small>
				</label>
				{error && (
					<Notice tone="danger" announce>
						{error}
					</Notice>
				)}
				{pending === "review" && (
					<p role="status">Đang đối chiếu với danh mục…</p>
				)}
				{review?.issues.map((issue) => (
					<Notice key={issue} tone="danger" title="Chưa nhập được">
						{issue}
					</Notice>
				))}
				{review && (
					<>
						<dl className="opening-balance-facts">
							<div>
								<dt>Khách hàng có số dư</dt>
								<dd>{number.format(review.customerCount)}</dd>
							</div>
							<div>
								<dt>Dư Nợ · {number.format(review.debitCount)} khách</dt>
								<dd>{number.format(review.debitTotal)} đ</dd>
							</div>
							<div>
								<dt>Dư Có · {number.format(review.creditCount)} khách</dt>
								<dd>{number.format(review.creditTotal)} đ</dd>
							</div>
							<div>
								<dt>Công nợ thuần</dt>
								<dd>
									{number.format(review.debitTotal - review.creditTotal)} đ
								</dd>
							</div>
						</dl>
						<ul className="opening-balance-notes">
							{review.zeroCount > 0 && (
								<li>
									Bỏ qua {number.format(review.zeroCount)} khách có số dư bằng
									0.
								</li>
							)}
							{review.excludedSalesRows > 0 && (
								<li>
									{number.format(review.excludedSalesRows)} dòng sổ bán hàng
									hạch toán đến {formatDateOnly(review.date)} đã nằm trong số dư
									nên không tính thêm.
								</li>
							)}
							{review.manualCustomers > 0 && (
								<li>
									{number.format(review.manualCustomers)} khách đang có số dư
									nhập tay sẽ lấy theo số trong báo cáo.
								</li>
							)}
							{replacing && (
								<li>
									Thay số dư đang dùng: {number.format(review.changedCustomers)}{" "}
									khách đổi số dư, {number.format(review.removedCustomers)}{" "}
									khách không còn số dư.
								</li>
							)}
							<li>
								Khoản thu có ngày đến {formatDateOnly(review.date)} không ghi
								thêm được vì số dư đã trừ các khoản này.
							</li>
						</ul>
						{review.additionCount > 0 && (
							<Notice
								tone="warning"
								title={`${number.format(review.additionCount)} khách hàng chưa có trong danh mục`}
							>
								<p>
									App sẽ thêm các khách này vào danh mục (nhóm Chưa phân loại,
									chờ phân công nhân viên).
								</p>
								<ul className="opening-balance-additions">
									{review.additions.map(({ misaCode, name }) => (
										<li key={misaCode}>
											<strong>{misaCode}</strong> {name}
										</li>
									))}
									{review.additionCount > review.additions.length && (
										<li>
											… và{" "}
											{number.format(
												review.additionCount - review.additions.length,
											)}{" "}
											khách khác
										</li>
									)}
								</ul>
							</Notice>
						)}
					</>
				)}
			</div>
		</Dialog>
	);
}
