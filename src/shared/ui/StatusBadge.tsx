import { AlertCircle, CheckCircle2, CircleDashed, Clock3 } from "lucide-react";
import { StatusPill, type StatusTone } from "./StatusPill";

type StatusBadgeStatus = "eligible" | "pending" | "paid" | "review";

const labels: Record<StatusBadgeStatus, string> = {
	eligible: "Đủ điều kiện chi",
	pending: "Chưa thu đủ",
	paid: "Đã chi",
	review: "Cần kiểm tra",
};

export function StatusBadge({ status }: { status: StatusBadgeStatus }) {
	const Icon =
		status === "eligible"
			? CheckCircle2
			: status === "paid"
				? CircleDashed
				: status === "review"
					? AlertCircle
					: Clock3;
	const tone: StatusTone =
		status === "eligible"
			? "success"
			: status === "paid"
				? "info"
				: status === "review"
					? "danger"
					: "warning";
	return (
		<StatusPill tone={tone} icon={<Icon size={14} />}>
			{labels[status]}
		</StatusPill>
	);
}
