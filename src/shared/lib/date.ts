const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const VI_DATE_PATTERN = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

const pad = (value: number) => String(value).padStart(2, "0");

export function isoDateFromParts(
	year: number,
	month: number,
	day: number,
): string | undefined {
	if (!Number.isInteger(year) || year < 1000 || year > 9999) return undefined;
	const value = new Date(Date.UTC(year, month - 1, day));
	if (
		value.getUTCFullYear() !== year ||
		value.getUTCMonth() !== month - 1 ||
		value.getUTCDate() !== day
	)
		return undefined;
	return `${year}-${pad(month)}-${pad(day)}`;
}

export function normalizeDateOnly(value: string): string | undefined {
	const text = value.trim();
	const isoMatch = ISO_DATE_PATTERN.exec(text);
	if (isoMatch)
		return isoDateFromParts(
			Number(isoMatch[1]),
			Number(isoMatch[2]),
			Number(isoMatch[3]),
		);
	const viMatch = VI_DATE_PATTERN.exec(text);
	if (viMatch)
		return isoDateFromParts(
			Number(viMatch[3]),
			Number(viMatch[2]),
			Number(viMatch[1]),
		);
	return undefined;
}

export function isIsoDate(value: unknown): value is string {
	return typeof value === "string" && normalizeDateOnly(value) === value;
}

export function isIsoTimestamp(value: unknown): value is string {
	if (typeof value !== "string") return false;
	const timestamp = new Date(value);
	return (
		!Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value
	);
}

export function localDateToIso(value: Date): string {
	return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function todayLocal(now = new Date()): string {
	return localDateToIso(now);
}

export function formatDateOnly(
	value: string | null | undefined,
	fallback = "—",
): string {
	if (!value) return fallback;
	const iso = normalizeDateOnly(value);
	if (!iso) return fallback;
	const [year, month, day] = iso.split("-");
	return `${day}/${month}/${year}`;
}

export function formatTimestamp(value: string, fallback = "—"): string {
	const timestamp = new Date(value);
	return Number.isNaN(timestamp.getTime())
		? fallback
		: localDateToVietnamese(timestamp);
}

export function localDateToVietnamese(value: Date): string {
	return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`;
}

export function previousDay(date: string): string {
	const iso = normalizeDateOnly(date);
	if (!iso) throw new RangeError(`Ngày không hợp lệ: ${date}`);
	const [year, month, day] = iso.split("-").map(Number);
	const value = new Date(Date.UTC(year, month - 1, day));
	value.setUTCDate(value.getUTCDate() - 1);
	return value.toISOString().slice(0, 10);
}
