import { randomId } from "../../shared/lib/randomId";
import { type DatabaseEnvelope, getDatabaseBridge } from "../../shared/storage/databaseBridge";
import {
	forgetCachedDataset,
	readCachedDataset,
} from "../../shared/storage/datasetCache";
import { lanEndpoint, requestLan } from "../../shared/storage/lanStorage";
import {
	MISA_SALES_BOOK_KEY,
	withSalesBookStore,
} from "../misa/misa.sales-book.repository";
import {
	emptyReceiptLedger,
	migrateReceiptLedger,
	type ReceiptLedger,
} from "./receipt-ledger";

export const RECEIPT_LEDGER_KEY = "cong-no.receipt-ledger.v1";
const storageKey = RECEIPT_LEDGER_KEY;
const updates = new EventTarget();
const changed = () =>
	new Error(
		"Sổ đối soát hoặc sổ bán hàng đã thay đổi. Mở lại thao tác để kiểm tra số liệu mới.",
	);

function ledgerChannel() {
	try {
		return typeof BroadcastChannel === "undefined"
			? undefined
			: new BroadcastChannel(`${lanEndpoint() ?? ""}${storageKey}`);
	} catch {
		// The view can still reread the ledger when its window regains focus.
		return undefined;
	}
}

export function subscribeReceiptLedger(refresh: () => void) {
	updates.addEventListener("change", refresh);
	const channel = ledgerChannel();
	channel?.addEventListener("message", refresh);
	return () => {
		updates.removeEventListener("change", refresh);
		channel?.close();
	};
}

function notifyReceiptLedger() {
	updates.dispatchEvent(new Event("change"));
	const channel = ledgerChannel();
	try {
		channel?.postMessage(null);
	} finally {
		channel?.close();
	}
}

function validate(data: unknown): ReceiptLedger {
	if (
		!data ||
		typeof data !== "object" ||
		!("revision" in data) ||
		typeof data.revision !== "string" ||
		!("receipts" in data) ||
		!Array.isArray(data.receipts) ||
		!("allocations" in data) ||
		!Array.isArray(data.allocations)
	)
		throw new Error("Dữ liệu đối soát đã lưu không đúng cấu trúc.");
	return migrateReceiptLedger(data as ReceiptLedger);
}

function decodeLedger(envelope: DatabaseEnvelope | null): ReceiptLedger {
	if (!envelope) return emptyReceiptLedger;
	if (envelope.version !== 1)
		throw new Error("Phiên bản sổ đối soát không hợp lệ.");
	return validate(envelope.data);
}

export async function readReceiptLedger(): Promise<ReceiptLedger> {
	const bridge = getDatabaseBridge();
	const lan = lanEndpoint();
	if (lan || bridge) {
		return readCachedDataset(storageKey, decodeLedger);
	}
	const result = await withSalesBookStore<unknown>(
		"readonly",
		(store, complete) => {
			const request = store.get(storageKey);
			request.onsuccess = () => complete(request.result);
		},
	);
	return result === undefined ? emptyReceiptLedger : validate(result);
}

export async function saveReceiptLedger(
	ledger: ReceiptLedger,
	salesBookImportedAt?: string,
): Promise<ReceiptLedger> {
	const next = { ...ledger, revision: randomId() };
	const bridge = getDatabaseBridge();
	forgetCachedDataset(storageKey);
	if (lanEndpoint()) {
		const written = await requestLan<boolean>("write-ledger", {
			revision: ledger.revision, data: next, salesBookImportedAt,
		});
		if (!written) throw changed();
	} else if (bridge) {
		const result = await bridge.writeReceiptLedger(
			ledger.revision,
			next,
			salesBookImportedAt,
		);
		if (!result.ok)
			throw new Error(result.error || "Không thể lưu sổ đối soát.");
		if (!result.value) throw changed();
	} else
		await withSalesBookStore<ReceiptLedger>(
			"readwrite",
			(store, complete, fail) => {
				const current = store.get(storageKey);
				current.onsuccess = () => {
					try {
						const revision =
							current.result === undefined
								? ""
								: validate(current.result).revision;
						if (revision !== ledger.revision) {
							fail(changed());
							return;
						}
						const write = () => {
							const request = store.put(next, storageKey);
							request.onsuccess = () => complete(next);
						};
						if (salesBookImportedAt === undefined) write();
						else {
							const book = store.get(MISA_SALES_BOOK_KEY);
							book.onsuccess = () => {
								if (book.result?.importedAt !== salesBookImportedAt)
									fail(changed());
								else write();
							};
						}
					} catch (error) {
						fail(
							error instanceof Error
								? error
								: new Error("Không thể lưu sổ đối soát."),
						);
					}
				};
			},
		);
	notifyReceiptLedger();
	return next;
}
