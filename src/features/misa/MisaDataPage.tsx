import {
	AlertCircle,
	BadgeDollarSign,
	Building2,
	CheckCircle2,
	Database,
	FileSpreadsheet,
	HandCoins,
	Search,
	Scale,
	Upload,
} from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { normalizeVietnamese } from "../../domain/customers/customer.province";
import { readCustomers } from "../../domain/customers/customer.repository";
import {
	isMisaUnitDiscountEligible,
	type MisaDataset,
	type MisaDetailPage,
	type MisaDocumentKind,
	type MisaUnitSummary,
} from "../../domain/misa/misa.model";
import {
	queryMisaDetails,
	readMisaDataset,
	writeMisaDataset,
} from "../../domain/misa/misa.repository";
import { formatDateOnly, formatTimestamp } from "../../shared/lib/date";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";
import { StatusPill, type StatusTone } from "../../shared/ui/StatusPill";
import { parseMisaWorkbook } from "./misa.import";

type DetailFilter = MisaDocumentKind | "all";

const number = new Intl.NumberFormat("vi-VN");
const currency = new Intl.NumberFormat("vi-VN", {
	style: "currency",
	currency: "VND",
	maximumFractionDigits: 0,
});
const emptyPage: MisaDetailPage = {
	rows: [],
	filteredCount: 0,
	page: 1,
	pageCount: 1,
	firstVisible: 0,
	lastVisible: 0,
};

const documentLabels: Record<
	MisaDocumentKind,
	{ label: string; tone: StatusTone }
> = {
	sale: { label: "Đơn bán", tone: "neutral" },
	receipt: { label: "Thu tiền", tone: "success" },
	adjustment: { label: "Điều chỉnh", tone: "warning" },
};

function defaultUnitId(dataset: MisaDataset | null): string {
	if (!dataset?.units.length) return "";
	return (
		dataset.units.find((unit) => unit.customerId)?.id ?? dataset.units[0].id
	);
}

function formatOptionalNumber(value: number | null): string {
	return value === null ? "—" : number.format(value);
}

function formatOptionalCurrency(value: number | null): string {
	return value === null ? "—" : currency.format(value);
}

function finiteAmount(value: number): number {
	return Number.isFinite(value) ? value : 0;
}

function MisaOverview({ dataset }: { dataset: MisaDataset }) {
	const matchedCount = dataset.units.filter((unit) => unit.customerId).length;
	return (
		<section className="misa-overview" aria-label="Tổng quan dữ liệu MISA">
			<article>
				<div className="misa-stat-icon neutral">
					<Building2 size={18} />
				</div>
				<span>Tổng đơn vị</span>
				<strong>{number.format(dataset.units.length)}</strong>
			</article>
			<article>
				<div className="misa-stat-icon success">
					<CheckCircle2 size={18} />
				</div>
				<span>Đã khớp danh mục</span>
				<strong>{number.format(matchedCount)}</strong>
			</article>
			<article>
				<div className="misa-stat-icon warning">
					<AlertCircle size={18} />
				</div>
				<span>Chưa khớp</span>
				<strong>{number.format(dataset.units.length - matchedCount)}</strong>
			</article>
			<article>
				<div className="misa-stat-icon info">
					<FileSpreadsheet size={18} />
				</div>
				<span>Dòng nghiệp vụ</span>
				<strong>{number.format(dataset.sourceRowCount)}</strong>
			</article>
		</section>
	);
}

