import type { LucideIcon } from "lucide-react";
import { ArrowRight, Construction } from "lucide-react";

interface PlaceholderPageProps {
	title: string;
	description: string;
	icon: LucideIcon;
	bullets: string[];
}

export function PlaceholderPage({
	title,
	description,
	icon: Icon,
	bullets,
}: PlaceholderPageProps) {
	return (
		<div className="page-stack">
			<section className="placeholder-hero">
				<div className="placeholder-icon">
					<Icon size={30} />
				</div>
				<span className="placeholder-tag">
					<Construction size={14} /> BỘ KHUNG GIAO DIỆN
				</span>
				<h2>{title}</h2>
				<p>{description}</p>
			</section>
			<section className="panel placeholder-panel">
				<div className="panel-header">
					<div>
						<h3>Các chức năng sẽ triển khai</h3>
						<p>Cấu trúc màn hình đã được đặt sẵn trong điều hướng.</p>
					</div>
				</div>
				<div className="feature-list">
					{bullets.map((bullet, index) => (
						<div key={bullet}>
							<span>{String(index + 1).padStart(2, "0")}</span>
							<p>{bullet}</p>
							<ArrowRight size={16} />
						</div>
					))}
				</div>
			</section>
		</div>
	);
}
