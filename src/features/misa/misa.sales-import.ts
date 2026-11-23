import type { SheetData } from "read-excel-file/browser";
import { readExcelSheet } from "../../shared/lib/excelSheet";
import { normalizeVietnamese } from "../../domain/customers/customer.province";
import type { MisaSalesLine } from "../../domain/misa/misa.sales-book";
import { normalizeDateOnly } from "../../shared/lib/date";

import {
	salesColumns,
	salesHeaders,
	type MisaSalesImportPreview,
} from "../../domain/misa/sales-import.model";
export {
	salesColumns,
	salesHeaders,
	type MisaSalesImportPreview,
} from "../../domain/misa/sales-import.model";

// Chuỗi tìm kiếm của mỗi dòng chỉ chuẩn hóa một lần; dòng sổ không bị sửa tại chỗ
// nên có thể dùng chính đối tượng dòng làm khóa.
const salesLineSearchText = new WeakMap<MisaSalesLine, string>();

export function matchesSalesLine(row: MisaSalesLine, needle: string): boolean {
	if (!needle) return true;
	let text = salesLineSearchText.get(row);
	if (text === undefined) {
		text = normalizeVietnamese(
			[
				row.documentNumber,
				row.invoiceNumber,
				row.customerName,
				row.productName,
			].join(" "),
		);
		salesLineSearchText.set(row, text);
	}
	return text.includes(needle);
}

function cellText(value: unknown) {
	return String(value ?? "").trim();
}

/**
 * Đọc số từ ô dạng chữ theo định dạng Việt Nam: dấu chấm phân cách hàng nghìn,
 * dấu phẩy thập phân ("15.000" = 15000, "1,5" = 1.5). Chấp nhận thêm dạng có đủ
 * hai dấu kiểu Anh ("1,200.50") và số âm trong ngoặc. Chuỗi mơ hồ khác bị từ chối
 * thay vì đoán, để không ghi nhầm "15.000" thành 15 đồng.
 */
export function parseVietnameseNumber(text: string): number | undefined {
	let value = text.replace(/[\s ]/g, "").replace(/(?:đ|vnđ|vnd)$/i, "");
	let sign = 1;
	const parenthesized = /^\((.*)\)$/.exec(value);
	if (parenthesized) {
		value = parenthesized[1];
		sign = -1;
	}
	if (value.startsWith("-")) {
		value = value.slice(1);
		sign = -sign;
	}
	let normalized: string | undefined;
	if (/^\d+$/.test(value)) normalized = value;
	else if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(value))
		normalized = value.replace(/\./g, "").replace(",", ".");
	else if (/^\d+,\d+$/.test(value)) normalized = value.replace(",", ".");
	else if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(value))
		normalized = value.replace(/,/g, "");
	else if (/^\d+\.\d+$/.test(value) && !/^\d{1,3}\.\d{3}$/.test(value))
		normalized = value;
	if (normalized === undefined) return undefined;
	const number = sign * Number(normalized);
	return Number.isFinite(number) ? number : undefined;
}

function amount(value: unknown, label: string, rowNumber: number) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	const text = cellText(value);
	if (!text) return null;
	const number = parseVietnameseNumber(text);
	if (number === undefined)
		throw new Error(
			`Dòng ${rowNumber}: ${label} "${text}" không đúng định dạng số.`,
		);
	return number;
}

