import { Notice } from "../../shared/ui/Notice";
import { Database, Search, Upload } from "lucide-react";
import {
	type ChangeEvent,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import {
	confirmSalesImport,
	type ImportChoices,
	previewSalesImport,
} from "../../domain/misa/misa.sales-book.repository";
import type {
	SalesImportReview,
	SalesPage,
} from "../../domain/reports/view-types";
import {
	accountingChanged,
	pageControls,
	resourceWithQuery,
	useServerData,
} from "../../shared/hooks/useServerData";
import { formatTimestamp } from "../../shared/lib/date";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";
import { MisaSalesImportDialog } from "./MisaSalesImportDialog";
import { MisaSalesTable } from "./MisaSalesTable";
import { OpeningBalanceSection } from "./OpeningBalanceSection";
import {
	parseMisaSalesWorkbook,
	type MisaSalesImportPreview,
} from "./misa.sales-import";

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 12 });
const initialSearch = { q: "", page: 1 };
const searchDelay = 250;
export function MisaDataPage() {
	const input = useRef<HTMLInputElement>(null);
	const [preview, setPreview] = useState<MisaSalesImportPreview>();
	const [review, setReview] = useState<SalesImportReview>();
	const [importChoices, setImportChoices] = useState<ImportChoices>({});
	const [pending, setPending] = useState<"parse" | "review" | "save">();
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [query, setQuery] = useState("");
	const [search, setSearch] = useState(initialSearch);
	const searchQuery = query.trim();
	const queryPending = searchQuery !== search.q;
	const resource = resourceWithQuery("sales-book", search);
	const response = useServerData<SalesPage>(resource);
	const currentData = response.data;
	const data = currentData ?? response.previous;
	const book = data?.book;
	const { page, limit, rows, total } = data ?? {
		page: 1,
		limit: 25,
		rows: [],
		total: 0,
	};
	const loading = queryPending || response.loading;
	const busy = pending !== undefined;
	const pagination = pageControls(page, limit, total);
	const tableViewport = useRef<HTMLElement>(null);
	const shownResource = useRef<string | undefined>(undefined);
	const importPlan = review && { ...review, issues: new Map(review.issues) };
	const message = (reason: unknown) =>
		reason instanceof Error ? reason.message : "Không thể xử lý dữ liệu MISA.";

	useEffect(() => {
		if (!queryPending) return;
		const timer = window.setTimeout(() => {
			setSearch({ q: searchQuery, page: 1 });
		}, searchDelay);
		return () => window.clearTimeout(timer);
	}, [queryPending, searchQuery]);

	useLayoutEffect(() => {
		if (!currentData || shownResource.current === resource) return;
		shownResource.current = resource;
		if (tableViewport.current) tableViewport.current.scrollTop = 0;
	}, [currentData, resource]);

	async function handleFile(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file || busy) return;
		setError("");
		setSuccess("");
		setPending("parse");
		try {
			const source = await parseMisaSalesWorkbook(file);
			const result = await previewSalesImport(source, {});
			setImportChoices({});
			setReview(result);
			setPreview(source);
		} catch (reason) {
			setError(message(reason));
		} finally {
			setPending(undefined);
		}
	}

	async function changeChoices(choices: ImportChoices) {
		if (!preview || busy) return;
		setPending("review");
		setError("");
		try {
			setReview(await previewSalesImport(preview, choices));
			setImportChoices(choices);
		} catch (reason) {
			setError(message(reason));
		} finally {
			setPending(undefined);
		}
	}

	async function confirmImport() {
		if (!preview || !review?.hasChanges || busy) return;
		setPending("save");
		setError("");
		try {
			await confirmSalesImport(review.token);
			setSuccess(
				"Đã nhập sổ bán hàng: " +
					number.format(review.addedCount) +
					" dòng thêm, " +
					number.format(review.missing.removedVouchers) +
					" chứng từ gỡ khỏi sổ.",
			);
			setPreview(undefined);
			setReview(undefined);
			setQuery("");
			setSearch(initialSearch);
			accountingChanged();
		} catch (reason) {
			setError(message(reason));
			const next = await previewSalesImport(preview, importChoices).catch(
				() => undefined,
			);
			if (next) setReview(next);
		} finally {
			setPending(undefined);
		}
	}

	return (
		<div className="page-stack misa-data-page">
			<div className="misa-sources">
				<section className="panel data-source-card">
					<div className="data-source-icon">
						<Database className="icon-size-22" />
					</div>
					<div className="data-source-copy">
						<h2>Sổ chi tiết bán hàng</h2>
						{book ? (
							<p>
								{number.format(data?.rowCount ?? 0)} dòng · Nhập gần nhất{" "}
								<strong>{book.fileName}</strong> ·{" "}
								{formatTimestamp(book.importedAt)}
							</p>
						) : (
							<p>Chọn file Excel Sổ chi tiết bán hàng xuất từ MISA.</p>
						)}
					</div>
					<input
						ref={input}
						className="visually-hidden"
						type="file"
						accept=".xlsx"
						onChange={handleFile}
					/>
					<div className="misa-book-actions">
						<button
							className="button primary"
							type="button"
							disabled={busy}
							onClick={() => input.current?.click()}
						>
							<Upload className="icon-size-16" />
							{pending === "parse" ? "Đang đọc file..." : "Chọn file MISA"}
						</button>
					</div>
				</section>
				<OpeningBalanceSection disabled={busy} />
			</div>
			{success && (
				<Notice tone="success" announce onDismiss={() => setSuccess("")}>
					{success}
				</Notice>
			)}
			{error && !preview && (
				<Notice tone="danger" announce>
					{error}
				</Notice>
			)}
			{response.loading && !data && (
				<p className="panel empty-state" role="status">
					Đang tải sổ bán hàng…
				</p>
			)}
			{response.error && (
				<Notice tone="danger" announce>
					{response.error}
				</Notice>
			)}
			{book ? (
				<section className="panel data-panel misa-detail-panel">
					<div className="panel-header">
						<label className="misa-filter-field misa-sales-search">
							<span>Tìm dòng bán hàng</span>
							<div className="misa-filter-control">
								<Search className="icon-size-16" />
								<input
									type="search"
									placeholder="Chứng từ, hóa đơn, khách hàng hoặc tên hàng"
									value={query}
									onChange={(event) => setQuery(event.target.value)}
								/>
							</div>
						</label>
					</div>
					<MisaSalesTable
						rows={rows}
						viewportRef={tableViewport}
						loading={loading}
						emptyMessage={
							!loading && !total ? "Không tìm thấy dòng phù hợp." : undefined
						}
					/>
					<footer className="misa-table-footer">
						<span role="status">
							{loading
								? "Đang tải kết quả…"
								: `${number.format(pagination.firstVisible)}–${number.format(pagination.lastVisible)} / ${number.format(total)} dòng`}
						</span>
						<PaginationControls
							currentPage={page}
							pageCount={pagination.pageCount}
							disabled={loading}
							onPageChange={(nextPage) =>
								setSearch({ ...search, page: nextPage })
							}
							previousLabel="Trang trước"
							nextLabel="Trang sau"
						/>
					</footer>
				</section>
			) : (
				!busy &&
				!response.loading &&
				!response.error &&
				!error && (
					<div className="panel empty-state">
						Chưa có dữ liệu bán hàng MISA.
					</div>
				)
			)}
			{preview && importPlan && (
				<MisaSalesImportDialog
					preview={preview}
					plan={importPlan}
					choices={importChoices}
					onChoicesChange={(choices) => void changeChoices(choices)}
					isSaving={busy}
					error={error}
					onConfirm={() => void confirmImport()}
					onClose={() => {
						setPreview(undefined);
						setError("");
					}}
				/>
			)}
		</div>
	);
}
