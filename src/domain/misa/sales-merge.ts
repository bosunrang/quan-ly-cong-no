import type { MisaSalesBook, MisaSalesLine } from "./misa.sales-book";
import type { MisaSalesImportPreview } from "./sales-import.model";

export type SalesImportIssue = {
	kind: "duplicate" | "conflict" | "update";
	label: string;
};

function keyText(value = "") {
	return value.normalize("NFC").trim().replace(/\s+/g, " ").toUpperCase();
}

function voucherKey(row: MisaSalesLine) {
	return JSON.stringify([row.date.slice(0, 4), keyText(row.documentNumber)]);
}

function lineKey(row: MisaSalesLine) {
	return JSON.stringify([
		row.date,
		keyText(row.documentNumber),
		keyText(row.invoiceNumber),
		keyText(row.productName),
		keyText(row.unit),
		row.quantity,
		row.unitPrice,
		row.salesAmount,
		row.paymentTotal,
	]);
}

function comparableLine(row: MisaSalesLine) {
	const source = row.source;
	return {
		row,
		key: lineKey(row),
		customerName: keyText(row.customerName),
		fields: [
			source?.customerCode,
			source?.invoiceSeries,
			source?.invoiceDate,
			source?.postingDate,
			source?.debitAccount,
			source?.productCode,
			source?.lotNumber,
		].map(keyText),
	};
}

export function matchSavedSalesRows(
	saved: readonly MisaSalesLine[],
	incoming: readonly MisaSalesLine[],
) {
	const candidates = new Map<string, ReturnType<typeof comparableLine>[]>();
	for (const row of saved) {
		const line = comparableLine(row);
		const bucket = candidates.get(line.key);
		if (bucket) bucket.push(line);
		else candidates.set(line.key, [line]);
	}
	const matches = new Map<number, MisaSalesLine>();
	const lines = incoming.map(comparableLine);
	// Each stored line can match once. Exact metadata gets priority over older
	// rows that may be missing a customer code, product code or lot number.
	for (const exact of [true, false]) {
		for (const line of lines) {
			if (matches.has(line.row.rowNumber)) continue;
			const bucket = candidates.get(line.key);
			if (!bucket?.length) continue;
			const index = bucket.findIndex((previous) => {
				const customerMatches =
					previous.fields[0] && line.fields[0]
						? previous.fields[0] === line.fields[0]
						: previous.customerName === line.customerName;
				return (
					customerMatches &&
					previous.fields.every(
						(value, field) =>
							value === line.fields[field] ||
							(!exact && (!value || !line.fields[field])),
					)
				);
			});
			if (index >= 0)
				matches.set(line.row.rowNumber, bucket.splice(index, 1)[0].row);
		}
	}
	return matches;
}

export interface SalesImportOptions {
	/** Thay toàn bộ chứng từ cần đối chiếu bằng bản trong file. */
	applyChanges?: boolean;
	/** Gỡ chứng từ đã lưu trong khoảng ngày của file nhưng không còn trong file. */
	removeMissing?: boolean;
	/** Chứng từ bán hàng (số và năm hạch toán) đang có phân bổ khoản thu còn hiệu lực. */
	allocatedDocuments?: Iterable<AllocatedDocument>;
}

/** MISA đánh lại số chứng từ mỗi năm nên khóa theo cả số chứng từ và năm. */
export interface AllocatedDocument {
	documentNumber: string;
	year: string;
}

const allocatedKey = (year: string, documentNumber: string) =>
	JSON.stringify([year, keyText(documentNumber)]);

/** Năm của dòng theo ngày chứng từ và ngày hạch toán (khóa hóa đơn lấy năm hạch toán). */
function rowYears(row: MisaSalesLine) {
	const posting = row.source?.postingDate || row.date;
	return new Set([row.date.slice(0, 4), posting.slice(0, 4)]);
}

function groupByVoucher(rows: readonly MisaSalesLine[]) {
	const groups = new Map<string, MisaSalesLine[]>();
	for (const row of rows) {
		const key = voucherKey(row);
		const group = groups.get(key);
		if (group) group.push(row);
		else groups.set(key, [row]);
	}
	return groups;
}

/**
 * Lập kế hoạch nhập sổ theo từng chứng từ để không bao giờ ghi một phần chứng từ.
 * - Chứng từ mới: thêm toàn bộ dòng.
 * - Chứng từ đã lưu, khớp đủ hai chiều: bỏ qua.
 * - Chứng từ thay đổi (thiếu/thừa/sửa dòng) hoặc có dòng giống hệt nhau trong file:
 *   giữ nguyên sổ và đưa vào "Cần đối chiếu", trừ khi người dùng chọn cập nhật theo file.
 * - Chứng từ đã lưu trong khoảng ngày của file nhưng không còn trong file: cảnh báo,
 *   chỉ gỡ khi người dùng chọn.
 * Chứng từ đang có phân bổ khoản thu không bao giờ bị thay hoặc gỡ tự động.
 */
