import { normalizeVietnamese } from "../customers/customer.province";
import { getDatabaseBridge } from "../../shared/storage/databaseBridge";
import {
	readVersionedLocalStorage,
	writeVersionedLocalStorage,
} from "../../shared/storage/localStorage";
import {
	isMisaDataset,
	isMisaDetailRecordList,
	isMisaDetailPage,
	type MisaDataset,
	type MisaDetailPage,
	type MisaDetailQuery,
	type MisaDetailRecord,
	type MisaImportResult,
	type MisaRangeQuery,
} from "./misa.model";

const STORAGE_KEY = "mkt-cost.misa-summary.v5";
const LEGACY_STORAGE_KEYS = [
	"mkt-cost.misa-summary.v4",
	"mkt-cost.misa-summary.v3",
	"mkt-cost.misa-summary.v2",
	"mkt-cost.misa-units.v1",
];
const STORAGE_VERSION = 5;
const DETAIL_VERSION = 3;
const BROWSER_DATABASE = "mkt-cost-browser-data";
const BROWSER_DATABASE_VERSION = 2;
const DETAIL_STORE = "misa-details";

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function migrateLegacyUnit(value: unknown): unknown {
	if (!isRecord(value)) return value;
	const {
		totalDebit: legacyTotalDebit,
		totalCredit: legacyTotalCredit,
		...unit
	} = value;
	return {
		...unit,
		openingBalance:
			typeof unit.openingBalance === "number" &&
			Number.isFinite(unit.openingBalance)
				? unit.openingBalance
				: null,
		salesAmount: finiteNumber(unit.salesAmount, finiteNumber(legacyTotalDebit)),
		receiptAmount: finiteNumber(
			unit.receiptAmount,
			finiteNumber(legacyTotalCredit),
		),
	};
}

function migrateLegacyDataset(value: unknown): MisaDataset | undefined {
	const envelope = isRecord(value) && "data" in value ? value.data : value;
	if (!isRecord(envelope)) return undefined;
	const migrated = {
		...envelope,
		detailsAvailable:
			typeof envelope.detailsAvailable === "boolean"
				? envelope.detailsAvailable
				: false,
		units: Array.isArray(envelope.units)
			? envelope.units.map(migrateLegacyUnit)
			: envelope.units,
	};
	return isMisaDataset(migrated) ? migrated : undefined;
}

function openBrowserDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === "undefined") {
			reject(new Error("Trình duyệt không hỗ trợ kho dữ liệu chi tiết."));
			return;
		}
		const request = indexedDB.open(BROWSER_DATABASE, BROWSER_DATABASE_VERSION);
		request.onupgradeneeded = () => {
			const database = request.result;
			let store: IDBObjectStore;
			if (!database.objectStoreNames.contains(DETAIL_STORE)) {
				store = database.createObjectStore(DETAIL_STORE, {
					keyPath: "id",
				});
				store.createIndex("unitId", "unitId", { unique: false });
			} else {
				store = request.transaction?.objectStore(
					DETAIL_STORE,
				) as IDBObjectStore;
			}
			if (!store.indexNames.contains("date"))
				store.createIndex("date", "date", { unique: false });
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function replaceBrowserDetails(rows: MisaDetailRecord[]): Promise<void> {
	const database = await openBrowserDatabase();
	await new Promise<void>((resolve, reject) => {
		const transaction = database.transaction(DETAIL_STORE, "readwrite");
		const store = transaction.objectStore(DETAIL_STORE);
		store.clear();
		for (const row of rows) store.put(row);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
	database.close();
}

async function readBrowserUnitDetails(
	unitId: string,
): Promise<MisaDetailRecord[]> {
	const database = await openBrowserDatabase();
	const rows = await new Promise<MisaDetailRecord[]>((resolve, reject) => {
		const transaction = database.transaction(DETAIL_STORE, "readonly");
		const request = transaction
			.objectStore(DETAIL_STORE)
			.index("unitId")
			.getAll(unitId);
		request.onsuccess = () => resolve(request.result as MisaDetailRecord[]);
		request.onerror = () => reject(request.error);
	});
	database.close();
	return rows.map(normalizeStoredDetail);
}

function normalizeStoredDetail(row: MisaDetailRecord): MisaDetailRecord {
	return {
		...row,
		productCode: row.productCode ?? "",
		balanceDebit: row.balanceDebit ?? null,
		balanceCredit: row.balanceCredit ?? null,
	};
}

async function readBrowserRangeDetails(
	options: MisaRangeQuery,
): Promise<MisaDetailRecord[]> {
	const database = await openBrowserDatabase();
	const rows = await new Promise<MisaDetailRecord[]>((resolve, reject) => {
		const transaction = database.transaction(DETAIL_STORE, "readonly");
		const request = transaction.objectStore(DETAIL_STORE).getAll();
		request.onsuccess = () => resolve(request.result as MisaDetailRecord[]);
		request.onerror = () => reject(request.error);
	});
	database.close();
	return rows
		.map(normalizeStoredDetail)
		.filter(
			(row) =>
				row.date !== null &&
				row.date >= options.dateFrom &&
				row.date <= options.dateTo &&
				String(row.documentKind) !== "opening",
		)
		.sort(
			(left, right) =>
				(left.date ?? "").localeCompare(right.date ?? "") ||
				left.rowNumber - right.rowNumber,
		);
}

function paginateDetails(
	rows: MisaDetailRecord[],
	options: MisaDetailQuery,
): MisaDetailPage {
	const query = normalizeVietnamese(options.query);
	const filtered = rows.filter((row) => {
		if (String(row.documentKind) === "opening") return false;
		const matchesKind =
			options.documentKind === "all" ||
			row.documentKind === options.documentKind;
		const matchesQuery =
			!query ||
			normalizeVietnamese(
				`${row.documentNumber} ${row.description} ${row.generalDescription}`,
			).includes(query);
		return matchesKind && matchesQuery;
	});
	const pageSize = [25, 50, 100].includes(options.pageSize)
		? options.pageSize
		: 25;
	const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
	const page = Math.min(Math.max(1, Math.trunc(options.page)), pageCount);
	const offset = (page - 1) * pageSize;
	return {
		rows: filtered.slice(offset, offset + pageSize),
		filteredCount: filtered.length,
		page,
		pageCount,
		firstVisible: filtered.length ? offset + 1 : 0,
		lastVisible: Math.min(offset + pageSize, filtered.length),
	};
}

export function readMisaDataset(): MisaDataset | null {
	return readVersionedLocalStorage({
		key: STORAGE_KEY,
		label: "dữ liệu MISA",
		version: STORAGE_VERSION,
		fallback: () => null,
		isValid: (value): value is MisaDataset | null =>
			value === null || isMisaDataset(value),
		legacy: LEGACY_STORAGE_KEYS.map((key) => ({
			key,
			migrate: migrateLegacyDataset,
		})),
	});
}

export async function writeMisaDataset(
	data: MisaImportResult,
): Promise<boolean> {
	const { rows, ...summary } = data;
	const bridge = getDatabaseBridge();
	if (bridge) {
		const response = bridge.writeMisaDetails(DETAIL_VERSION, rows);
		if (!response.ok || response.value !== true) return false;
	} else {
		await replaceBrowserDetails(rows);
	}
	return writeVersionedLocalStorage(
		STORAGE_KEY,
		STORAGE_VERSION,
		summary,
		"dữ liệu MISA",
	);
}

export async function queryMisaDetails(
	options: MisaDetailQuery,
): Promise<MisaDetailPage> {
	const bridge = getDatabaseBridge();
	if (bridge) {
		const response = bridge.queryMisaDetails(options);
		if (!response.ok || !isMisaDetailPage(response.value)) {
			throw new Error(
				response.error || "Không thể đọc chi tiết MISA từ SQLite.",
			);
		}
		return response.value;
	}
	return paginateDetails(await readBrowserUnitDetails(options.unitId), options);
}

export async function queryMisaRange(
	options: MisaRangeQuery,
): Promise<MisaDetailRecord[]> {
	const bridge = getDatabaseBridge();
	if (bridge) {
		const response = bridge.queryMisaRange(options);
		if (!response.ok || !isMisaDetailRecordList(response.value)) {
			throw new Error(
				response.error || "Không thể đọc dữ liệu MISA theo khoảng ngày.",
			);
		}
		return response.value;
	}
	return readBrowserRangeDetails(options);
}
