import { LogOut, Menu } from "lucide-react";
import {
	roleLabels,
	type AccountRole,
} from "../../domain/access/accounts.model";

interface HeaderProps {
	title: string;
	subtitle: string;
	onMenuClick: () => void;
	name: string;
	role: AccountRole;
	onLogout?: () => void;
}

export function Header({
	title,
	subtitle,
	onMenuClick,
	name,
	role,
	onLogout,
}: HeaderProps) {
	const initials = name
		.split(/\s+/)
		.slice(-2)
		.map((word) => word[0])
		.join("")
		.toLocaleUpperCase("vi");
	return (
		<header className="topbar">
			<div className="topbar-title-wrap">
				<button
					className="mobile-menu"
					type="button"
					onClick={onMenuClick}
					aria-label="Mở điều hướng"
				>
					<Menu className="icon-size-20" />
				</button>
				<div>
					<h1>{title}</h1>
					<p>{subtitle}</p>
				</div>
			</div>

			<div className="topbar-actions">
				<div className="profile-menu">
					<div className="avatar" aria-hidden="true">
						{initials}
					</div>
					<div className="profile-copy">
						<strong>{name}</strong>
						<span>{roleLabels[role]}</span>
					</div>
				</div>
				{onLogout && (
					<button
						className="row-action"
						type="button"
						aria-label="Đăng xuất"
						title="Đăng xuất"
						onClick={onLogout}
					>
						<LogOut className="icon-size-16" aria-hidden="true" />
					</button>
				)}
			</div>
		</header>
	);
}
