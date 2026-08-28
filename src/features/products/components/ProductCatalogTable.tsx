import { Search, Settings2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Product } from "../../../domain/products/product.model";
import { formatTimestamp } from "../../../shared/lib/date";
import { PaginationControls } from "../../../shared/ui/Pagination/PaginationControls";
import { StatusPill } from "../../../shared/ui/StatusPill";

interface ProductCatalogTableProps {
	products: Product[];
	filteredCount: number;
	totalCount: number;
	activeCustomerCount: number;
	customerCoverage: ReadonlyMap<string, number>;
	groups: string[];
	query: string;
	group: string;
	currentPage: number;
	pageCount: number;
	pageSize: number;
	firstVisible: number;
	lastVisible: number;
	filtersActive: boolean;
	onQueryChange: (value: string) => void;
	onGroupChange: (value: string) => void;
	onOpen: (productId: string) => void;
	onPageChange: (page: number) => void;
	onPageSizeChange: (pageSize: number) => void;
}

export function ProductCatalogTable(props: ProductCatalogTableProps) {
	const {
		products,
		filteredCount,
		totalCount,
		activeCustomerCount,
		customerCoverage,
		groups,
		query,
		group,
		currentPage,
		pageCount,
		pageSize,
		firstVisible,
		lastVisible,
		filtersActive,
		onQueryChange,
		onGroupChange,
		onOpen,
		onPageChange,
		onPageSizeChange,
	} = props;
	const tableRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		void currentPage;
		void pageSize;
		tableRef.current?.scrollTo({ top: 0 });
	}, [currentPage, pageSize]);

	return (
		<section className="panel data-panel product-data-panel">
			<div className="data-toolbar product-toolbar">
				<label className="table-search">
					<span className="visually-hidden">Tìm sản phẩm</span>
					<Search size={16} />
					<input
						value={query}
						onChange={(event) => onQueryChange(event.target.value)}
						placeholder="Tìm mã hoặc tên sản phẩm..."
					/>
				</label>
				<select
					aria-label="Lọc nhóm sản phẩm"
					value={group}
					onChange={(event) => onGroupChange(event.target.value)}
				>
					<option value="all">Tất cả nhóm sản phẩm</option>
					{groups.map((item) => (
						<option key={item}>{item}</option>
					))}
				</select>
			</div>
			<div ref={tableRef} className="table-scroll large-table product-table">
				<table>
					<colgroup>
						<col className="product-column" />
						<col className="unit-column" />
						<col className="group-column" />
						<col className="coverage-column" />
						<col className="missing-column" />
						<col className="updated-column" />
						<col className="status-column" />
						<col className="action-column" />
					</colgroup>
					<thead>
						<tr>
							<th>Sản phẩm</th>
							<th>ĐVT</th>
							<th>Nhóm</th>
							<th>Đơn vị có chính sách</th>
							<th>Còn thiếu</th>
							<th>Cập nhật gần nhất</th>
							<th>Trạng thái</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{products.map((product) => {
							const coverage = customerCoverage.get(product.id) ?? 0;
							const missing =
								product.status === "active"
									? Math.max(0, activeCustomerCount - coverage)
									: 0;
							return (
								<tr key={product.id} onDoubleClick={() => onOpen(product.id)}>
									<td>
										<strong title={product.name}>{product.name}</strong>
										<span className="cell-meta">{product.code}</span>
									</td>
									<td>{product.unit}</td>
									<td>{product.group || "Chưa phân nhóm"}</td>
									<td>
										<div className="coverage-cell">
											<strong>
												{coverage}/{activeCustomerCount}
											</strong>
											<div>
												<i
													style={{
														width: `${activeCustomerCount ? (coverage / activeCustomerCount) * 100 : 0}%`,
													}}
												/>
											</div>
										</div>
									</td>
									<td>
										{product.status === "paused" ? (
											<StatusPill tone="neutral">Không tính</StatusPill>
										) : missing > 0 ? (
											<StatusPill tone="warning">{missing} đơn vị</StatusPill>
										) : (
											<StatusPill tone="success">Đã đủ</StatusPill>
										)}
									</td>
									<td>{formatTimestamp(product.updatedAt)}</td>
									<td>
										<StatusPill
											tone={product.status === "active" ? "success" : "neutral"}
										>
											{product.status === "active" ? "Hoạt động" : "Tạm ngưng"}
										</StatusPill>
									</td>
									<td>
										<button
											className="row-action"
											type="button"
											onClick={() => onOpen(product.id)}
											aria-label={`Mở chính sách ${product.name}`}
										>
											<Settings2 size={16} />
										</button>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
				{filteredCount === 0 && (
					<div className="empty-state">Không tìm thấy sản phẩm phù hợp.</div>
				)}
			</div>
			<footer className="product-table-footer">
				<div className="product-page-summary">
					Hiển thị{" "}
					<strong>
						{firstVisible}–{lastVisible}
					</strong>{" "}
					/ {filteredCount} sản phẩm
					{filtersActive && <span> · Tổng danh mục {totalCount}</span>}
				</div>
				<div className="product-pagination">
					<label>
						Hiển thị
						<select
							aria-label="Số sản phẩm mỗi trang"
							value={pageSize}
							onChange={(event) => onPageSizeChange(Number(event.target.value))}
						>
							<option value={25}>25</option>
							<option value={50}>50</option>
							<option value={100}>100</option>
						</select>
					</label>
					<PaginationControls
						currentPage={currentPage}
						pageCount={pageCount}
						onPageChange={onPageChange}
						previousLabel="Trang sản phẩm trước"
						nextLabel="Trang sản phẩm sau"
						showPageWord
					/>
				</div>
			</footer>
		</section>
	);
}
