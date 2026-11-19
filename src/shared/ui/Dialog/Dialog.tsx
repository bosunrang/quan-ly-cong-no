import { X } from "lucide-react";
import type { FormEventHandler, ReactNode } from "react";
import { useDialogKeyboard } from "./useDialogKeyboard";

type DialogTone = "default" | "warning" | "danger";

interface DialogProps {
	ariaLabelledBy: string;
	eyebrow: string;
	title: string;
	icon: ReactNode;
	children: ReactNode;
	footer: ReactNode;
	onClose: () => void;
	className?: string;
	tone?: DialogTone;
	onSubmit?: FormEventHandler<HTMLFormElement>;
	disableClose?: boolean;
}

export function Dialog({
	ariaLabelledBy,
	eyebrow,
	title,
	icon,
	children,
	footer,
	onClose,
	className = "",
	tone = "default",
	onSubmit,
	disableClose = false,
}: DialogProps) {
	const Root: "form" | "section" = onSubmit ? "form" : "section";
	const keyboard = useDialogKeyboard(onClose, disableClose, tone !== "default");

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Backdrop click closes the modal; the dialog itself remains the semantic interactive surface.
		<div
			className="dialog-overlay"
			role="presentation"
			onMouseDown={(event) =>
				!disableClose && event.target === event.currentTarget && onClose()
			}
		>
			<Root
				{...keyboard}
				className={`dialog-shell ${className}`.trim()}
				role={tone === "danger" ? "alertdialog" : "dialog"}
				aria-modal="true"
				aria-labelledby={ariaLabelledBy}
				onSubmit={onSubmit}
			>
				<header>
					<div className={`dialog-icon ${tone}`}>{icon}</div>
					<div>
						<span>{eyebrow}</span>
						<h3 id={ariaLabelledBy}>{title}</h3>
					</div>
					<button
						className="drawer-close"
						type="button"
						disabled={disableClose}
						onClick={onClose}
						aria-label="Đóng"
					>
						<X className="icon-size-18" />
					</button>
				</header>
				{children}
				<footer>{footer}</footer>
			</Root>
		</div>
	);
}
