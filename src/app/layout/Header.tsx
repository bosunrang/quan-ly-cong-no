import { ChevronDown, CloudOff, Menu } from "lucide-react";

interface HeaderProps {
	title: string;
	subtitle: string;
	onMenuClick: () => void;
}

export function Header({ title, subtitle, onMenuClick }: HeaderProps) {
	return (
		<header className="topbar">
			<div className="topbar-title-wrap">
				<button
					className="mobile-menu"
					type="button"
					onClick={onMenuClick}
					aria-label="Mở điều hướng"
				>
					<Menu size={20} />
				</button>
				<div>
					<h1>{title}</h1>
					<p>{subtitle}</p>
				</div>
			</div>

			<div className="topbar-actions">
				<div className="profile-menu">
					<div className="avatar">QA</div>
					<div className="profile-copy">
						<strong>Quản trị viên</strong>
						<span>
							<CloudOff size={12} /> Chưa đồng bộ
						</span>
					</div>
					<ChevronDown size={15} />
				</div>
			</div>
		</header>
	);
}
