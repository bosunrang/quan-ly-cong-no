import type { DatabaseEnvelope } from "../../shared/storage/storage.types";
import {
	forgetCachedDataset,
	readCachedDataset,
} from "../../shared/storage/datasetCache";
import { api } from "../../shared/api/client";
import type { MisaSalesBook } from "./misa.sales-book";

export const MISA_SALES_BOOK_KEY = "cong-no.misa-sales-book.v1";
export async function readMisaSalesBook(): Promise<MisaSalesBook | null> {
	return readCachedDataset("sales-book", decodeSalesBook);
}

function decodeSalesBook(envelope: DatabaseEnvelope | null) {
	if (!envelope) return null;
	const { version, data } = envelope;
	if (
		version !== 1 ||
		!data ||
		typeof data !== "object" ||
		!("rows" in data) ||
		!Array.isArray(data.rows)
	) {
		throw new Error("Dữ liệu sổ bán hàng đã lưu không đúng cấu trúc.");
	}
	return data as MisaSalesBook;
}

export async function writeMisaSalesBook(
	book: MisaSalesBook,
	expectedImportedAt: string | null,
): Promise<MisaSalesBook> {
	const next = {
		...book,
		importedAt: new Date(
			Math.max(Date.now(), (Date.parse(expectedImportedAt ?? "") || 0) + 1),
		).toISOString(),
	};
	const changed = () =>
		new Error(
			"Sổ bán hàng vừa thay đổi. Kiểm tra lại dữ liệu trước khi xác nhận.",
		);
	forgetCachedDataset("sales-book");
	if (
		!(await api<boolean>("PUT", "sales-book", {
			expected: expectedImportedAt,
			data: next,
		}))
	)
		throw changed();
	return next;
}

export async function readAllocatedDocuments() {
	return new Set(await api<string[]>("GET", "sales-book/allocated-documents"));
}
