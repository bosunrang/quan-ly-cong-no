import { ChevronLeft, ShieldCheck } from "lucide-react";
import { version as appVersion } from "../../../package.json";
import {
	canOpenPage,
	type PageAccess,
} from "../../domain/access/accounts.model";
import type { AppSettings } from "../../domain/settings/settings.model";
import { AppLogo } from "../../shared/ui/AppLogo";
import type { PageId } from "../../types";
import { navGroups } from "../navigation";

interface SidebarProps {
	activePage: PageId;
	collapsed: boolean;
	settings: AppSettings;
	access: PageAccess;
	onChange: (page: PageId) => void;
	onToggle: () => void;
}

export function Sidebar({
	activePage,
	collapsed,
	settings,
	access,
	onChange,
	onToggle,
}: SidebarProps) {
	const groups = navGroups
		.map((group) => ({
			...group,
			items: group.items.filter((item) => canOpenPage(access, item.id)),
		}))
		.filter((group) => group.items.length);
	return (
		<aside
			className={`sidebar ${collapsed ? "is-collapsed" : ""}`}
			aria-label="Điều hướng ứng dụng"
		>
			<div className="brand">
				<div className="brand-mark">
					<AppLogo logoDataUrl={settings.logoDataUrl} alt="Logo phần mềm" />
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
					<ChevronLeft className="icon-size-17" />
				</button>
			</div>

			<nav className="nav-groups" aria-label="Điều hướng chính">
				{groups.map((group) => (
					<div className="nav-group" key={group.label}>
						{!collapsed && <div className="nav-group-label">{group.label}</div>}
						<div className="nav-group-items">
							{group.items.map((item) => {
								const Icon = item.icon;
								const active = item.id === activePage;
								return (
									<button
										type="button"
										className={`nav-item ${active ? "is-active" : ""}`}
										key={item.id}
										onClick={() => onChange(item.id)}
										aria-label={item.label}
										title={item.label}
										aria-current={active ? "page" : undefined}
									>
										<Icon className="icon-size-18" />
										{!collapsed && <span>{item.label}</span>}
									</button>
								);
							})}
						</div>
					</div>
				))}
			</nav>

			<div className="sidebar-footer">
				<div className="security-mark">
					<ShieldCheck className="icon-size-18" />
				</div>
				{!collapsed && (
					<div>
						<strong>Phiên bản nội bộ</strong>
						<span>Khung giao diện V{appVersion}</span>
					</div>
				)}
			</div>
		</aside>
	);
}
