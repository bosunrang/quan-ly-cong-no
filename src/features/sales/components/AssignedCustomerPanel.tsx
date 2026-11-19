import { Building2, MapPin, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Customer } from "../../../domain/customers/customer.model";
import { usePagination } from "../../../shared/hooks/usePagination";
import { PaginationControls } from "../../../shared/ui/Pagination/PaginationControls";
import { RowActionButton } from "../../../shared/ui/RowActionButton";

interface AssignedCustomerPanelProps {
	ownerKey: string;
	employeeName?: string;
	customers: Customer[];
	onOpen: (customerId: string) => void;
	onUnassign: (customerId: string) => void;
}

export function AssignedCustomerPanel({
	ownerKey,
	employeeName,
	customers,
	onOpen,
	onUnassign,
}: AssignedCustomerPanelProps) {
	const [query, setQuery] = useState("");
	const normalizedQuery = query.trim().toLocaleLowerCase("vi-VN");
	const visibleCustomers = useMemo(
		() =>
			customers.filter((customer) =>
				`${customer.name} ${customer.misaCode} ${customer.province} ${customer.address}`
					.toLocaleLowerCase("vi-VN")
					.includes(normalizedQuery),
			),
		[customers, normalizedQuery],
	);
	const {
		currentPage,
		pageCount,
		pageItems: pagedCustomers,
		firstVisible,
		lastVisible,
		setCurrentPage,
		resetPage,
	} = usePagination(visibleCustomers);

	useEffect(() => {
		void ownerKey;
		resetPage();
		setQuery("");
	}, [ownerKey, resetPage]);

	useEffect(() => {
		void normalizedQuery;
		resetPage();
	}, [normalizedQuery, resetPage]);

	return (
		<aside className="panel assigned-panel">
			<header className="sales-panel-head">
				<div>
					<span>PHÂN CÔNG HIỆN TẠI</span>
					<h2>Đơn vị của {employeeName ?? "nhân viên"}</h2>
					<p>Kết quả đang có, không phải lựa chọn mới</p>
				</div>
				<span className="sales-result-count teal">
					{customers.length} đơn vị
				</span>
			</header>
			<label className="sales-search assigned-customer-search">
				<span className="visually-hidden">Tìm đơn vị đang phụ trách</span>
				<Search className="icon-size-16" />
				<input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Tìm trong danh sách này..."
				/>
			</label>
			<div className="assigned-customer-list">
				{pagedCustomers.map((customer) => (
					<article key={customer.id}>
						<span className="assigned-building">
							<Building2 className="icon-size-16" />
						</span>
						<div>
							<strong>{customer.name}</strong>
							<span className="assigned-customer-meta">
								<span>{customer.misaCode}</span>
								<small>
									<MapPin className="icon-size-12" /> {customer.province}
								</small>
							</span>
						</div>
						<RowActionButton
							action="inspect"
							className="assigned-detail-button"
							onClick={() => onOpen(customer.id)}
							label={`Xem chi tiết ${customer.name}`}
							title="Xem chi tiết khách hàng"
						/>
						<RowActionButton
							action="unassign"
							className="unassign-customer-button"
							onClick={() => onUnassign(customer.id)}
							label={`Bỏ phân công ${customer.name}`}
							title="Bỏ khỏi người phụ trách"
						/>
					</article>
				))}
				{visibleCustomers.length === 0 && (
					<div className="sales-empty large">
						<UserRound className="icon-size-24" />
						<strong>
							{query ? "Không tìm thấy đơn vị" : "Chưa phụ trách đơn vị nào"}
						</strong>
						<span>
							{query
								? "Thử thay đổi từ khóa tìm kiếm."
								: "Nhân viên này chưa được giao đơn vị nào."}
						</span>
					</div>
				)}
			</div>
			<div className="sales-pagination assigned-pagination">
				<span>
					{firstVisible}–{lastVisible} / {visibleCustomers.length}
				</span>
				<PaginationControls
					currentPage={currentPage}
					pageCount={pageCount}
					onPageChange={setCurrentPage}
					previousLabel="Trang đang phụ trách trước"
					nextLabel="Trang đang phụ trách sau"
				/>
			</div>
		</aside>
	);
}
