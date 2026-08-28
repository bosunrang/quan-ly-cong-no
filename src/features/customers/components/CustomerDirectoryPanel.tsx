import { Eye, FilterX, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import {
	customerGroupLabels,
	customerStatusLabels,
	type Customer,
	type CustomerGroup,
	type CustomerStatus,
} from "../../../domain/customers/customer.model";
import type { SalesEmployee } from "../../../domain/employees/employee.model";
import {
	currentAssignment,
	currentRecipient,
} from "../../../domain/customers/customer.selectors";
import { PaginationControls } from "../../../shared/ui/Pagination/PaginationControls";
import { StatusPill } from "../../../shared/ui/StatusPill";

export type GroupFilter = CustomerGroup | "all";
export type StatusFilter = CustomerStatus | "all";

interface CustomerDirectoryPanelProps {
	customers: Customer[];
	filteredCount: number;
	totalCount: number;
	currentPage: number;
	pageCount: number;
	pageSize: number;
	employees: SalesEmployee[];
	provinces: string[];
	query: string;
	group: GroupFilter;
	province: string;
	employee: string;
	status: StatusFilter;
	filtersActive: boolean;
	onQueryChange: (value: string) => void;
	onGroupChange: (value: GroupFilter) => void;
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
		employees,
		provinces,
		query,
		group,
		province,
		employee,
		status,
		filtersActive,
		onQueryChange,
		onGroupChange,
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

	useEffect(() => {
		void currentPage;
		void pageSize;
		tableRef.current?.scrollTo({ top: 0 });
	}, [currentPage, pageSize]);

	return (
		<section className="panel data-panel customer-data-panel">
			<div className="data-toolbar customer-toolbar">
				<label className="table-search">
					<span className="visually-hidden">Tìm khách hàng</span>
					<Search size={16} />
					<input
						value={query}
						onChange={(event) => onQueryChange(event.target.value)}
						placeholder="Tìm mã MISA, khách hàng, MST, người phụ trách..."
					/>
				</label>
				<select
					aria-label="Lọc nhóm khách hàng"
					value={group}
					onChange={(event) => onGroupChange(event.target.value as GroupFilter)}
				>
					<option value="all">Tất cả nhóm</option>
					<option value="state">Nhà nước</option>
					<option value="private">Tư nhân</option>
				</select>
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
				{filtersActive && (
					<button
						className="row-action reset-filter"
						type="button"
						onClick={onReset}
						title="Xóa bộ lọc"
					>
						<FilterX size={16} />
					</button>
				)}
			</div>
			<div ref={tableRef} className="table-scroll large-table customer-table">
				<table>
					<thead>
						<tr>
							<th>Khách hàng</th>
							<th>Nhóm</th>
							<th>Tỉnh/thành</th>
							<th>Nhân viên phụ trách</th>
							<th>Người nhận chiết khấu</th>
							<th>Trạng thái</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{customers.map((customer) => {
							const assignment = currentAssignment(customer);
							const recipient = currentRecipient(customer);
							const activeRecipientCount = customer.recipients.filter(
								(item) => item.active,
							).length;
							return (
								<tr key={customer.id}>
									<td>
										<strong>{customer.name}</strong>
										<span className="cell-meta">
											{customer.misaCode}
											{customer.taxCode ? ` · MST ${customer.taxCode}` : ""}
										</span>
									</td>
									<td>
										<span className={`customer-group-badge ${customer.group}`}>
											{customerGroupLabels[customer.group]}
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
										{recipient ? (
											<>
												<strong>
													{recipient.fullName}
													{activeRecipientCount > 1 && (
														<span className="recipient-more-count">
															+{activeRecipientCount - 1}
														</span>
													)}
												</strong>
												<span className="cell-meta">
													{recipient.position || "Chưa có chức vụ"} · Mặc định
												</span>
											</>
										) : (
											<span className="missing-value">Chưa thiết lập</span>
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
											<Eye size={16} />
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