export function planMisaSalesImport(
	saved: MisaSalesBook | null,
	preview: MisaSalesImportPreview,
	options: SalesImportOptions = {},
) {
	const incoming = preview.book;
	const existing = saved?.rows ?? [];
	const allocated = new Set(
		[...(options.allocatedDocuments ?? [])].map(({ documentNumber, year }) =>
			allocatedKey(year, documentNumber),
		),
	);
	const isLocked = (rows: readonly MisaSalesLine[]) =>
		rows.some((row) =>
			[...rowYears(row)].some((year) =>
				allocated.has(allocatedKey(year, row.documentNumber)),
			),
		);
	const issues = new Map<number, SalesImportIssue>();
	const matches = matchSavedSalesRows(existing, incoming.rows);
	const matchedSaved = new Set(matches.values());
	const savedByVoucher = groupByVoucher(existing);
	const incomingByVoucher = groupByVoucher(incoming.rows);

	const dropped = new Set<MisaSalesLine>();
	const accepted: MisaSalesLine[] = [];
	let changedVouchers = 0;
	let updatedVouchers = 0;
	let lockedVouchers = 0;

	for (const [key, rows] of incomingByVoucher) {
		const savedRows = savedByVoucher.get(key) ?? [];
		const unchanged =
			savedRows.length > 0 &&
			rows.every((row) => matches.has(row.rowNumber)) &&
			savedRows.every((row) => matchedSaved.has(row));
		if (unchanged) {
			for (const row of rows)
				issues.set(row.rowNumber, {
					kind: "duplicate",
					label: "Đã có trong sổ",
				});
			continue;
		}
		const twins = rows.filter((row) => preview.duplicateOf.has(row.rowNumber));
		if (!savedRows.length && !twins.length) {
			accepted.push(...rows);
			continue;
		}
		const locked = savedRows.length > 0 && isLocked(savedRows);
		if (locked) lockedVouchers++;
		else if (options.applyChanges) {
			updatedVouchers++;
			for (const row of savedRows) dropped.add(row);
			accepted.push(...rows);
			for (const row of rows)
				issues.set(row.rowNumber, {
					kind: "update",
					label: savedRows.length
						? "Cập nhật chứng từ theo file"
						: "Nhập cả dòng giống hệt nhau",
				});
			continue;
		} else changedVouchers++;
		for (const row of rows) {
			const original = preview.duplicateOf.get(row.rowNumber);
			issues.set(row.rowNumber, {
				kind: "conflict",
				label: locked
					? "Chứng từ đã phân bổ khoản thu"
					: original !== undefined
						? `Giống hệt dòng ${original} trong file`
						: savedRows.length
							? "Chứng từ khác sổ đang lưu"
							: "Chứng từ có dòng giống hệt nhau",
			});
		}
	}

	// Chứng từ đã lưu nằm trong khoảng ngày của file nhưng file không còn chứng từ đó.
	let from = "";
	let to = "";
	for (const row of incoming.rows) {
		if (!from || row.date < from) from = row.date;
		if (!to || row.date > to) to = row.date;
	}
	const missingRows: MisaSalesLine[] = [];
	let missingVouchers = 0;
	let removedVouchers = 0;
	let lockedMissingVouchers = 0;
	for (const [key, rows] of savedByVoucher) {
		if (
			incomingByVoucher.has(key) ||
			!rows.every((row) => row.date >= from && row.date <= to)
		)
			continue;
		missingVouchers++;
		missingRows.push(...rows);
		if (isLocked(rows)) lockedMissingVouchers++;
		else if (options.removeMissing) {
			removedVouchers++;
			for (const row of rows) dropped.add(row);
		}
	}

	let lastRow = existing.reduce((max, row) => Math.max(max, row.rowNumber), 0);
	const added = accepted.map((row) => ({
		...row,
		rowNumber: saved ? ++lastRow : row.rowNumber,
		origin: { fileName: incoming.fileName, rowNumber: row.rowNumber },
	}));
	const kept = existing
		.filter((row) => !dropped.has(row))
		.map((row) =>
			row.origin || !saved
				? row
				: {
						...row,
						origin: { fileName: saved.fileName, rowNumber: row.rowNumber },
					},
		);
	const rows = saved ? [...kept, ...added] : added;
	return {
		book: { ...incoming, rows },
		issues,
		addedCount: added.length,
		removedCount: dropped.size,
		conflictCount: [...issues.values()].filter(
			({ kind }) => kind === "conflict",
		).length,
		changedVouchers,
		updatedVouchers,
		lockedVouchers,
		missing: {
			from,
			to,
			rows: missingRows,
			vouchers: missingVouchers,
			removedVouchers,
			lockedVouchers: lockedMissingVouchers,
		},
		hasChanges: added.length > 0 || dropped.size > 0,
	};
}
