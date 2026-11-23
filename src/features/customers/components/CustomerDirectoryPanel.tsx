import { FilterX, Search, SlidersHorizontal } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import {
	customerStatusLabels,
	type Customer,
	type CustomerStatus,
} from "../../../domain/customers/customer.model";
import { currentAssignment } from "../../../domain/customers/customer.selectors";
import type { SalesEmployee } from "../../../domain/employees/employee.model";
import { PaginationControls } from "../../../shared/ui/Pagination/PaginationControls";
import { StatusPill } from "../../../shared/ui/StatusPill";

export type StatusFilter = CustomerStatus | "all";

interface CustomerDirectoryPanelProps {
	customers: Customer[];
	filteredCount: number;
	totalCount: number;
	currentPage: number;
	pageCount: number;
	pageSize: number;
	showEmployeeFilter: boolean;
	employees: SalesEmployee[];
	provinces: string[];
	query: string;
	province: string;
	employee: string;
	status: StatusFilter;
	filtersActive: boolean;
	filterKey: string;
	onQueryChange: (value: string) => void;
	onProvinceChange: (value: string) => void;
	onEmployeeChange: (value: string) => void;
	onStatusChange: (value: StatusFilter) => void;
	onReset: () => void;
	onOpen: (customerId: string) => void;
	onPageChange: (page: number) => void;
	onPageSizeChange: (pageSize: number) => void;
}

export function CustomerDirectoryPanel(props: CustomerDirectoryPanelProps) {
	const {
		customers,
		filteredCount,
		totalCount,
		currentPage,
		pageCount,
		pageSize,
		showEmployeeFilter,
		employees,
		provinces,
		query,
		province,
		employee,
		status,
		filtersActive,
		filterKey,
		onQueryChange,
		onProvinceChange,
		onEmployeeChange,
		onStatusChange,
		onReset,
		onOpen,
		onPageChange,
		onPageSizeChange,
	} = props;
	const tableRef = useRef<HTMLDivElement>(null);
	const firstVisible =
		filteredCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
	const lastVisible = Math.min(currentPage * pageSize, filteredCount);

	useLayoutEffect(() => {
		void currentPage;
		void pageSize;
		void filterKey;
		tableRef.current?.scrollTo({ top: 0 });
	}, [currentPage, pageSize, filterKey]);

	return (
		<section className="panel data-panel customer-data-panel">
			<div className="data-toolbar customer-toolbar">
				<label className="table-search">
					<span className="visually-hidden">Tìm khách hàng</span>
					<Search className="icon-size-16" />
					<input
						value={query}
						onChange={(event) => onQueryChange(event.target.value)}
						placeholder="Tìm mã MISA, khách hàng, MST, người phụ trách..."
					/>
				</label>
				<select
					aria-label="Lọc tỉnh thành"
					value={province}
					onChange={(event) => onProvinceChange(event.target.value)}
				>
					<option value="all">Tất cả tỉnh/thành</option>
					{provinces.map((item) => (
						<option key={item}>{item}</option>
					))}
				</select>
				{showEmployeeFilter && (
					<select
						aria-label="Lọc nhân viên"
						value={employee}
						onChange={(event) => onEmployeeChange(event.target.value)}
					>
						<option value="all">Tất cả nhân viên</option>
						{employees.map((item) => (
							<option key={item.id} value={item.id}>
								{item.name}
							</option>
						))}
					</select>
				)}
				<select
					aria-label="Lọc trạng thái"
					value={status}
					onChange={(event) =>
						onStatusChange(event.target.value as StatusFilter)
					}
				>
					<option value="all">Tất cả trạng thái</option>
					<option value="active">Đang hoạt động</option>
					<option value="paused">Tạm ngưng</option>
				</select>
				<button
					className="row-action reset-filter"
					type="button"
					onClick={onReset}
					aria-label="Xóa bộ lọc"
					title="Xóa bộ lọc"
					disabled={!filtersActive}
				>
					<FilterX className="icon-size-16" />
				</button>
			</div>
			<div ref={tableRef} className="table-scroll large-table customer-table">
				<table>
					<thead>
						<tr>
							<th>Khách hàng</th>
							<th>Tỉnh/thành</th>
							<th>Nhân viên phụ trách</th>
							<th>Thời hạn công nợ</th>
							<th>Trạng thái</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{customers.map((customer) => {
							const assignment = currentAssignment(customer);
							return (
								<tr key={customer.id}>
									<td>
										<strong className="table-customer-name">
											{customer.name}
										</strong>
										<span className="cell-meta">
											{customer.misaCode}
											{customer.taxCode ? ` · MST ${customer.taxCode}` : ""}
										</span>
									</td>
									<td>
										{customer.province}
										<span className="cell-meta">
											{customer.address || "Chưa có địa chỉ"}
										</span>
									</td>
									<td>
										{assignment ? (
											<>
												<strong>{assignment.employeeName}</strong>
												<span className="cell-meta">Phân công theo đơn vị</span>
											</>
										) : (
											<span className="missing-value">Chưa phân công</span>
										)}
									</td>
									<td>
										{customer.paymentTermDays == null ? (
											<span className="missing-value">Chưa thiết lập</span>
										) : (
											`${customer.paymentTermDays} ngày`
										)}
									</td>
									<td>
										<StatusPill
											tone={
												customer.status === "active" ? "success" : "neutral"
											}
										>
											{customerStatusLabels[customer.status]}
										</StatusPill>
									</td>
									<td>
										<button
											className="row-action"
											type="button"
											onClick={() => onOpen(customer.id)}
											aria-label={`Mở hồ sơ ${customer.name}`}
										>
											<SlidersHorizontal className="icon-size-16" />
										</button>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
				{customers.length === 0 && (
					<div className="empty-state">
						<strong>Không tìm thấy khách hàng</strong>
						<span>Thử thay đổi từ khóa hoặc xóa bớt điều kiện lọc.</span>
						{filtersActive && (
							<button className="text-button" type="button" onClick={onReset}>
								Xóa toàn bộ bộ lọc
							</button>
						)}
					</div>
				)}
			</div>
			<footer className="customer-table-footer">
				<div className="customer-page-summary">
					Hiển thị{" "}
					<strong>
						{firstVisible}–{lastVisible}
					</strong>{" "}
					/ {filteredCount} khách hàng
					{filtersActive && <span> · Tổng danh mục {totalCount}</span>}
				</div>
				<div className="customer-pagination">
					<label>
						Hiển thị
						<select
							aria-label="Số khách hàng mỗi trang"
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
						previousLabel="Trang khách hàng trước"
						nextLabel="Trang khách hàng sau"
						showPageWord
					/>
				</div>
			</footer>
		</section>
	);
}
