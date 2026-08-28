import { CalendarDays } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	formatDateOnly,
	isoDateFromParts,
	normalizeDateOnly,
	todayLocal,
} from "../../lib/date";

const MONTHS = [
	"Tháng 1",
	"Tháng 2",
	"Tháng 3",
	"Tháng 4",
	"Tháng 5",
	"Tháng 6",
	"Tháng 7",
	"Tháng 8",
	"Tháng 9",
	"Tháng 10",
	"Tháng 11",
	"Tháng 12",
];
const DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function validDate(year: number, month: number, day: number): string {
	return isoDateFromParts(year, month, day) ?? "";
}

function parseDate(value: string): string {
	return normalizeDateOnly(value) ?? "";
}

function formatDate(iso: string): string {
	return formatDateOnly(iso, "");
}

interface DateInputProps {
	id?: string;
	value: string;
	onChange: (isoDate: string) => void;
	ariaLabel?: string;
	disabled?: boolean;
}

export function DateInput({
	id,
	value,
	onChange,
	ariaLabel = "Ngày",
	disabled = false,
}: DateInputProps) {
	const boxRef = useRef<HTMLSpanElement>(null);
	const popupRef = useRef<HTMLDivElement>(null);
	const [text, setText] = useState(() => formatDate(value));
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<"day" | "month">("day");
	const [view, setView] = useState(() => {
		const iso = parseDate(value) || todayLocal();
		const [year, month] = iso.split("-").map(Number);
		return new Date(year, month - 1, 1);
	});
	const [position, setPosition] = useState({ left: 8, top: 8 });

	useEffect(() => setText(formatDate(value)), [value]);

	useLayoutEffect(() => {
		const layoutKey = `${mode}-${view.getTime()}`;
		void layoutKey;
		if (!open || !boxRef.current || !popupRef.current) return;
		const rect = boxRef.current.getBoundingClientRect();
		const popup = popupRef.current;
		const width = 258;
		const left = Math.min(
			Math.max(8, rect.left),
			window.innerWidth - width - 8,
		);
		const top = Math.min(
			rect.bottom + 6,
			window.innerHeight - popup.offsetHeight - 8,
		);
		setPosition({ left, top: Math.max(8, top) });
	}, [mode, open, view]);

	useEffect(() => {
		if (!open) return;
		const closeOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (
				!boxRef.current?.contains(target) &&
				!popupRef.current?.contains(target)
			)
				setOpen(false);
		};
		const closeEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", closeOutside);
		document.addEventListener("keydown", closeEscape);
		return () => {
			document.removeEventListener("mousedown", closeOutside);
			document.removeEventListener("keydown", closeEscape);
		};
	}, [open]);

	const openPicker = () => {
		if (disabled) return;
		const iso = parseDate(text) || value || todayLocal();
		const [year, month] = iso.split("-").map(Number);
		setView(new Date(year, month - 1, 1));
		setMode("day");
		setOpen(true);
	};

	const commitText = () => {
		const iso = parseDate(text);
		if (iso) onChange(iso);
		else setText(formatDate(value));
	};

	const pick = (iso: string) => {
		onChange(iso);
		setText(formatDate(iso));
		setOpen(false);
	};

	const moveMonth = (step: number) =>
		setView(
			(current) =>
				new Date(current.getFullYear(), current.getMonth() + step, 1),
		);
	const setYear = (year: number) =>
		setView(
			(current) =>
				new Date(
					Math.min(9999, Math.max(1000, year || new Date().getFullYear())),
					current.getMonth(),
					1,
				),
		);
	const year = view.getFullYear();
	const month = view.getMonth();
	const first = new Date(year, month, 1);
	const days = new Date(year, month + 1, 0).getDate();
	const offset = (first.getDay() + 6) % 7;
	const cells = [
		...Array.from({ length: offset }, (_, index) => index - offset),
		...Array.from({ length: days }, (_, index) => index + 1),
	];
	const today = todayLocal();

	const popup = open && (
		<div
			ref={popupRef}
			className="vn-date-picker"
			style={position}
			role="dialog"
			aria-label="Chọn ngày"
		>
			{mode === "month" ? (
				<>
					<div className="vn-date-head">
						<button
							type="button"
							onClick={() => setYear(year - 1)}
							title="Năm trước"
						>
							‹
						</button>
						<button
							type="button"
							className="vn-date-title"
							onClick={() => setMode("day")}
							title="Quay lại chọn ngày"
						>
							Chọn tháng/năm
						</button>
						<button
							type="button"
							onClick={() => setYear(year + 1)}
							title="Năm sau"
						>
							›
						</button>
					</div>
					<div className="vn-year-row">
						<button type="button" onClick={() => setYear(year - 1)}>
							-
						</button>
						<input
							aria-label="Năm"
							type="number"
							min="1000"
							max="9999"
							value={year}
							inputMode="numeric"
							onChange={(event) => setYear(Number(event.target.value))}
						/>
						<button type="button" onClick={() => setYear(year + 1)}>
							+
						</button>
					</div>
					<div className="vn-month-grid">
						{MONTHS.map((name, index) => (
							<button
								type="button"
								key={name}
								className={index === month ? "selected" : ""}
								onClick={() => {
									setView(new Date(year, index, 1));
									setMode("day");
								}}
							>
								{name}
							</button>
						))}
					</div>
				</>
			) : (
				<>
					<div className="vn-date-head">
						<button
							type="button"
							onClick={() => moveMonth(-1)}
							title="Tháng trước"
						>
							‹
						</button>
						<button
							type="button"
							className="vn-date-title"
							onClick={() => setMode("month")}
							title="Chọn nhanh tháng/năm"
						>
							{MONTHS[month]} {year}
						</button>
						<button
							type="button"
							onClick={() => moveMonth(1)}
							title="Tháng sau"
						>
							›
						</button>
					</div>
					<div className="vn-date-days">
						{DAYS.map((day) => (
							<span key={day}>{day}</span>
						))}
					</div>
					<div className="vn-date-grid">
						{cells.map((day) => {
							if (day <= 0)
								return (
									<button
										type="button"
										className="blank"
										tabIndex={-1}
										key={`blank-${day}`}
									/>
								);
							const iso = validDate(year, month + 1, day);
							const classes = [
								iso === value ? "selected" : "",
								iso === today ? "today" : "",
							]
								.filter(Boolean)
								.join(" ");
							return (
								<button
									type="button"
									className={classes}
									onClick={() => pick(iso)}
									key={iso}
								>
									{day}
								</button>
							);
						})}
					</div>
				</>
			)}
			<div className="vn-date-foot">
				<button type="button" onClick={() => pick(today)}>
					Hôm nay
				</button>
				<button type="button" onClick={() => setOpen(false)}>
					Đóng
				</button>
			</div>
		</div>
	);

	return (
		<>
			<span ref={boxRef} className="datebox manage-date">
				<input
					id={id}
					className="date-text"
					inputMode="numeric"
					value={text}
					placeholder="dd/mm/yyyy"
					aria-label={ariaLabel}
					disabled={disabled}
					onChange={(event) => setText(event.target.value)}
					onBlur={commitText}
					onKeyDown={(event) => {
						if (event.key === "Enter") commitText();
					}}
				/>
				<button
					className="datepick"
					type="button"
					title="Chọn ngày"
					onClick={openPicker}
					disabled={disabled}
				>
					<CalendarDays />
				</button>
			</span>
			{popup ? createPortal(popup, document.body) : null}
		</>
	);
}
