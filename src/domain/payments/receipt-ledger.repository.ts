import { randomId } from "../../shared/lib/randomId";
import type { DatabaseEnvelope } from "../../shared/storage/storage.types";
import {
	forgetCachedDataset,
	readCachedDataset,
} from "../../shared/storage/datasetCache";
import { api } from "../../shared/api/client";
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
			: new BroadcastChannel(storageKey);
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
	return readCachedDataset("receipt-ledger", decodeLedger);
}

export async function saveReceiptLedger(
	ledger: ReceiptLedger,
	salesBookImportedAt?: string,
): Promise<ReceiptLedger> {
	const next = { ...ledger, revision: randomId() };
	forgetCachedDataset("receipt-ledger");
	const written = await api<boolean>("PUT", "receipt-ledger", {
		revision: ledger.revision,
		data: next,
		salesBookImportedAt,
	});
	if (!written) throw changed();

	notifyReceiptLedger();
	return next;
}
