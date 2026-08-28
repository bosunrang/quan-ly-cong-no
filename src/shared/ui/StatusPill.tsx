import type { ReactNode } from "react";

export type StatusTone = "success" | "warning" | "info" | "neutral" | "danger";

interface StatusPillProps {
	tone: StatusTone;
	children: ReactNode;
	icon?: ReactNode;
	className?: string;
	title?: string;
}

export function StatusPill({
	tone,
	children,
	icon,
	className = "",
	title,
}: StatusPillProps) {
	return (
		<span
			className={`status-pill status-pill-${tone} ${className}`.trim()}
			title={title}
		>
			{icon}
			<span>{children}</span>
		</span>
	);
}
