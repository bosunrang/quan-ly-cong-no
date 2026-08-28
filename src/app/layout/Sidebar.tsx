import { ChevronLeft, ShieldCheck } from "lucide-react";
import { navGroups } from "../navigation";
import type { AppSettings } from "../../domain/settings/settings.model";
import type { PageId } from "../../types";

interface SidebarProps {
	activePage: PageId;
	collapsed: boolean;
	settings: AppSettings;
	onChange: (page: PageId) => void;
	onToggle: () => void;
}

export function Sidebar({
	activePage,
	collapsed,
	settings,
	onChange,
	onToggle,
}: SidebarProps) {
	return (
		<aside
			className={`sidebar ${collapsed ? "is-collapsed" : ""}`}
			aria-label="Điều hướng ứng dụng"
		>
			<div className="brand">
				<div className="brand-mark">
					{settings.logoDataUrl ? (
						<img src={settings.logoDataUrl} alt="Logo phần mềm" />
					) : (
						<span>MK</span>
					)}
				</div>
				{!collapsed && (
					<div className="brand-copy">
						<strong>{settings.displayName}</strong>
						<span>{settings.tagline}</span>
					</div>
				)}
				<button
					className="sidebar-toggle"
					type="button"
					onClick={onToggle}
					aria-label={
						collapsed ? "Mở thanh điều hướng" : "Thu gọn thanh điều hướng"
					}
				>
					<ChevronLeft size={17} />
				</button>
			</div>

			<div className="sync-status">
				<span className="sync-dot" />
				{!collapsed && <span>Dữ liệu cục bộ</span>}
			</div>

			<nav className="nav-groups" aria-label="Điều hướng chính">
				{navGroups.map((group) => (
					<div className="nav-group" key={group.label}>
						{!collapsed && <div className="nav-group-label">{group.label}</div>}
						{group.items.map((item) => {
							const Icon = item.icon;
							const active = item.id === activePage;
							return (
								<button
									type="button"
									className={`nav-item ${active ? "is-active" : ""}`}
									key={item.id}
									onClick={() => onChange(item.id)}
									title={collapsed ? item.label : undefined}
									aria-current={active ? "page" : undefined}
								>
									<Icon size={18} strokeWidth={1.9} />
									{!collapsed && <span>{item.label}</span>}
								</button>
							);
						})}
					</div>
				))}
			</nav>

			<div className="sidebar-footer">
				<div className="security-mark">
					<ShieldCheck size={18} />
				</div>
				{!collapsed && (
					<div>
						<strong>Phiên bản nội bộ</strong>
						<span>Khung giao diện v0.1</span>
					</div>
				)}
			</div>
		</aside>
	);
}
