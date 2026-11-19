import { type KeyboardEvent, useLayoutEffect, useRef } from "react";

const focusableSelector =
	'button, input:not([type="hidden"]), select, textarea, a[href], [tabindex], [contenteditable="true"]';

export function keepTabInside(event: KeyboardEvent<HTMLElement>) {
	if (event.key !== "Tab" || event.defaultPrevented) return;
	const { target, currentTarget: surface } = event;
	const focusable = Array.from(
		surface.querySelectorAll<HTMLElement>(focusableSelector),
	).filter(
		(element) =>
			element.tabIndex >= 0 &&
			!element.matches(":disabled") &&
			element.getClientRects().length > 0 &&
			getComputedStyle(element).visibility === "visible",
	);
	const first = focusable[0];
	const last = focusable.at(-1);
	if (!first || !last) {
		event.preventDefault();
		surface.focus();
	} else if (
		(event.shiftKey && target === first) ||
		(!event.shiftKey && target === last) ||
		target === surface
	) {
		event.preventDefault();
		(event.shiftKey ? last : first).focus();
	}
}

export function useDialogKeyboard(
	onClose: () => void,
	disableClose = false,
	preferCancel = false,
) {
	const surface = useRef<HTMLElement | null>(null);
	useLayoutEffect(() => {
		const previous = document.activeElement;
		const dialog = surface.current;
		if (!dialog) return;
		const selector = preferCancel
			? "footer .button.secondary:not(:disabled)"
			: ".drawer-close:not(:disabled)";
		(dialog.querySelector<HTMLElement>(selector) ?? dialog).focus({
			preventScroll: true,
		});
		return () => {
			if (previous instanceof HTMLElement && previous.isConnected)
				previous.focus({ preventScroll: true });
		};
	}, [preferCancel]);

	useLayoutEffect(() => {
		const dialog = surface.current;
		const active = document.activeElement;
		if (disableClose && dialog && (!dialog.contains(active) || active?.matches(":disabled"))) {
			dialog.focus({ preventScroll: true });
		}
	}, [disableClose]);

	function onKeyDown(event: KeyboardEvent<HTMLElement>) {
		const { target, currentTarget: dialog } = event;
		if (
			event.defaultPrevented ||
			!(target instanceof HTMLElement) ||
			!dialog.contains(target)
		)
			return;
		if (event.key === "Escape" && !disableClose) {
			if (
				target instanceof HTMLSelectElement &&
				CSS.supports("selector(select:open)") &&
				target.matches(":open")
			)
				return;
			event.preventDefault();
			event.stopPropagation();
			onClose();
			return;
		}
		keepTabInside(event);
	}

	return {
		ref: (element: HTMLElement | null) => {
			surface.current = element;
		},
		tabIndex: -1,
		onKeyDown,
	};
}
