import type {
	Customer,
	CustomerImportDraft,
} from "../../domain/customers/customer.model";
import {
	inferProvince,
	normalizeVietnamese,
} from "../../domain/customers/customer.province";
import type { MisaSalesBook } from "../../domain/misa/misa.sales-book";
import { type MisaSalesImportPreview, salesColumns } from "./misa.sales-import";
import { matchSavedSalesRows } from "./misa.sales-merge";

function codeKey(code: string) {
	return code
		.normalize("NFC")
		.trim()
		.replace(/\s+/g, " ")
		.toLocaleUpperCase("vi-VN");
}

export function planMisaCustomerSupplement(
	saved: MisaSalesBook,
	source: MisaSalesImportPreview,
	customers: readonly Customer[],
) {
	const combinedBook = saved.rows.some((row) => row.origin);
	const sourceRows = new Map(
		source.book.rows.map((row) => [row.rowNumber, row]),
	);
	const matchedRows = combinedBook
		? new Map(
				[...matchSavedSalesRows(saved.rows, source.book.rows)].map(
					([excelRow, storedRow]) => [
						storedRow.rowNumber,
						sourceRows.get(excelRow),
					],
				),
			)
		: sourceRows;
	if (combinedBook && !matchedRows.size)
		throw new Error(
			"File đã chọn không khớp với dòng bán hàng nào trong sổ đang lưu.",
		);
	const latestByCode = new Map<
		string,
		{
			date: string;
			rowNumber: number;
			customer: CustomerImportDraft;
		}
	>();
	let linkedRows = 0;

	const rows = saved.rows.map((row) => {
		const original = matchedRows.get(row.rowNumber);
		if (combinedBook && !original) return row;
		if (
			!original ||
			(!combinedBook &&
				salesColumns.some((column) => row[column] !== original[column]))
		) {
			throw new Error(
				`Dòng Excel ${row.rowNumber} chưa khớp với sổ bán hàng đang lưu. Hãy chọn lại file gốc của sổ này.`,
			);
		}
		const customerCode =
			original.source?.customerCode || row.source?.customerCode || "";
		const key = codeKey(customerCode);
		if (!key || !row.customerName.trim()) {
			throw new Error(
				`Dòng Excel ${row.rowNumber} thiếu mã hoặc tên khách hàng.`,
			);
		}
		if (row.source?.customerCode && codeKey(row.source.customerCode) !== key) {
			throw new Error(
				`Mã khách hàng của dòng Excel ${row.rowNumber} khác mã đã lưu trong sổ.`,
			);
		}
		const latest = latestByCode.get(key);
		if (
			!latest ||
			row.date > latest.date ||
			(row.date === latest.date && original.rowNumber > latest.rowNumber)
		) {
			const address = source.customerAddresses?.get(original.rowNumber) ?? "";
			const locality = address
				.split(/[,;\n]/)
				.map((part) => part.trim())
				.filter((part) => part && normalizeVietnamese(part) !== "viet nam")
				.at(-1);
			latestByCode.set(key, {
				date: row.date,
				rowNumber: original.rowNumber,
				customer: {
					misaCode: customerCode,
					name: row.customerName,
					address,
					province: inferProvince(locality),
					group: "unknown",
				},
			});
		}
		if (row.source?.customerCode) return row;
		linkedRows += 1;
		return {
			...row,
			source: {
				...original.source,
				...row.source,
				customerCode,
				invoiceSeries:
					row.source?.invoiceSeries || original.source?.invoiceSeries || "",
				invoiceDate:
					row.source?.invoiceDate || original.source?.invoiceDate || "",
			},
		};
	});

	const existingCodes = new Set<string>();
	for (const customer of customers) {
		const key = codeKey(customer.misaCode);
		if (existingCodes.has(key) && latestByCode.has(key)) {
			throw new Error(
				`Mã MISA ${customer.misaCode} đang trùng trong danh mục. Cần kiểm tra mã này trước khi ghép.`,
			);
		}
		existingCodes.add(key);
	}
	const additions = [...latestByCode]
		.filter(([key]) => !existingCodes.has(key))
		.map(([, item]) => item.customer);
	return {
		book: { ...saved, rows },
		additions,
		matched: latestByCode.size - additions.length,
		matchedRows: combinedBook ? matchedRows.size : saved.rows.length,
		linkedRows,
	};
}
