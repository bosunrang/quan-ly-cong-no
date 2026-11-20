import type { ComponentPropsWithoutRef } from "react";

const vndPattern = /^(?:\d+|\d{1,3}(?:\.\d{3})+)$/;

export function parseVnd(value: string) {
	const text = value.trim();
	return vndPattern.test(text) ? Number(text.replaceAll(".", "")) : NaN;
}

function formatVnd(value: string) {
	const text = value.trim();
	if (!vndPattern.test(text)) return value;
	const digits = text.replaceAll(".", "");
	return digits.length <= 16
		? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
		: value;
}

interface Props
	extends Omit<
		ComponentPropsWithoutRef<"input">,
		"value" | "onChange" | "type" | "inputMode"
	> {
	value: string;
	onValueChange: (value: string) => void;
}

export function VndAmountInput({ value, onValueChange, ...props }: Props) {
	const display = formatVnd(value);
	return (
		<input
			{...props}
			type="text"
			inputMode="numeric"
			value={display}
			onKeyDown={(event) => {
				const input = event.currentTarget;
				const caret = input.selectionStart;
				if (
					caret === null ||
					input.selectionEnd !== caret ||
					!vndPattern.test(display)
				)
					return;
				if (event.key === "Backspace" && display[caret - 1] === ".")
					input.setSelectionRange(caret - 1, caret - 1);
				if (event.key === "Delete" && display[caret] === ".")
					input.setSelectionRange(caret + 1, caret + 1);
			}}
			onChange={(event) => {
				const input = event.currentTarget;
				const text = input.value;
				const { inputType, data } = event.nativeEvent as InputEvent;
				// Regroup separators moved by a digit edit. Leave malformed pastes
				// and decimal input available for the normal amount validation.
				const digitEdit =
					inputType?.startsWith("delete") ||
					(inputType === "insertText" && /^\d+$/.test(data ?? ""));
				const next = formatVnd(
					digitEdit && vndPattern.test(display) && /^[\d.]*$/.test(text)
						? text.replaceAll(".", "")
						: text,
				);
				if (next !== text) {
					const digitsAfterCaret = text
						.slice(input.selectionStart ?? text.length)
						.replace(/\D/g, "").length;
					let caret = next.length;
					let remaining = digitsAfterCaret;
					while (caret > 0 && remaining > 0) {
						caret -= 1;
						if (next[caret] !== ".") remaining -= 1;
					}
					input.value = next;
					input.setSelectionRange(caret, caret);
				}
				onValueChange(next);
			}}
		/>
	);
}
