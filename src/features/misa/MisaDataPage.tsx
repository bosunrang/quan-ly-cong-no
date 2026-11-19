import { Notice } from "../../shared/ui/Notice";
import { Database, Search, Upload, Users } from "lucide-react";
import {
	type ChangeEvent,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { normalizeVietnamese } from "../../domain/customers/customer.province";
import {
	readCustomers,
	importCustomerRecords,
} from "../../domain/customers/customer.repository";
import { customerImportFields } from "../../domain/customers/customer.service";
import type { MisaSalesBook } from "../../domain/misa/misa.sales-book";
import {
	readAllocatedDocuments,
	readMisaSalesBook,
	writeMisaSalesBook,
} from "../../domain/misa/misa.sales-book.repository";
import { usePagination } from "../../shared/hooks/usePagination";
import { formatTimestamp } from "../../shared/lib/date";
import { captureActivity } from "../../shared/storage/activityLog";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";
import { MisaSalesImportDialog } from "./MisaSalesImportDialog";
import { MisaSalesTable } from "./MisaSalesTable";
import { planMisaCustomerSupplement } from "./misa.customer-supplement";
import {
	matchesSalesLine,
	parseMisaSalesWorkbook,
	type MisaSalesImportPreview,
} from "./misa.sales-import";
import {
	planMisaSalesImport,
	type SalesImportOptions,
} from "./misa.sales-merge";

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 12 });
const documentOrder = new Intl.Collator("vi-VN", { numeric: true });
export function MisaDataPage() {
	const input = useRef<HTMLInputElement>(null);
	const supplementInput = useRef<HTMLInputElement>(null);
	const [book, setBook] = useState<MisaSalesBook | null>(null);
	const [preview, setPreview] = useState<MisaSalesImportPreview>();
	const [allocatedDocuments, setAllocatedDocuments] = useState<Set<string>>();
	const [importChoices, setImportChoices] = useState<
		Pick<SalesImportOptions, "applyChanges" | "removeMissing">
	>({});
	const [pending, setPending] = useState<"load" | "parse" | "save" | null>(
		"load",
	);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [supplement, setSupplement] = useState<{
		source: MisaSalesImportPreview;
		plan: ReturnType<typeof planMisaCustomerSupplement>;
	}>();
	const [query, setQuery] = useState("");
	// Ô tìm kiếm cập nhật ngay; danh sách lọc lại sau đó để gõ phím không bị khựng.
	const searchQuery = useDeferredValue(query);
	const sortedRows = useMemo(
		() =>
			[...(book?.rows ?? [])].sort(
				(left, right) =>
					right.date.localeCompare(left.date) ||
					documentOrder.compare(right.documentNumber, left.documentNumber) ||
					left.rowNumber - right.rowNumber,
			),
		[book],
	);
	const filteredRows = useMemo(() => {
		const needle = normalizeVietnamese(searchQuery);
		return needle
			? sortedRows.filter((row) => matchesSalesLine(row, needle))
			: sortedRows;
	}, [sortedRows, searchQuery]);
	const pagination = usePagination(filteredRows, 25);
	const busy = pending !== null;
	const importPlan = useMemo(
		() =>
			preview
				? planMisaSalesImport(book, preview, {
						...importChoices,
						allocatedDocuments,
					})
				: null,
		[book, preview, importChoices, allocatedDocuments],
	);

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
							: "Không thể đọc dữ liệu đã lưu.",
					);
			})
			.finally(() => {
				if (active) setPending(null);
			});
		return () => {
			active = false;
		};
	}, []);

	async function handleFile(
		event: ChangeEvent<HTMLInputElement>,
		addCustomers = false,
	) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		setError("");
		setSuccess("");
		setPending("parse");
		try {
			const [source, saved, ledger] = await Promise.all([
				parseMisaSalesWorkbook(file),
				readMisaSalesBook(),
				addCustomers ? undefined : readAllocatedDocuments(),
			]);
			setBook(saved);
			if (ledger) setAllocatedDocuments(ledger);
			setImportChoices({});
			if (addCustomers && saved) {
				setSupplement({
					source,
					plan: planMisaCustomerSupplement(
						saved,
						source,
						await readCustomers(),
					),
				});
			} else if (!addCustomers) {
				setPreview(source);
			} else {
				throw new Error("Chưa có sổ bán hàng MISA để bổ sung khách hàng.");
			}
		} catch (reason) {
			setError(
				reason instanceof Error ? reason.message : "Không thể đọc file MISA.",
			);
		} finally {
			setPending(null);
		}
	}

	async function confirmSupplement() {
		if (!supplement || !book || busy) return;
		const log = captureActivity();
		setError("");
		setPending("save");
		try {
			const saved = await readMisaSalesBook();
			if (!saved || saved.importedAt !== book.importedAt) {
				throw new Error(
					"Sổ bán hàng đã thay đổi. Hãy chọn lại file MISA để đối chiếu.",
				);
			}
			const customers = await readCustomers();
			const plan = planMisaCustomerSupplement(
				saved,
				supplement.source,
				customers,
			);
			// Saving the catalog first makes a retry safe if the sales-book write fails.
			if (plan.additions.length) {
				await importCustomerRecords(
					plan.additions.map(customerImportFields),
					"misa-supplements",
				);
				void log(
					"data",
					"Bổ sung khách hàng từ MISA",
					`${plan.additions.length} khách hàng · ${supplement.source.book.fileName}`,
				);
			}
			const updated = plan.linkedRows
				? await writeMisaSalesBook(plan.book, saved.importedAt)
				: saved;
			if (plan.linkedRows)
				void log(
					"data",
					"Ghép mã khách hàng MISA",
					`${plan.linkedRows} dòng · ${saved.fileName}`,
				);
			setBook(updated);
			setSupplement(undefined);
			setSuccess(
				`Đã thêm ${number.format(plan.additions.length)} khách hàng, dùng ${number.format(plan.matched)} hồ sơ đã có và đối chiếu ${number.format(plan.matchedRows)} dòng bán hàng theo mã MISA.`,
			);
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: "Không thể bổ sung khách hàng MISA.",
			);
		} finally {
			setPending(null);
		}
	}

	async function confirmImport() {
		if (!preview || !importPlan?.hasChanges || busy) return;
		const log = captureActivity();
		setError("");
		setPending("save");
		try {
			let plan = importPlan;
			if (plan.removedCount) {
				// Kiểm tra lại phân bổ ngay trước khi thay hoặc gỡ chứng từ đã lưu.
				const latest = await readAllocatedDocuments();
				plan = planMisaSalesImport(book, preview, {
					...importChoices,
					allocatedDocuments: latest,
				});
				if (
					plan.removedCount !== importPlan.removedCount ||
					plan.addedCount !== importPlan.addedCount
				) {
					setAllocatedDocuments(latest);
					throw new Error(
						"Phân bổ khoản thu vừa thay đổi. Hãy xem lại bản xem trước trước khi nhập.",
					);
				}
			}
			const updated = await writeMisaSalesBook(
				plan.book,
				book?.importedAt ?? null,
			);
			const summary = [
				`${plan.addedCount} dòng thêm`,
				plan.updatedVouchers
					? `${plan.updatedVouchers} chứng từ cập nhật theo file`
					: "",
				plan.missing.removedVouchers
					? `${plan.missing.removedVouchers} chứng từ gỡ khỏi sổ`
					: "",
			]
				.filter(Boolean)
				.join(" · ");
			void log(
				"data",
				"Nhập sổ bán hàng MISA",
				`${updated.fileName} · ${summary}`,
			);
			setBook(updated);
			setPreview(undefined);
			setSuccess(`Đã nhập sổ bán hàng: ${summary}.`);
			setQuery("");
			pagination.resetPage();
		} catch (reason) {
			await readMisaSalesBook()
				.then(setBook)
				.catch(() => {});
			setError(
				reason instanceof Error
					? reason.message
					: "Không thể lưu dữ liệu MISA.",
			);
		} finally {
			setPending(null);
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
							{number.format(book.rows.length)} dòng · Nhập gần nhất{" "}
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
									onChange={(event) => {
										setQuery(event.target.value);
										pagination.resetPage();
									}}
								/>
							</div>
						</label>
					</div>
					<MisaSalesTable rows={pagination.pageItems} />
					{!filteredRows.length && (
						<div className="empty-state">Không tìm thấy dòng phù hợp.</div>
					)}
					<footer className="misa-table-footer">
						<span>
							{number.format(pagination.firstVisible)}–
							{number.format(pagination.lastVisible)} /{" "}
							{number.format(filteredRows.length)} dòng
						</span>
						<PaginationControls
							currentPage={pagination.currentPage}
							pageCount={pagination.pageCount}
							onPageChange={pagination.setCurrentPage}
							previousLabel="Trang trước"
							nextLabel="Trang sau"
						/>
					</footer>
				</section>
			) : (
				!busy &&
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
					existingCount={book?.rows.length ?? 0}
					choices={importChoices}
					onChoicesChange={setImportChoices}
					isSaving={pending === "save"}
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
