import { ChevronDown } from "lucide-react";
import {
	type KeyboardEvent,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { cssPixels } from "../lib/cssPixels";

interface Props {
	id: string;
	label: string;
	value: string;
	options: readonly string[];
	normalize: (value: string) => string;
	placeholder?: string;
	onChange: (value: string) => void;
}

export function SearchableInput({
	id,
	label,
	value,
	options,
	normalize,
	placeholder,
	onChange,
}: Props) {
	const listId = useId();
	const anchor = useRef<HTMLDivElement>(null);
	const input = useRef<HTMLInputElement>(null);
	const popup = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(-1);
	const [filterText, setFilterText] = useState("");
	const [placement, setPlacement] = useState<{
		left: number;
		width: number;
		top?: number;
		bottom?: number;
		maxHeight: number;
	}>();
	const needle = normalize(filterText);
	const matches = options.filter((option) =>
		normalize(option).includes(needle),
	);
	const optionId = (index: number) => `${listId}-option-${index}`;
	const positioned = placement !== undefined;

	useLayoutEffect(() => {
		if (!open) return;
		function position(event?: Event) {
			const control = anchor.current;
			if (
				!control ||
				(event?.target instanceof Node && popup.current?.contains(event.target))
			)
				return;
			const rect = control.getBoundingClientRect();
			if (rect.bottom < 0 || rect.top > window.innerHeight) {
				setOpen(false);
				return;
			}
			const below = window.innerHeight - rect.bottom;
			const above = rect.top;
			const style = getComputedStyle(control);
			const preferredBelow = cssPixels(style, "--popup-preferred-below-height");
			const clearance = cssPixels(style, "--popup-viewport-clearance");
			const placeBelow = below >= preferredBelow || below >= above;
			setPlacement({
				left: rect.left,
				width: rect.width,
				top: placeBelow ? rect.bottom : undefined,
				bottom: placeBelow ? undefined : window.innerHeight - rect.top,
				maxHeight: Math.max(0, (placeBelow ? below : above) - clearance),
			});
		}
		position();
		window.addEventListener("resize", position);
		window.addEventListener("scroll", position, true);
		return () => {
			window.removeEventListener("resize", position);
			window.removeEventListener("scroll", position, true);
		};
	}, [open]);

	useLayoutEffect(() => {
		if (open && positioned && active >= 0)
			document
				.getElementById(`${listId}-option-${active}`)
				?.scrollIntoView({ block: "nearest" });
	}, [active, listId, open, positioned]);

	function choose(option: string) {
		onChange(option);
		setOpen(false);
		setActive(-1);
		setFilterText("");
	}

	function handleKey(event: KeyboardEvent<HTMLInputElement>) {
		if (event.nativeEvent.isComposing) return;
		if (event.key === "Escape" && open) {
			event.preventDefault();
			event.stopPropagation();
			setOpen(false);
			setActive(-1);
			setFilterText("");
		} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			setOpen(true);
			if (matches.length === 0) return;
			const step = event.key === "ArrowDown" ? 1 : -1;
			setActive((index) =>
				index < 0
					? step > 0
						? 0
						: matches.length - 1
					: (index + step + matches.length) % matches.length,
			);
		} else if (event.key === "Enter" && open && matches[active]) {
			event.preventDefault();
			choose(matches[active]);
		}
	}

	return (
		<div ref={anchor} className="ui-combobox">
			<input
				ref={input}
				id={id}
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={open}
				aria-controls={open ? listId : undefined}
				aria-activedescendant={
					open && matches[active] ? optionId(active) : undefined
				}
				autoComplete="off"
				value={value}
				placeholder={placeholder}
				onBlur={() => {
					setOpen(false);
					setActive(-1);
					setFilterText("");
				}}
				onKeyDown={handleKey}
				onChange={(event) => {
					onChange(event.target.value);
					setFilterText(event.target.value);
					setOpen(true);
					setActive(-1);
				}}
			/>
			<button
				type="button"
				tabIndex={-1}
				className="ui-combobox-toggle"
				aria-label={`Mở danh sách ${label}`}
				aria-expanded={open}
				onPointerDown={(event) => event.preventDefault()}
				onClick={() => {
					input.current?.focus();
					setOpen(!open);
					setActive(-1);
					setFilterText("");
				}}
			>
				<ChevronDown className="icon-size-16" aria-hidden="true" />
			</button>
			{open &&
				placement &&
				createPortal(
					<div
						className="ui-dropdown ui-combobox-popup"
						ref={popup}
						style={{
							...placement,
							maxHeight: `min(var(--popup-max-height), ${placement.maxHeight}px)`,
						}}
					>
						<div id={listId} role="listbox" aria-label={label}>
							{matches.map((option, index) => (
								<button
									key={option}
									type="button"
									id={optionId(index)}
									role="option"
									tabIndex={-1}
									className={`ui-dropdown-option${index === active ? " is-highlighted" : ""}`}
									aria-selected={option === value}
									onPointerDown={(event) => event.preventDefault()}
									onClick={() => choose(option)}
								>
									{option}
								</button>
							))}
						</div>
						{matches.length === 0 && (
							<p className="ui-dropdown-empty" role="status">
								Không có gợi ý phù hợp.
							</p>
						)}
					</div>,
					document.body,
				)}
		</div>
	);
}
