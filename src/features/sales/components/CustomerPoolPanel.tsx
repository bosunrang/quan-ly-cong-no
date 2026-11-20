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
import type { Customer } from "../../../domain/customers/customer.model";
import type { SalesEmployee } from "../../../domain/employees/employee.model";
import {
	activeSalesAssignment,
	canAssignCustomer,
} from "../../../domain/assignments/assignment.service";
import { PaginationControls } from "../../../shared/ui/Pagination/PaginationControls";
import { StatusPill, type StatusTone } from "../../../shared/ui/StatusPill";

export type CustomerScope = "unassigned" | "other" | "owned" | "all";

interface CustomerPoolPanelProps {
	selfService: boolean;
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
	selectedIds: ReadonlySet<string>;
	transferCount: number;
	eligibleCount: number;
	onProvinceChange: (value: string) => void;
	onQueryChange: (value: string) => void;
	onScopeChange: (value: CustomerScope) => void;
	onPageChange: (page: number) => void;
	onToggle: (customer: Customer) => void;
	onSelectAll: () => void;
	onClearSelection: () => void;
	onAssign: () => void;
}

export function CustomerPoolPanel(props: CustomerPoolPanelProps) {
	const {
		selfService,
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
		eligibleCount,
		onProvinceChange,
		onQueryChange,
		onScopeChange,
		onPageChange,
		onToggle,
		onSelectAll,
		onClearSelection,
		onAssign,
	} = props;
	const listRef = useRef<HTMLDivElement>(null);
	const firstVisible =
		filteredCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
	const lastVisible = Math.min(currentPage * pageSize, filteredCount);
	const canSelectAll =
		employee?.status === "active" && province !== "all" && eligibleCount > 0;
	const hasSelection = selectedIds.size > 0;
	const allSelected = canSelectAll && selectedIds.size === eligibleCount;

	useEffect(() => {
		void currentPage;
		listRef.current?.scrollTo({ top: 0 });
	}, [currentPage]);

	return (
		<section className="panel customer-pool-panel">
			<header className="sales-panel-head">
				<div>
					<span>BƯỚC 2</span>
					<h2>{selfService ? "Chọn đơn vị để nhận" : "Chọn đơn vị để giao"}</h2>
					<p>Lọc theo khu vực để chọn nhiều khách hàng cùng lúc</p>
				</div>
				<span className="sales-result-count">{filteredCount} đơn vị</span>
			</header>
			<div className="customer-pool-filters">
				<div className="customer-pool-filter-row">
					<label>
						<MapPin className="icon-size-16" />
						<select
							aria-label="Chọn tỉnh thành"
							value={province}
							onChange={(event) => onProvinceChange(event.target.value)}
						>
							<option value="all">Tất cả tỉnh/thành</option>
							{provinces.map((item) => (
								<option key={item} value={item}>
									{item || "Chưa có khu vực"}
								</option>
							))}
						</select>
					</label>
					<label className="pool-search">
						<span className="visually-hidden">Tìm đơn vị để phân công</span>
						<Search className="icon-size-16" />
						<input
							value={query}
							onChange={(event) => onQueryChange(event.target.value)}
							placeholder="Tìm tên, mã MISA, MST..."
						/>
					</label>
				</div>
				<fieldset
					className={`filter-switch customer-scope-tabs${selfService ? " customer-scope-tabs--self-service" : ""}`}
				>
					<legend className="visually-hidden">Lọc tình trạng phân công</legend>
					{(
						[
							["unassigned", "Chưa phân công"],
							["other", "Của người khác"],
							["owned", selfService ? "Đang phụ trách" : "Của nhân viên này"],
							["all", "Tất cả"],
						] as const
					)
						.filter(([value]) => !selfService || value !== "other")
						.map(([value, label]) => (
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
			<div className="pool-bulk-row">
				<label className="pool-bulk-check">
					<input
						type="checkbox"
						ref={(input) => {
							if (input) input.indeterminate = hasSelection && !allSelected;
						}}
						checked={allSelected}
						disabled={!canSelectAll && !hasSelection}
						aria-describedby="pool-bulk-help"
						onChange={() => {
							if (allSelected || !canSelectAll) onClearSelection();
							else onSelectAll();
						}}
					/>
					<span>
						{!canSelectAll && hasSelection
							? `Bỏ chọn (${selectedIds.size})`
							: `Chọn tất cả${province === "all" ? "" : ` (${eligibleCount})`}`}
					</span>
				</label>
				<span className="visually-hidden" id="pool-bulk-help">
					{province === "all"
						? "Chọn tỉnh/thành để chọn hàng loạt"
						: "Áp dụng cho mọi trang theo bộ lọc"}
				</span>
			</div>
			<div ref={listRef} className="customer-pool-list">
				{customers.map((customer) => {
					const assignment = activeSalesAssignment(customer);
					const isOwned = Boolean(
						assignment && employee && assignment.employeeId === employee.id,
					);
					const isOther = Boolean(assignment && !isOwned);
					const isChecked = selectedIds.has(customer.id);
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
							className={`pool-customer choice-card ${isOwned ? "is-owned" : ""} ${isOther ? "is-other" : ""} ${isPaused || employee?.status === "inactive" ? "is-paused" : ""} ${isChecked ? "is-checked" : ""}`}
						>
							<input
								type="checkbox"
								checked={isChecked}
								disabled={!canAssignCustomer(customer, employee)}
								onChange={() => onToggle(customer)}
							/>
							<span className="pool-checkbox">
								{isChecked ? (
									<Check className="icon-size-14" />
								) : isOwned ? (
									<UserCheck className="icon-size-14" />
								) : null}
							</span>
							<span className="pool-customer-copy">
								<strong>{customer.name}</strong>
								<small>
									{[customer.misaCode, customer.address]
										.filter(Boolean)
										.join(" · ")}
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
						<Building2 className="icon-size-24" />
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
						<ListChecks className="icon-size-18" />
					</span>
					<div>
						<strong role="status">
							{selectedIds.size
								? `${selectedIds.size} khách hàng đã chọn`
								: "Chưa chọn đơn vị nào"}
						</strong>
						<span>
							{selectedIds.size
								? transferCount
									? `${transferCount} đơn vị sẽ được chuyển giao`
									: selfService
										? "Sẵn sàng nhận phụ trách"
										: `Sẵn sàng giao cho ${employee?.name ?? "nhân viên"}`
								: ""}
						</span>
					</div>
				</div>
				<button
					className="button primary"
					type="button"
					disabled={employee?.status !== "active" || selectedIds.size === 0}
					onClick={onAssign}
				>
					{employee?.status === "inactive"
						? "Nhân viên đã ngừng hoạt động"
						: selfService
							? "Nhận phụ trách"
							: `Giao cho ${employee?.name ?? "nhân viên"}`}{" "}
					{employee?.status === "active" && (
						<ArrowRight className="icon-size-16" />
					)}
				</button>
			</footer>
		</section>
	);
}
