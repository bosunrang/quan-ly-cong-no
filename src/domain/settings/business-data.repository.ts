import { getDatabaseBridge } from "../../shared/storage/databaseBridge";
import {
	clearLanRevisions,
	lanEndpoint,
	requestLan,
} from "../../shared/storage/lanStorage";
import { readAccounts } from "../access/accounts.repository";
import {
	CUSTOMER_STORAGE_KEY,
	readCustomers,
} from "../customers/customer.repository";
import {
	EMPLOYEE_STORAGE_KEY,
	readSalesEmployees,
} from "../employees/employee.repository";
import {
	MISA_SALES_BOOK_KEY,
	withSalesBookStore,
} from "../misa/misa.sales-book.repository";
import { RECEIPT_LEDGER_KEY } from "../payments/receipt-ledger.repository";
import {
	deleteBusinessGroups,
	makeBusinessBackup,
	restoreBusinessData,
	validateBusinessBackup,
} from "./business-data.rules.mjs";
import type {
	BusinessBackup,
	BusinessChange,
	BusinessData,
} from "./business-data.types";
import { readSettings, SETTINGS_STORAGE_KEY } from "./settings.repository";
import { defaultSettings } from "./settings.model";

const localData = () => ({
	customers: readCustomers(),
	employees: readSalesEmployees(),
	settings: readSettings(),
});

function readAccountingData(
	store: IDBObjectStore,
	consume: (data: Pick<BusinessData, "salesBook" | "ledger">) => void,
) {
	const book = store.get(MISA_SALES_BOOK_KEY);
	const ledger = store.get(RECEIPT_LEDGER_KEY);
	ledger.onsuccess = () =>
		consume({ salesBook: book.result ?? null, ledger: ledger.result ?? null });
}

export async function exportBusinessBackup(): Promise<BusinessBackup> {
	if (lanEndpoint())
		return requestLan<BusinessBackup>("export-business-backup");
	const bridge = getDatabaseBridge();
	if (bridge) {
		const result = await bridge.exportBusinessBackup();
		if (!result.ok || !result.value)
			throw new Error(result.error || "Không thể xuất sao lưu.");
		return validateBusinessBackup(result.value);
	}
	const accounting = await withSalesBookStore<
		Pick<BusinessData, "salesBook" | "ledger">
	>("readonly", readAccountingData);
	return makeBusinessBackup({ ...localData(), ...accounting }, null);
}

async function changeBrowserData(change: BusinessChange) {
	const storage = window.localStorage;
	const previous = new Map<string, string | null>();
	try {
		await withSalesBookStore<void>("readwrite", (store, complete, fail) => {
			readAccountingData(store, (accounting) => {
				try {
					const current = { ...localData(), ...accounting };
					const next =
						change.type === "restore"
							? restoreBusinessData(
									change.backup,
									current,
									null,
									new Set(readAccounts().map(({ id }) => id)),
								)
							: deleteBusinessGroups(current, change.groups);
					const directories = [
						[CUSTOMER_STORAGE_KEY, next.customers, current.customers],
						[EMPLOYEE_STORAGE_KEY, next.employees, current.employees],
						[
							SETTINGS_STORAGE_KEY,
							next.settings ?? defaultSettings,
							current.settings,
						],
					] as const;
					for (const [key, data, original] of directories) {
						if (data === original) continue;
						previous.set(key, storage.getItem(key));
						storage.setItem(key, JSON.stringify({ version: 2, data }));
					}
					if (next.salesBook !== current.salesBook) {
						if (next.salesBook) store.put(next.salesBook, MISA_SALES_BOOK_KEY);
						else store.delete(MISA_SALES_BOOK_KEY);
					}
					if (next.ledger !== current.ledger) {
						if (next.ledger) store.put(next.ledger, RECEIPT_LEDGER_KEY);
						else store.delete(RECEIPT_LEDGER_KEY);
					}
					complete(undefined);
				} catch (error) {
					fail(
						error instanceof Error
							? error
							: new Error("Không thể cập nhật dữ liệu."),
					);
				}
			});
		});
	} catch (error) {
		for (const [key, value] of previous) {
			if (value === null) storage.removeItem(key);
			else storage.setItem(key, value);
		}
		throw error;
	}
}

export async function changeBusinessData(change: BusinessChange) {
	if (lanEndpoint()) {
		await requestLan<boolean>("change-business-data", change);
		clearLanRevisions();
		return;
	}
	const bridge = getDatabaseBridge();
	if (!bridge) return changeBrowserData(change);
	const result = await bridge.changeBusinessData(change);
	if (!result.ok || !result.value)
		throw new Error(result.error || "Không thể cập nhật dữ liệu.");
}
