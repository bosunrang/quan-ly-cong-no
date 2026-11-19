import { type ComponentProps, act, createElement } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DateInput } from "../src/shared/ui/DateInput/DateInput";
import { Dialog } from "../src/shared/ui/Dialog/Dialog";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.unstubAllGlobals();
});

function renderDialog(overrides: Partial<ComponentProps<typeof Dialog>>) {
	const props = {
		ariaLabelledBy: "test-dialog-title",
		eyebrow: "Kiểm tra",
		title: "Hộp thoại",
		icon: null,
		children: null,
		footer: null,
		onClose: vi.fn(),
		...overrides,
	};
	return act(async () => root.render(createElement(Dialog, props)));
}

it("mở lịch trong hộp thoại và trả focus về nút chọn ngày khi bấm Escape", async () => {
	const onClose = vi.fn();
	await renderDialog({
		children: createElement(DateInput, {
			value: "2026-11-19",
			onChange: vi.fn(),
		}),
		onClose,
	});
	const trigger = container.querySelector<HTMLButtonElement>(".datepick");
	await act(async () => {
		trigger?.focus();
		trigger?.click();
	});
	const calendar = document.querySelector(".vn-date-picker");
	expect(calendar).not.toBeNull();
	expect(document.activeElement).toBe(calendar?.querySelector(".selected"));

	const pressEscape = () =>
		document.activeElement?.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "Escape",
				bubbles: true,
				cancelable: true,
			}),
		);
	await act(async () => {
		pressEscape();
	});
	expect(document.querySelector(".vn-date-picker")).toBeNull();
	expect(document.activeElement).toBe(trigger);
	expect(onClose).not.toHaveBeenCalled();
	await act(async () => {
		pressEscape();
	});
	expect(onClose).toHaveBeenCalledOnce();
});

it("giữ focus trong hộp thoại khi nút đang focus bị khóa", async () => {
	const render = (disabled: boolean) =>
		renderDialog({
			footer: createElement(
				"button",
				{ className: "button primary", type: "button", disabled },
				"Nhập",
			),
			disableClose: disabled,
		});
	await render(false);
	const button = container.querySelector<HTMLButtonElement>(".button.primary");
	button?.focus();
	expect(document.activeElement).toBe(button);

	await render(true);
	expect(button?.disabled).toBe(true);
	expect(document.activeElement).toBe(
		container.querySelector('[role="dialog"]'),
	);
});
