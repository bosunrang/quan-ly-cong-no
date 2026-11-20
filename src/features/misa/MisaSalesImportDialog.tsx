import { Notice } from "../../shared/ui/Notice";
import { FileSpreadsheet, Search, Upload } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { normalizeVietnamese } from "../../domain/customers/customer.province";
import { readMissingSales } from "../../domain/misa/misa.sales-book.repository";
import type { MisaSalesLine } from "../../domain/misa/misa.sales-book";
import { pageControls } from "../../shared/hooks/useServerData";
import { usePagination } from "../../shared/hooks/usePagination";
import { formatDateOnly } from "../../shared/lib/date";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";
import { MisaSalesTable } from "./MisaSalesTable";
import {
	matchesSalesLine,
	type MisaSalesImportPreview,
} from "./misa.sales-import";
import type { Page, SalesImportReview } from "../../domain/reports/view-types";
import type { SalesImportOptions } from "./misa.sales-merge";

const number = new Intl.NumberFormat("vi-VN");
const money = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const filters = [
	{ value: "all", label: "Tất cả" },
	{ value: "ready", label: "Dòng mới" },
	{ value: "update", label: "Cập nhật" },
	{ value: "duplicate", label: "Dòng trùng" },
	{ value: "conflict", label: "Cần đối chiếu" },
	{ value: "missing", label: "Không còn trong file" },
] as const;
type Choices = Pick<SalesImportOptions, "applyChanges" | "removeMissing">;

interface Props {
	preview: MisaSalesImportPreview;
	plan: Omit<SalesImportReview, "issues"> & {
		issues: ReadonlyMap<number, SalesImportReview["issues"][number][1]>;
	};
	existingCount: number;
	choices: Choices;
	onChoicesChange: (choices: Choices) => void;
	isSaving: boolean;
	error: string;
	onClose: () => void;
	onConfirm: () => void;
}

