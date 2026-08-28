import {
	ArrowRight,
	Building2,
	Check,
	ListChecks,
	MapPin,
	Search,
	UserCheck,
} from "lucide-react";
import { useEffect, useRef } from "react";
import {
	customerGroupLabels,
	type Customer,
} from "../../../domain/customers/customer.model";
import type { SalesEmployee } from "../../../domain/employees/employee.model";
import { activeSalesAssignment } from "../../../domain/assignments/assignment.service";
import { PaginationControls } from "../../../shared/ui/Pagination/PaginationControls";
import { StatusPill, type StatusTone } from "../../../shared/ui/StatusPill";

export type CustomerScope = "unassigned" | "other" | "owned" | "all";

interface CustomerPoolPanelProps {
	customers: Customer[];
	filteredCount: number;
	currentPage: number;
	pageCount: number;
	pageSize: number;
	employee?: SalesEmployee;
	province: string;
	provinces: string[];
	query: string;
	scope: CustomerScope;
	selectedIds: string[];
	transferCount: number;
	onProvinceChange: (value: string) => void;
	onQueryChange: (value: string) => void;
	onScopeChange: (value: CustomerScope) => void;
	onPageChange: (page: number) => void;
	onToggle: (customer: Customer) => void;
	onAssign: () => void;
}

export function CustomerPoolPanel(props: CustomerPoolPanelProps) {
	const {
		customers,
		filteredCount,
		currentPage,
		pageCount,
		pageSize,
		employee,
		province,
		provinces,
		query,
		scope,
		selectedIds,
		transferCount,
		onProvinceChange,
		onQueryChange,
		onScopeChange,
		onPageChange,
		onToggle,
		onAssign,
	} = props;
	const listRef = useRef<HTMLDivElement>(null);
	const firstVisible =
		filteredCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
	const lastVisible = Math.min(currentPage * pageSize, filteredCount);

	useEffect(() => {
		void currentPage;
		listRef.current?.scrollTo({ top: 0 });
	}, [currentPage]);

	return (
		<section className="panel customer-pool-panel">
			<header className="sales-panel-head">
				<div>
					<span>BƯỚC 2</span>
					<h2>Chọn đơn vị để giao</h2>
					<p>Đánh dấu các đơn vị muốn giao cho nhân viên đã chọn</p>
				</div>
				<span className="sales-result-count">{filteredCount} đơn vị</span>
			</header>
			<div className="customer-pool-filters">
				<div className="customer-pool-filter-row">
					<label>
						<MapPin size={16} />
						<select
							aria-label="Chọn tỉnh thành"
							value={province}
							onChange={(event) => onProvinceChange(event.target.value)}
						>
							<option value="all">Tất cả tỉnh/thành</option>
							{provinces.map((item) => (
								<option key={item} value={item}>
									{item}
								</option>
							))}
						</select>
					</label>
					<label className="pool-search">
						<span className="visually-hidden">Tìm đơn vị để phân công</span>
						<Search size={16} />
						<input
							value={query}
							onChange={(event) => onQueryChange(event.target.value)}
							placeholder="Tìm tên, mã MISA, MST..."
						/>
					</label>
				</div>
				<fieldset className="customer-scope-tabs">
					<legend className="visually-hidden">
						Lọc tình trạng phân công
					</legend>
					{([
						["unassigned", "Chưa phân công"],
						["other", "Của người khác"],
						["owned", "Của nhân viên này"],
						["all", "Tất cả"],
					] as const).map(([value, label]) => (
						<button
							key={value}
							className={scope === value ? "is-active" : ""}
							type="button"
							aria-pressed={scope === value}
							onClick={() => onScopeChange(value)}
						>
							{label}
						</button>
					))}
				</fieldset>
			</div>
			<div ref={listRef} className="customer-pool-list">
				{customers.map((customer) => {
					const assignment = activeSalesAssignment(customer);
					const isOwned = Boolean(
						assignment && employee && assignment.employeeId === employee.id,
					);
					const isOther = Boolean(assignment && !isOwned);
					const isChecked = selectedIds.includes(customer.id);
					const isPaused = customer.status !== "active";
					const ownerTone: StatusTone = isOwned
						? "success"
						: isOther
							? "warning"
							: isPaused
								? "danger"
								: "neutral";
					return (
						<label
							key={customer.id}
							className={`pool-customer ${isOwned ? "is-owned" : ""} ${isOther ? "is-other" : ""} ${isPaused || employee?.status === "inactive" ? "is-paused" : ""} ${isChecked ? "is-checked" : ""}`}
						>
							<input
								type="checkbox"
								checked={isChecked}
								disabled={
									isOwned || isPaused || employee?.status === "inactive"
								}
								onChange={() => onToggle(customer)}
							/>
							<span className="pool-checkbox">
								{isChecked ? (
									<Check size={14} />
								) : isOwned ? (
									<UserCheck size={14} />
								) : null}
							</span>
							<span className="pool-customer-copy">
								<strong>{customer.name}</strong>
								<small>
									{customer.misaCode} · {customerGroupLabels[customer.group]} ·{" "}
									{customer.address}
								</small>
							</span>
							<StatusPill className="owner-state" tone={ownerTone}>
								{isOwned
									? `Thuộc ${employee?.name ?? "nhân viên này"}`
									: isOther
										? assignment?.employeeName
										: isPaused
											? "Tạm ngưng"
											: "Chưa phân công"}
							</StatusPill>
						</label>
					);
				})}
				{customers.length === 0 && (
					<div className="sales-empty large">
						<Building2 size={24} />
						<strong>Không có đơn vị phù hợp</strong>
						<span>Thử thay đổi tỉnh/thành hoặc điều kiện lọc.</span>
					</div>
				)}
			</div>
			<div className="sales-pagination pool-pagination">
				<span>
					{firstVisible}–{lastVisible} / {filteredCount}
				</span>
				<PaginationControls
					currentPage={currentPage}
					pageCount={pageCount}
					onPageChange={onPageChange}
					previousLabel="Trang đơn vị trước"
					nextLabel="Trang đơn vị sau"
					showPageWord
				/>
			</div>
			<footer className="pool-selection-bar">
				<div className="pool-selection-summary">
					<span className="pool-selection-icon">
						<ListChecks size={18} />
					</span>
					<div>
						<strong>
							{selectedIds.length
								? `${selectedIds.length} đơn vị đã chọn`
								: "Chưa chọn đơn vị nào"}
						</strong>
						<span>
							{selectedIds.length
								? transferCount
									? `${transferCount} đơn vị sẽ được chuyển giao`
									: `Sẵn sàng giao cho ${employee?.name ?? "nhân viên"}`
								: "Đánh dấu checkbox ở danh sách phía trên"}
						</span>
					</div>
				</div>
				<button
					className="button primary"
					type="button"
					disabled={employee?.status !== "active" || selectedIds.length === 0}
					onClick={onAssign}
				>
					{employee?.status === "inactive"
						? "Nhân viên đã ngừng hoạt động"
						: `Giao cho ${employee?.name ?? "nhân viên"}`}{" "}
					{employee?.status === "active" && <ArrowRight size={16} />}
				</button>
			</footer>
		</section>
	);
}