export function parseMisaSalesRows(
	fileName: string,
	sheet: SheetData,
): MisaSalesImportPreview {
	const required = salesColumns.map((key) =>
		normalizeVietnamese(salesHeaders[key]),
	);
	const headerRow = sheet.slice(0, 20).findIndex((row) => {
		const normalized = row.map((value) => normalizeVietnamese(cellText(value)));
		return required.every((header) => normalized.includes(header));
	});
	if (headerRow < 0)
		throw new Error("Không tìm thấy đủ 10 cột của Sổ chi tiết bán hàng MISA.");
	const header = sheet[headerRow].map((value) =>
		normalizeVietnamese(cellText(value)),
	);
	const columns = Object.fromEntries(
		salesColumns.map((key, index) => [key, header.indexOf(required[index])]),
	) as Record<keyof typeof salesHeaders, number>;
	const customerCodeColumn = header.indexOf("ma khach hang");
	const addressColumn = header.indexOf("dia chi");
	const invoiceSeriesColumn = header.indexOf("ky hieu hoa don");
	const invoiceDateColumn = header.indexOf("ngay hoa don");
	const postingDateColumn = header.indexOf("ngay hach toan");
	const debitAccountColumn = header.indexOf("tk no");
	const productCodeColumn = header.indexOf("ma hang");
	const lotNumberColumn = header.indexOf("so lo");
	const rows: MisaSalesLine[] = [];
	const firstRowBySignature = new Map<string, number>();
	const duplicateOf = new Map<number, number>();
	const customerAddresses = new Map<number, string>();
	const dateTimes = new Map<number, string>();
	const textDates = new Map<string, string | undefined>();
	function isoTime(value: Date) {
		const key = value.getTime();
		let text = dateTimes.get(key);
		if (text === undefined) {
			text = value.toISOString();
			dateTimes.set(key, text);
		}
		return text;
	}
	function dateOnly(value: unknown) {
		if (value instanceof Date) return isoTime(value).slice(0, 10);
		const text = cellText(value);
		if (!text) return undefined;
		if (!textDates.has(text)) textDates.set(text, normalizeDateOnly(text));
		return textDates.get(text);
	}
	const signatureColumns: number[] = [];
	header.forEach((_, column) => {
		signatureColumns.push(column);
	});
	const signatureCells = new Array<unknown>(header.length);
	for (let index = headerRow + 1; index < sheet.length; index++) {
		const row = sheet[index];
		const documentNumber = cellText(row[columns.documentNumber]);
		const rawDate = row[columns.date];
		const customerName = cellText(row[columns.customerName]);
		const productName = cellText(row[columns.productName]);
		if (!rawDate && !documentNumber && !customerName && !productName) continue;
		const rowNumber = index + 1;
		const date = dateOnly(rawDate);
		if (!date || !documentNumber)
			throw new Error(`Dòng ${rowNumber}: thiếu ngày hoặc số chứng từ hợp lệ.`);
		const customerCode = cellText(row[customerCodeColumn]);
		const address = cellText(row[addressColumn]);
		if (address) customerAddresses.set(rowNumber, address);
		const invoiceSeries = cellText(row[invoiceSeriesColumn]);
		const invoiceDate = dateOnly(row[invoiceDateColumn]) ?? "";
		const postingDate = dateOnly(row[postingDateColumn]);
		const debitAccount = cellText(row[debitAccountColumn]);
		const productCode = cellText(row[productCodeColumn]);
		const lotNumber = cellText(row[lotNumberColumn]);
		rows.push({
			rowNumber,
			date,
			documentNumber,
			customerName,
			productName,
			invoiceNumber: cellText(row[columns.invoiceNumber]),
			unit: cellText(row[columns.unit]),
			quantity: amount(row[columns.quantity], salesHeaders.quantity, rowNumber),
			unitPrice: amount(row[columns.unitPrice], salesHeaders.unitPrice, rowNumber),
			salesAmount: amount(
				row[columns.salesAmount],
				salesHeaders.salesAmount,
				rowNumber,
			),
			paymentTotal: amount(
				row[columns.paymentTotal],
				salesHeaders.paymentTotal,
				rowNumber,
			),
			...(customerCode ||
			invoiceSeries ||
			invoiceDate ||
			postingDate ||
			debitAccount ||
			productCode ||
			lotNumber
				? {
						source: {
							customerCode,
							invoiceSeries,
							invoiceDate,
							...(postingDate ? { postingDate } : {}),
							...(debitAccount ? { debitAccount } : {}),
							...(productCode ? { productCode } : {}),
							...(lotNumber ? { lotNumber } : {}),
						},
					}
				: {}),
		});
		// Đồng thời kiểm tra các cột nguồn như mã hàng và ký hiệu hóa đơn.
		for (const column of signatureColumns) {
			const value = row[column];
			signatureCells[column] =
				typeof value === "string"
					? value.trim() || null
					: value instanceof Date
						? Number.isNaN(value.getTime())
							? null
							: isoTime(value)
						: (value ?? null);
		}
		const signature = JSON.stringify(signatureCells);
		const firstRow = firstRowBySignature.get(signature);
		if (firstRow === undefined) firstRowBySignature.set(signature, rowNumber);
		else duplicateOf.set(rowNumber, firstRow);
	}
	if (!rows.length)
		throw new Error("File MISA không có dòng bán hàng để nhập.");
	return {
		book: { fileName, importedAt: new Date().toISOString(), rows },
		duplicateOf,
		customerAddresses,
	};
}

export async function parseMisaSalesWorkbook(file: File) {
	return parseMisaSalesRows(file.name, await readExcelSheet(file));
}
