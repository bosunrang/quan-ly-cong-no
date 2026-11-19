import {
	AlertCircle,
	AlertTriangle,
	CheckCircle2,
	Info,
	X,
} from "lucide-react";
import type { ReactNode } from "react";

export type NoticeTone = "success" | "info" | "warning" | "danger";

const icons = {
	success: CheckCircle2,
	info: Info,
	warning: AlertTriangle,
	danger: AlertCircle,
};

interface NoticeProps {
	tone: NoticeTone;
	title?: string;
	children: ReactNode;
	floating?: boolean;
	announce?: boolean;
	onDismiss?: () => void;
}

export function Notice({
	tone,
	title,
	children,
	floating = false,
	announce = false,
	onDismiss,
}: NoticeProps) {
	const Icon = icons[tone];
	return (
		<div
			className={`ui-notice ui-notice-${tone}${floating ? " ui-notice-floating" : ""}`}
			role={announce ? (tone === "danger" ? "alert" : "status") : undefined}
		>
			<Icon className="ui-notice-icon icon-size-18" aria-hidden="true" />
			<div className="ui-notice-content">
				{title && <strong>{title}</strong>}
				<div>{children}</div>
			</div>
			{onDismiss && (
				<button
					className="ui-notice-dismiss"
					type="button"
					aria-label="Đóng thông báo"
					onClick={onDismiss}
				>
					<X className="icon-size-16" />
				</button>
			)}
		</div>
	);
}
