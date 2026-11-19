import {
	BROWSER_SALES_DATABASE,
	type DatabaseEnvelope,
	getDatabaseBridge,
} from "../../shared/storage/databaseBridge";
import {
	forgetCachedDataset,
	readCachedDataset,
} from "../../shared/storage/datasetCache";
import { lanEndpoint, requestLan } from "../../shared/storage/lanStorage";
import type { MisaSalesBook } from "./misa.sales-book";

export const MISA_SALES_BOOK_KEY = "cong-no.misa-sales-book.v1";
const storeName = "sales-book";

export async function withSalesBookStore<T>(
	mode: IDBTransactionMode,
	run: (
		store: IDBObjectStore,
		complete: (value: T) => void,
		fail: (error: Error) => void,
	) => void,
): Promise<T> {
	const database = await new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(BROWSER_SALES_DATABASE, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(storeName);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
	});
	try {
		return await new Promise<T>((resolve, reject) => {
			const transaction = database.transaction(storeName, mode);
			let result: T;
			let reason: Error | undefined;
			transaction.oncomplete = () => resolve(result);
			transaction.onabort = () =>
				reject(
					reason ??
						transaction.error ??
						new Error("Không thể hoàn tất lưu trữ sổ bán hàng."),
				);
			run(
				transaction.objectStore(storeName),
				(value) => {
					result = value;
				},
				(error) => {
					reason = error;
					transaction.abort();
				},
			);
		});
	} finally {
		database.close();
	}
}

function browserTransaction<T>(
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T>,
) {
	return withSalesBookStore<T>(mode, (store, complete) => {
		const request = run(store);
		request.onsuccess = () => complete(request.result);
	});
}

export async function readMisaSalesBook(): Promise<MisaSalesBook | null> {
	const bridge = getDatabaseBridge();
	const lan = lanEndpoint();
	if (!lan && !bridge)
		return (
			(await browserTransaction<MisaSalesBook | undefined>(
				"readonly",
				(store) => store.get(MISA_SALES_BOOK_KEY),
			)) ?? null
		);
	return readCachedDataset(MISA_SALES_BOOK_KEY, decodeSalesBook);
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
	const bridge = getDatabaseBridge();
	forgetCachedDataset(MISA_SALES_BOOK_KEY);
	if (lanEndpoint()) {
		if (!await requestLan<boolean>("write-sales-book", { expected: expectedImportedAt, data: next }))
			throw changed();
		return next;
	}
	if (!bridge) {
		await withSalesBookStore<void>("readwrite", (store, complete, fail) => {
			const current = store.get(MISA_SALES_BOOK_KEY);
			current.onsuccess = () => {
				if ((current.result?.importedAt ?? null) !== expectedImportedAt) {
					fail(changed());
					return;
				}
				const request = store.put(next, MISA_SALES_BOOK_KEY);
				request.onsuccess = () => complete(undefined);
			};
		});
		return next;
	}
	const response = await bridge.writeMisaSalesBook(expectedImportedAt, next);
	if (!response.ok)
		throw new Error(response.error || "Không thể lưu sổ bán hàng vào SQLite.");
	if (response.value !== true) throw changed();
	return next;
}