function SelectedUnitSummary({ unit }: { unit: MisaUnitSummary }) {
	const salesAmount = finiteAmount(unit.salesAmount);
	const receiptAmount = finiteAmount(unit.receiptAmount);
	const difference = salesAmount - receiptAmount;
	const isEligible = isMisaUnitDiscountEligible({
		salesAmount,
		receiptAmount,
	});
	return (
		<div className="misa-selected-summary">
			<div className="misa-summary-card">
				<span className="misa-summary-icon">
					<FileSpreadsheet size={17} />
				</span>
				<div>
					<span>Đơn bán</span>
					<strong>{number.format(unit.salesDocumentCount)}</strong>
					<small>{number.format(unit.salesLineCount)} dòng hàng</small>
				</div>
			</div>
			<div className="misa-summary-card sales">
				<span className="misa-summary-icon">
					<BadgeDollarSign size={17} />
				</span>
				<div>
					<span>Doanh số bán</span>
					<strong>{currency.format(salesAmount)}</strong>
					<small>Cập nhật {formatDateOnly(unit.lastTransactionDate)}</small>
				</div>
			</div>
			<div className="misa-summary-card receipts">
				<span className="misa-summary-icon">
					<HandCoins size={17} />
				</span>
				<div>
					<span>Đã thu</span>
					<strong>{currency.format(receiptAmount)}</strong>
					<small>{number.format(unit.receiptDocumentCount)} chứng từ thu</small>
				</div>
			</div>
			<div
				className={`misa-summary-card ${difference > 0 ? "is-warning" : "is-balanced"}`}
			>
				<span className="misa-summary-icon">
					<Scale size={17} />
				</span>
				<div>
					<span>Chênh lệch</span>
					<strong>{currency.format(Math.abs(difference))}</strong>
					<small>
						{difference > 0
							? "Còn thiếu"
							: difference < 0
								? "Thu vượt doanh số"
								: "Đã cân bằng"}
					</small>
				</div>
			</div>
			<div
				className={`misa-summary-card ${isEligible ? "is-eligible" : "is-warning"}`}
			>
				<span className="misa-summary-icon">
					{isEligible ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
				</span>
				<div className="misa-selected-match">
					<span>Điều kiện chiết khấu</span>
					{isEligible ? (
						<StatusPill tone="success">Đủ điều kiện chi</StatusPill>
					) : (
						<StatusPill tone="warning">Chưa đủ điều kiện</StatusPill>
					)}
				</div>
			</div>
		</div>
	);
}

export function MisaDataPage() {
	const inputRef = useRef<HTMLInputElement>(null);
	const [customers] = useState(readCustomers);
	const [dataset, setDataset] = useState<MisaDataset | null>(() =>
		readMisaDataset(),
	);
	const [selectedUnitId, setSelectedUnitId] = useState("");
	const [documentFilter, setDocumentFilter] = useState<DetailFilter>("all");
	const [unitQuery, setUnitQuery] = useState("");
	const [unitProvince, setUnitProvince] = useState("all");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(25);
	const [detailPage, setDetailPage] = useState<MisaDetailPage>(emptyPage);
	const [isLoadingDetails, setIsLoadingDetails] = useState(false);
	const [isImporting, setIsImporting] = useState(false);
	const [error, setError] = useState("");
	const customerById = useMemo(
		() => new Map(customers.map((customer) => [customer.id, customer])),
		[customers],
	);
	const provinceOptions = useMemo(
		() =>
			[
				...new Set(
					(dataset?.units ?? []).flatMap((unit) => {
						const province = unit.customerId
							? customerById.get(unit.customerId)?.province
							: undefined;
						return province ? [province] : [];
					}),
				),
			].sort((left, right) => left.localeCompare(right, "vi-VN")),
		[customerById, dataset?.units],
	);
	const filteredUnits = useMemo(() => {
		const normalizedQuery = normalizeVietnamese(unitQuery);
		return (dataset?.units ?? []).filter((unit) => {
			const customer = unit.customerId
				? customerById.get(unit.customerId)
				: undefined;
			const matchesQuery =
				!normalizedQuery ||
				normalizeVietnamese(
					`${unit.name} ${unit.customerCode ?? ""} ${customer?.misaCode ?? ""}`,
				).includes(normalizedQuery);
			const matchesProvince =
				unitProvince === "all" || customer?.province === unitProvince;
			return matchesQuery && matchesProvince;
		});
	}, [customerById, dataset?.units, unitProvince, unitQuery]);

	const selectedUnit = useMemo(
		() => filteredUnits.find((unit) => unit.id === selectedUnitId),
		[filteredUnits, selectedUnitId],
	);

	useEffect(() => {
		if (filteredUnits.some((unit) => unit.id === selectedUnitId)) return;
		setSelectedUnitId(filteredUnits[0]?.id ?? "");
		setPage(1);
	}, [filteredUnits, selectedUnitId]);

	useEffect(() => {
		if (!selectedUnitId || !dataset?.detailsAvailable) {
			setDetailPage(emptyPage);
			return;
		}
		let active = true;
		setIsLoadingDetails(true);
		queryMisaDetails({
			unitId: selectedUnitId,
			query: "",
			documentKind: documentFilter,
			page,
			pageSize,
		})
			.then((result) => {
				if (!active) return;
				setDetailPage(result);
				if (result.page !== page) setPage(result.page);
				setError("");
			})
			.catch((reason) => {
				if (!active) return;
				setDetailPage(emptyPage);
				setError(
					reason instanceof Error
						? reason.message
						: "Không thể đọc chi tiết MISA.",
				);
			})
			.finally(() => {
				if (active) setIsLoadingDetails(false);
			});
		return () => {
			active = false;
		};
	}, [
		dataset?.detailsAvailable,
		documentFilter,
		page,
		pageSize,
		selectedUnitId,
	]);

	async function handleFile(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) return;
		setIsImporting(true);
		setError("");
		try {
			const parsed = await parseMisaWorkbook(file, readCustomers());
			if (!(await writeMisaDataset(parsed)))
				throw new Error("Không thể lưu dữ liệu MISA vào bộ nhớ của ứng dụng.");
			const { rows: _rows, ...summary } = parsed;
			setDataset(summary);
			setSelectedUnitId(defaultUnitId(summary));
			setDocumentFilter("all");
			setUnitQuery("");
			setUnitProvince("all");
			setPage(1);
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: "Không thể đọc file MISA đã chọn.",
			);
		} finally {
			setIsImporting(false);
			event.target.value = "";
		}
	}

	return (
		<div className="page-stack misa-data-page">
			<section className="panel misa-import-card">
				<div className="misa-import-icon">
					<Database size={22} />
				</div>
				<div className="misa-import-copy">
					<h2>Dữ liệu bán hàng và công nợ MISA</h2>
					{dataset ? (
						<p>
							<strong>{dataset.fileName}</strong>
							<span>·</span>Kỳ {formatDateOnly(dataset.periodFrom)} –{" "}
							{formatDateOnly(dataset.periodTo)}
							<span>·</span>Nhập {formatTimestamp(dataset.importedAt)}
						</p>
					) : (
						<p>Chọn file Chi tiết công nợ phải thu xuất từ MISA.</p>
					)}
				</div>
				<input
					ref={inputRef}
					className="visually-hidden"
					type="file"
					accept=".xlsx,.xls"
					onChange={handleFile}
				/>
				<button
					className="button primary"
					type="button"
					disabled={isImporting}
					onClick={() => inputRef.current?.click()}
				>
					<Upload size={16} />
					{isImporting
						? "Đang đọc dữ liệu..."
						: dataset
							? "Nhập file khác"
							: "Chọn file MISA"}
				</button>
			</section>

			{error && (
				<div className="misa-error" role="alert">
					<AlertCircle size={17} />
					<span>{error}</span>
				</div>
			)}

			{dataset ? (
				<>
					<MisaOverview dataset={dataset} />
					<section className="panel data-panel misa-detail-panel">
						<div className="misa-unit-toolbar">
							<label className="misa-filter-field misa-unit-search">
								<span>Tìm đơn vị</span>
								<div className="misa-filter-control">
									<Search size={16} />
									<input
										value={unitQuery}
										placeholder="Tên đơn vị hoặc mã MISA..."
										onChange={(event) => setUnitQuery(event.target.value)}
									/>
								</div>
							</label>
							<label className="misa-filter-field misa-province-select">
								<span>Tỉnh/thành</span>
								<select
									value={unitProvince}
									onChange={(event) => setUnitProvince(event.target.value)}
								>
									<option value="all">Tất cả tỉnh/thành</option>
									{provinceOptions.map((province) => (
										<option key={province} value={province}>
											{province}
										</option>
									))}
								</select>
							</label>
							<label className="misa-filter-field misa-unit-select">
								<span>Đơn vị đang xem</span>
								<div className="misa-filter-control">
									<Building2 size={17} />
									<select
										value={selectedUnitId}
										disabled={!filteredUnits.length}
										onChange={(event) => {
											setSelectedUnitId(event.target.value);
											setPage(1);
										}}
									>
										{!filteredUnits.length && (
											<option value="">Không có đơn vị phù hợp</option>
										)}
										{filteredUnits.map((unit) => (
											<option key={unit.id} value={unit.id}>
												{unit.name}
												{unit.customerCode ? ` · ${unit.customerCode}` : ""}
											</option>
										))}
									</select>
								</div>
							</label>
							<label className="misa-filter-field misa-kind-select">
								<span>Loại chứng từ</span>
								<select
									value={documentFilter}
									onChange={(event) => {
										setDocumentFilter(event.target.value as DetailFilter);
										setPage(1);
									}}
								>
									<option value="all">Tất cả dữ liệu</option>
									<option value="sale">Đơn hàng bán</option>
									<option value="receipt">Thu tiền</option>
									<option value="adjustment">Điều chỉnh</option>
								</select>
							</label>
							<div className="misa-filter-result">
								<span>Kết quả lọc</span>
								<strong>
									{number.format(filteredUnits.length)} <small>đơn vị</small>
								</strong>
							</div>
						</div>

						{selectedUnit && <SelectedUnitSummary unit={selectedUnit} />}

						{!dataset.detailsAvailable ? (
							<div className="misa-reimport-note">
								<AlertCircle size={18} />
								<div>
									<strong>Cần nhập lại file MISA một lần</strong>
									<span>
										Bản dữ liệu trước chỉ lưu tổng hợp. Nhập lại file để bổ sung
										ngày, đơn hàng, số lượng, đơn giá và toàn bộ chứng từ.
									</span>
								</div>
								<button
									className="button primary"
									type="button"
									onClick={() => inputRef.current?.click()}
								>
									Nhập lại file
								</button>
							</div>
						) : (
							<>
								<div className="table-scroll misa-detail-table">
									<table>
										<thead>
											<tr>
												<th>Ngày</th>
												<th>Số chứng từ</th>
												<th>Diễn giải</th>
												<th>ĐVT</th>
												<th className="numeric">Số lượng</th>
												<th className="numeric">Đơn giá</th>
												<th className="numeric">Phát sinh Nợ</th>
												<th className="numeric">Phát sinh Có</th>
												<th className="numeric">Số dư Nợ</th>
												<th className="numeric">Số dư Có</th>
											</tr>
										</thead>
										<tbody>
											{detailPage.rows.map((row) => {
												const document = documentLabels[row.documentKind];
												return (
													<tr key={row.id}>
														<td>{formatDateOnly(row.date)}</td>
														<td className="misa-document-cell">
															<strong>{row.documentNumber || "—"}</strong>
															<StatusPill tone={document.tone}>
																{document.label}
															</StatusPill>
														</td>
														<td className="misa-description-cell">
															<strong>{row.description || "—"}</strong>
															{row.generalDescription &&
																row.generalDescription !== row.description && (
																	<span className="cell-meta">
																		{row.generalDescription}
																	</span>
																)}
														</td>
														<td>{row.unit || "—"}</td>
														<td className="numeric">
															{formatOptionalNumber(row.quantity)}
														</td>
														<td className="numeric">
															{formatOptionalCurrency(row.unitPrice)}
														</td>
														<td className="numeric">
															{formatOptionalCurrency(row.debit)}
														</td>
														<td className="numeric">
															{formatOptionalCurrency(row.credit)}
														</td>
														<td className="numeric">
															{formatOptionalCurrency(row.balanceDebit)}
														</td>
														<td className="numeric">
															{formatOptionalCurrency(row.balanceCredit)}
														</td>
													</tr>
												);
											})}
										</tbody>
									</table>
									{isLoadingDetails && (
										<div className="misa-table-state">
											Đang tải dữ liệu đơn vị...
										</div>
									)}
									{!isLoadingDetails && detailPage.filteredCount === 0 && (
										<div className="empty-state">
											Không có dữ liệu phù hợp trong đơn vị này.
										</div>
									)}
								</div>
								<footer className="misa-table-footer">
									<span>
										Hiển thị{" "}
										<strong>
											{detailPage.firstVisible}–{detailPage.lastVisible}
										</strong>{" "}
										/ {number.format(detailPage.filteredCount)} dòng
									</span>
									<div>
										<label>
											Hiển thị
											<select
												aria-label="Số dòng MISA mỗi trang"
												value={pageSize}
												onChange={(event) => {
													setPageSize(Number(event.target.value));
													setPage(1);
												}}
											>
												<option value={25}>25</option>
												<option value={50}>50</option>
												<option value={100}>100</option>
											</select>
										</label>
										<PaginationControls
											currentPage={detailPage.page}
											pageCount={detailPage.pageCount}
											onPageChange={setPage}
											previousLabel="Trang dữ liệu trước"
											nextLabel="Trang dữ liệu sau"
											showPageWord
										/>
									</div>
								</footer>
							</>
						)}
					</section>
				</>
			) : (
				<section className="panel misa-empty-state">
					<div>
						<FileSpreadsheet size={27} />
					</div>
					<h2>Chưa có dữ liệu MISA</h2>
					<p>
						Sau khi nhập Excel, hệ thống sẽ lưu toàn bộ chứng từ và cho phép xem
						riêng dữ liệu của từng đơn vị.
					</p>
					<button
						className="button secondary"
						type="button"
						onClick={() => inputRef.current?.click()}
					>
						<Upload size={16} /> Chọn file Excel
					</button>
				</section>
			)}
		</div>
	);
}