export function MisaSalesImportDialog({
	preview,
	plan,
	existingCount,
	choices,
	onChoicesChange,
	isSaving,
	error,
	onClose,
	onConfirm,
}: Props) {
	const [query, setQuery] = useState("");
	// Ô tìm kiếm cập nhật ngay; danh sách lọc lại sau đó để gõ phím không bị khựng.
	const searchQuery = useDeferredValue(query);
	const [filter, setFilter] =
		useState<(typeof filters)[number]["value"]>("all");
	const { book } = preview;
	const { issues, conflictCount, missing } = plan;
	const kinds = [...issues.values()].map(({ kind }) => kind);
	const counts = {
		all: book.rows.length,
		ready: book.rows.length - issues.size,
		update: kinds.filter((kind) => kind === "update").length,
		duplicate: kinds.filter((kind) => kind === "duplicate").length,
		conflict: conflictCount,
		missing: missing.rowCount,
	};
	const missingTotal = missing.total;
	const reviewVouchers = plan.changedVouchers + plan.updatedVouchers;
	const lockedVouchers = plan.lockedVouchers + missing.lockedVouchers;
	const visibleRows = useMemo(() => {
		const needle = normalizeVietnamese(searchQuery);
		return book.rows.filter((row) => {
			const status = issues.get(row.rowNumber)?.kind ?? "ready";
			return (
				(filter === "all" || filter === status) && matchesSalesLine(row, needle)
			);
		});
	}, [book.rows, issues, filter, searchQuery]);
	const confirmLabel = [
		plan.addedCount ? `Nhập ${number.format(plan.addedCount)} dòng` : "",
		missing.removedVouchers
			? `gỡ ${number.format(missing.removedVouchers)} chứng từ`
			: "",
	]
		.filter(Boolean)
		.join(", ");
	const local = usePagination(visibleRows, 25);
	const [serverPage, setServerPage] = useState(1);
	const [serverRows, setServerRows] = useState<Page<MisaSalesLine>>();
	const [serverError, setServerError] = useState("");
	const [serverLoading, setServerLoading] = useState(false);
	const { token } = plan;
	useEffect(() => {
		if (filter !== "missing") return;
		let active = true;
		setServerLoading(true);
		setServerError("");
		void readMissingSales(token, serverPage, searchQuery)
			.then((result) => {
				if (active) setServerRows(result);
			})
			.catch((reason: unknown) => {
				if (active) {
					setServerRows(undefined);
					setServerError(
						reason instanceof Error
							? reason.message
							: "Không thể tải chứng từ.",
					);
				}
			})
			.finally(() => {
				if (active) setServerLoading(false);
			});
		return () => {
			active = false;
		};
	}, [token, serverPage, searchQuery, filter]);
	const total =
		filter === "missing" ? (serverRows?.total ?? 0) : visibleRows.length;
	const pagination =
		filter === "missing"
			? {
					...pageControls(serverRows?.page ?? serverPage, 25, total),
					currentPage: serverRows?.page ?? serverPage,
					setCurrentPage: setServerPage,
					pageItems: serverLoading ? [] : (serverRows?.items ?? []),
				}
			: local;
	function resetPage() {
		local.resetPage();
		setServerPage(1);
	}

	return (
		<Dialog
			ariaLabelledBy="misa-sales-preview-title"
			eyebrow="NHẬP DỮ LIỆU MISA"
			title="Xem trước sổ chi tiết bán hàng"
			icon={<FileSpreadsheet className="icon-size-19" />}
			className="misa-import-preview-dialog misa-sales-preview-dialog"
			disableClose={isSaving}
			onClose={onClose}
			footer={
				<>
					<button
						className="button secondary"
						type="button"
						disabled={isSaving}
						onClick={onClose}
					>
						Hủy
					</button>
					<button
						className="button primary"
						type="button"
						disabled={isSaving || !plan.hasChanges}
						onClick={onConfirm}
					>
						<Upload className="icon-size-16" />{" "}
						{isSaving
							? "Đang lưu..."
							: confirmLabel
								? confirmLabel.charAt(0).toUpperCase() + confirmLabel.slice(1)
								: "Không có thay đổi"}
					</button>
				</>
			}
		>
			<div className="misa-import-preview-body">
				{filter === "missing" && serverLoading && (
					<p role="status">Đang tải chứng từ…</p>
				)}
				{filter === "missing" && serverError && (
					<Notice tone="danger" announce>
						{serverError}
					</Notice>
				)}
				{error && (
					<Notice tone="danger" announce>
						{error}
					</Notice>
				)}
				<div className="misa-import-preview-file">
					<span className="misa-preview-file-icon">
						<FileSpreadsheet className="icon-size-19" />
					</span>
					<div className="misa-preview-file-copy">
						<strong>{book.fileName}</strong>
						<span>{number.format(counts.all)} dòng bán hàng</span>
					</div>
				</div>
				{existingCount > 0 && (
					<Notice tone="info">
						Giữ {number.format(existingCount)} dòng đã lưu. Dòng đã có trong sổ
						sẽ được bỏ qua.
					</Notice>
				)}
				{reviewVouchers > 0 && (
					<Notice tone="warning" title="Chứng từ cần đối chiếu">
						{number.format(reviewVouchers)} chứng từ khác sổ đang lưu hoặc có
						dòng giống hệt nhau trong file. Mặc định app giữ nguyên cả chứng từ
						và không ghi một phần chứng từ. Sau khi đã kiểm tra với MISA, có thể
						cập nhật theo file.
						<label className="misa-import-choice">
							<input
								type="checkbox"
								checked={Boolean(choices.applyChanges)}
								disabled={isSaving}
								onChange={(event) =>
									onChoicesChange({
										...choices,
										applyChanges: event.target.checked,
									})
								}
							/>
							Đã kiểm tra với MISA: cập nhật {number.format(reviewVouchers)}{" "}
							chứng từ theo file
						</label>
					</Notice>
				)}
				{lockedVouchers > 0 && (
					<Notice tone="warning" title="Chứng từ đã phân bổ khoản thu">
						{number.format(lockedVouchers)} chứng từ thay đổi hoặc không còn
						trong file đang có phân bổ khoản thu nên được giữ nguyên. Hoàn tác
						phân bổ ở Đối soát khoản thu trước khi cập nhật.
					</Notice>
				)}
				{missing.vouchers > 0 && (
					<Notice tone="warning" title="Chứng từ không còn trong file">
						{number.format(missing.vouchers)} chứng từ (
						{number.format(missing.rowCount)} dòng, tổng thanh toán{" "}
						{money.format(missingTotal)} đ) đã lưu trong khoảng{" "}
						{formatDateOnly(missing.from)}–{formatDateOnly(missing.to)} nhưng
						không có trong file này. Có thể chứng từ đã bị xóa hoặc hủy trong
						MISA. Nếu file chỉ xuất một phần (lọc theo khách hàng hoặc mặt
						hàng), đừng chọn gỡ.
						{missing.vouchers > missing.lockedVouchers && (
							<label className="misa-import-choice">
								<input
									type="checkbox"
									checked={Boolean(choices.removeMissing)}
									disabled={isSaving}
									onChange={(event) =>
										onChoicesChange({
											...choices,
											removeMissing: event.target.checked,
										})
									}
								/>
								Gỡ {number.format(missing.vouchers - missing.lockedVouchers)}{" "}
								chứng từ này khỏi sổ
							</label>
						)}
					</Notice>
				)}
				<section
					className="misa-preview-unit-panel"
					aria-label="Kiểm tra các dòng bán hàng"
				>
					<div className="misa-preview-controls">
						<label className="misa-preview-search">
							<Search className="icon-size-16" />
							<input
								type="search"
								aria-label="Tìm trong bản xem trước"
								placeholder="Chứng từ, hóa đơn, khách hàng hoặc tên hàng…"
								value={query}
								disabled={isSaving}
								onChange={(event) => {
									setQuery(event.target.value);
									resetPage();
								}}
							/>
						</label>
						<fieldset className="filter-switch" aria-label="Lọc dòng xem trước">
							{filters
								.filter(
									({ value }) =>
										!["conflict", "update", "missing"].includes(value) ||
										counts[value] > 0 ||
										filter === value,
								)
								.map(({ value, label }) => (
									<button
										key={value}
										type="button"
										aria-pressed={filter === value}
										disabled={isSaving}
										onClick={() => {
											setFilter(value);
											resetPage();
										}}
									>
										{label} <strong>{number.format(counts[value])}</strong>
									</button>
								))}
						</fieldset>
					</div>
					<MisaSalesTable
						key={`${filter}:${searchQuery}:${pagination.currentPage}`}
						rows={pagination.pageItems}
						issues={filter === "missing" ? undefined : issues}
					/>
					{!total &&
						!(filter === "missing" && (serverLoading || serverError)) && (
							<div className="misa-sales-preview-empty">
								{filter === "duplicate" && !counts.duplicate
									? "Không có dòng trùng."
									: "Không tìm thấy dòng phù hợp."}
							</div>
						)}
					<div className="misa-sales-preview-pagination">
						<span aria-live="polite">
							{number.format(pagination.firstVisible)}–
							{number.format(pagination.lastVisible)} / {number.format(total)}{" "}
							dòng
						</span>
						<PaginationControls
							currentPage={pagination.currentPage}
							pageCount={pagination.pageCount}
							onPageChange={pagination.setCurrentPage}
							previousLabel="Trang xem trước trước"
							nextLabel="Trang xem trước tiếp theo"
						/>
					</div>
				</section>
			</div>
		</Dialog>
	);
}
