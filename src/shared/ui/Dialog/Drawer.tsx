import type { ReactNode } from "react";
import { useDialogKeyboard } from "./useDialogKeyboard";

interface Props {
	ariaLabelledBy: string;
	className?: string;
	overlayClassName?: string;
	onClose: () => void;
	children: ReactNode;
}

export function Drawer({
	ariaLabelledBy,
	className = "customer-drawer",
	overlayClassName = "customer-overlay",
	onClose,
	children,
}: Props) {
	const keyboard = useDialogKeyboard(onClose);
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Keep outside click separate from the semantic dialog.
		<div
			className={overlayClassName}
			role="presentation"
			onMouseDown={(event) => event.target === event.currentTarget && onClose()}
		>
			<aside
				{...keyboard}
				className={className}
				role="dialog"
				aria-modal="true"
				aria-labelledby={ariaLabelledBy}
			>
				{children}
			</aside>
		</div>
	);
}
