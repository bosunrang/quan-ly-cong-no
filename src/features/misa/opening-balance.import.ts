import type { SheetData } from "read-excel-file/browser";
import { normalizeVietnamese } from "../../domain/customers/customer.province";
import type {
	OpeningBalanceRow,
	OpeningBalanceSource,
} from "../../domain/misa/opening-balances";
import { maxOpeningBalanceRows } from "../../domain/misa/opening-balances";
import { readExcelSheet } from "../../shared/lib/excelSheet";
import { isoDateFromParts, previousDay } from "../../shared/lib/date";
import { parseVietnameseNumber } from "./misa.sales-import";

const text = (value: unknown) =>
	value instanceof Date
		? value.toISOString().slice(0, 10)
		: String(value ?? "").trim();
const label = (value: unknown) => normalizeVietnamese(text(value));
const words = (value: string) => value.split(/[^a-z0-9]+/).filter(Boolean);

const codeHeaders = ["ma khach hang", "ma doi tuong", "ma kh"];
const nameHeaders = ["ten khach hang", "ten doi tuong", "ten kh"];
const accountHeaders = ["tai khoan", "so tai khoan", "tk cong no", "tk"];

/** "Từ ngày 01/01/2026": số dư đầu kỳ là số dư cuối ngày liền trước. */
function reportStartDate(sheet: SheetData) {
	for (const row of sheet.slice(0, 12))
		for (const cell of row) {
			// Chuỗi đã bỏ dấu thay "/" bằng khoảng trắng: "tu ngay 01 01 2026".
			const match = /tu ngay (\d{1,2}) (\d{1,2}) (\d{4})/.exec(label(cell));
			const date =
				match &&
				isoDateFromParts(Number(match[3]), Number(match[2]), Number(match[1]));
			if (date) return date;
		}
	return undefined;
}

type Side = "debit" | "credit";

function sideOf(value: string): Side | undefined {
	const parts = words(value);
	if (parts.includes("no")) return "debit";
	if (parts.includes("co")) return "credit";
	return undefined;
}

const isOpeningLabel = (value: string) => value.includes("dau ky");

/**
 * Cột số dư đầu kỳ Nợ/Có. MISA ghi tiêu đề hai tầng ("Số dư đầu kỳ" gộp ô, dưới là "Nợ", "Có")
 * hoặc một tầng ("Dư Nợ đầu kỳ").
 */
function openingColumns(header: readonly unknown[], sub: readonly unknown[]) {
	const columns: Partial<Record<Side, number>> = {};
	let group = "";
	const width = Math.max(header.length, sub.length);
	for (let column = 0; column < width; column++) {
		const top = label(header[column]);
		if (top) group = top;
		const below = label(sub[column]);
		const twoRow =
			isOpeningLabel(group) && (below === "no" || below === "co")
				? sideOf(below)
				: undefined;
		const oneRow =
			isOpeningLabel(top) && !twoRow
				? sideOf(top.replace("dau ky", ""))
				: undefined;
		const side = twoRow ?? oneRow;
		if (side && columns[side] === undefined) columns[side] = column;
	}
	return columns.debit !== undefined && columns.credit !== undefined
		? (columns as Record<Side, number>)
		: undefined;
}

function findColumn(header: readonly unknown[], names: readonly string[]) {
	const labels = header.map(label);
	for (const name of names) {
		const index = labels.indexOf(name);
		if (index >= 0) return index;
	}
	return -1;
}

function amount(value: unknown, rowNumber: number, side: string) {
	const raw = text(value);
	if (!raw) return 0;
	const number = typeof value === "number" ? value : parseVietnameseNumber(raw);
	if (number === undefined || !Number.isFinite(number))
		throw new Error(
			`Dòng ${rowNumber}: số dư ${side} "${raw}" không đúng định dạng số.`,
		);
	return Math.round(number);
}

/**
 * Đọc báo cáo "Tổng hợp công nợ phải thu khách hàng" (TK 131) của MISA: mã khách hàng, tên và
 * số dư đầu kỳ Nợ/Có. Ngày chốt số dư là ngày liền trước "Từ ngày" của báo cáo.
 */
export function parseOpeningBalanceRows(
	fileName: string,
	sheet: SheetData,
): OpeningBalanceSource {
	let headerRow = -1;
	let codeColumn = -1;
	for (let index = 0; index < Math.min(sheet.length, 30); index++) {
		codeColumn = findColumn(sheet[index], codeHeaders);
		if (codeColumn >= 0) {
			headerRow = index;
			break;
		}
	}
	if (headerRow < 0)
		throw new Error(
			"Không tìm thấy cột Mã khách hàng. Hãy xuất báo cáo Tổng hợp công nợ phải thu khách hàng (TK 131) từ MISA, có cột Mã khách hàng.",
		);
	const header = sheet[headerRow];
	const sub = sheet[headerRow + 1] ?? [];
	const columns = openingColumns(header, sub);
	if (!columns)
		throw new Error("Không tìm thấy cột Số dư đầu kỳ Nợ và Có trong báo cáo.");
	const subIsHeader = sub.some((cell) => {
		const value = label(cell);
		return value === "no" || value === "co";
	});
	const nameColumn = findColumn(header, nameHeaders);
	const accountColumn = findColumn(header, accountHeaders);
	const start = reportStartDate(sheet);
	const rows: OpeningBalanceRow[] = [];
	for (
		let index = headerRow + (subIsHeader ? 2 : 1);
		index < sheet.length;
		index++
	) {
		const row = sheet[index];
		const customerCode = text(row[codeColumn]);
		const normalizedCode = label(customerCode);
		// Dòng nhóm, dòng cộng và dòng trống không có mã khách hàng.
		if (
			!customerCode ||
			normalizedCode.startsWith("tong") ||
			normalizedCode.startsWith("cong") ||
			normalizedCode.startsWith("so dong")
		)
			continue;
		if (accountColumn >= 0) {
			const account = text(row[accountColumn]);
			if (account && !account.startsWith("131")) continue;
		}
		const rowNumber = index + 1;
		rows.push({
			rowNumber,
			customerCode,
			customerName: nameColumn >= 0 ? text(row[nameColumn]) : "",
			debit: amount(row[columns.debit], rowNumber, "Nợ"),
			credit: amount(row[columns.credit], rowNumber, "Có"),
		});
	}
	if (!rows.length)
		throw new Error("Báo cáo không có dòng khách hàng nào để nhập số dư.");
	if (rows.length > maxOpeningBalanceRows)
		throw new Error(
			`Báo cáo có hơn ${maxOpeningBalanceRows.toLocaleString("vi-VN")} khách hàng.`,
		);
	return { fileName, date: start ? previousDay(start) : "", rows };
}

export async function parseOpeningBalanceWorkbook(file: File) {
	return parseOpeningBalanceRows(file.name, await readExcelSheet(file));
}
