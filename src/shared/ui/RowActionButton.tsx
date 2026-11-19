import {
	Pencil,
	SlidersHorizontal,
	Trash2,
	UserMinus,
	UserX,
} from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

const icons = {
	edit: Pencil,
	inspect: SlidersHorizontal,
	delete: Trash2,
	unassign: UserMinus,
	deactivate: UserX,
};

interface Props
	extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children"> {
	action: keyof typeof icons;
	label: string;
}

export function RowActionButton({
	action,
	label,
	title = label,
	className = "",
	...props
}: Props) {
	const Icon = icons[action];
	const tone =
		action === "delete"
			? "is-danger"
			: action === "unassign" || action === "deactivate"
				? "is-warning"
				: "";
	return (
		<button
			{...props}
			type="button"
			aria-label={label}
			title={title}
			className={["row-action", tone, className].filter(Boolean).join(" ")}
		>
			<Icon className="icon-size-16" aria-hidden="true" />
		</button>
	);
}
