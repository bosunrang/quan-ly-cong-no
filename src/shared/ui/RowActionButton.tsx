import {
	KeyRound,
	LockKeyhole,
	LockKeyholeOpen,
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
	password: KeyRound,
	lock: LockKeyhole,
	unlock: LockKeyholeOpen,
};

const tones: Partial<Record<keyof typeof icons, string>> = {
	delete: "is-danger",
	password: "is-info",
	unlock: "is-success",
	unassign: "is-warning",
	deactivate: "is-warning",
	lock: "is-warning",
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
	const tone = tones[action];
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
