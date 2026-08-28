import { X } from "lucide-react";
import type { FormEventHandler, ReactNode } from "react";

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
}: DialogProps) {
	const Root: "form" | "section" = onSubmit ? "form" : "section";

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Backdrop click closes the modal; the dialog itself remains the semantic interactive surface.
		<div
			className="dialog-overlay"
			role="presentation"
			onMouseDown={(event) => event.target === event.currentTarget && onClose()}
		>
			<Root
				className={`dialog-shell ${className}`.trim()}
				role="dialog"
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
						onClick={onClose}
						aria-label="Đóng"
					>
						<X size={18} />
					</button>
				</header>
				{children}
				<footer>{footer}</footer>
			</Root>
		</div>
	);
}
