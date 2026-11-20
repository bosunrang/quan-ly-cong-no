import { Notice } from "../../shared/ui/Notice";
import { Database, Search, Upload, Users } from "lucide-react";
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
	previewSalesSupplement,
} from "../../domain/misa/misa.sales-book.repository";
import type {
	SalesImportReview,
	SalesPage,
	SalesSupplementReview,
} from "../../domain/reports/view-types";
import {
	accountingChanged,
	pageControls,
	resourceWithQuery,
	useServerData,
} from "../../shared/hooks/useServerData";
import { formatTimestamp } from "../../shared/lib/date";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";
import { MisaSalesImportDialog } from "./MisaSalesImportDialog";
import { MisaSalesTable } from "./MisaSalesTable";
import {
	parseMisaSalesWorkbook,
	type MisaSalesImportPreview,
} from "./misa.sales-import";

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 12 });
const initialSearch = { q: "", page: 1 };
const searchDelay = 250;
export function MisaDataPage() {
	const input = useRef<HTMLInputElement>(null);
	const supplementInput = useRef<HTMLInputElement>(null);
	const [preview, setPreview] = useState<MisaSalesImportPreview>();
	const [review, setReview] = useState<SalesImportReview>();
	const [importChoices, setImportChoices] = useState<ImportChoices>({});
	const [pending, setPending] = useState<"parse" | "review" | "save">();
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [supplement, setSupplement] = useState<{
		source: MisaSalesImportPreview;
		plan: SalesSupplementReview;
	}>();
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

	async function handleFile(
		event: ChangeEvent<HTMLInputElement>,
		addCustomers = false,
	) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file || busy) return;
		setError("");
		setSuccess("");
		setPending("parse");
		try {
			const source = await parseMisaSalesWorkbook(file);
			if (addCustomers)
				setSupplement({ source, plan: await previewSalesSupplement(source) });
			else {
				const result = await previewSalesImport(source, {});
				setImportChoices({});
				setReview(result);
				setPreview(source);
			}
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

	async function confirmSupplement() {
		if (!supplement || busy) return;
		setPending("save");
		setError("");
		try {
			await confirmSalesImport(
				supplement.source,
				"supplement",
				supplement.plan.token,
			);
			setSuccess(
				"Đã bổ sung " +
					number.format(supplement.plan.additions.length) +
					" khách hàng và đối chiếu " +
					number.format(supplement.plan.matchedRows) +
					" dòng theo mã MISA.",
			);
			setSupplement(undefined);
			accountingChanged();
		} catch (reason) {
			setError(message(reason));
			const next = await previewSalesSupplement(supplement.source).catch(
				() => undefined,
			);
			if (next) setSupplement({ ...supplement, plan: next });
		} finally {
			setPending(undefined);
		}
	}

	async function confirmImport() {
		if (!preview || !review?.hasChanges || busy) return;
		setPending("save");
		setError("");
		try {
			await confirmSalesImport(preview, "import", review.token, importChoices);
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
				<input
					ref={supplementInput}
					className="visually-hidden"
					type="file"
					accept=".xlsx"
					onChange={(event) => void handleFile(event, true)}
				/>
				<div className="misa-book-actions">
					{book && (
						<button
							className="button secondary"
							type="button"
							disabled={busy}
							onClick={() => supplementInput.current?.click()}
						>
							<Users className="icon-size-16" /> Bổ sung khách hàng từ MISA
						</button>
					)}
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
			{success && (
				<Notice tone="success" announce onDismiss={() => setSuccess("")}>
					{success}
				</Notice>
			)}
			{error && !preview && !supplement && (
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
			{supplement && (
				<Dialog
					ariaLabelledBy="misa-customer-supplement"
					eyebrow="DANH MỤC KHÁCH HÀNG"
					title="Bổ sung khách hàng từ MISA"
					icon={<Users className="icon-size-19" />}
					disableClose={busy}
					onClose={() => {
						setSupplement(undefined);
						setError("");
					}}
					footer={
						<>
							<button
								className="button secondary"
								type="button"
								disabled={busy}
								onClick={() => {
									setSupplement(undefined);
									setError("");
								}}
							>
								Hủy
							</button>
							<button
								className="button primary"
								type="button"
								disabled={busy}
								onClick={() => void confirmSupplement()}
							>
								{busy ? "Đang lưu..." : "Xác nhận bổ sung và ghép mã"}
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
							<strong>{number.format(supplement.plan.additions.length)}</strong>{" "}
							khách hàng mới ·{" "}
							<strong>{number.format(supplement.plan.matched)}</strong> mã đã có
							trong danh mục
						</p>
						<p>
							Ghép {number.format(supplement.plan.matchedRows)} dòng bán hàng
							theo mã MISA. Hồ sơ và phân công hiện có được giữ nguyên.
						</p>
						<p>
							Khu vực của hồ sơ mới lấy từ địa chỉ. Hồ sơ mới ở nhóm Chưa phân
							loại và chờ phân công nhân viên.
						</p>
					</div>
				</Dialog>
			)}
		</div>
	);
}
