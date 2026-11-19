import { randomId } from "../lib/randomId";
import { getDatabaseBridge } from "./databaseBridge";
import { lanEndpoint, requestLan } from "./lanStorage";
import { reportStorageIssue } from "./localStorage";

export const activityCategories = {
	session: "Truy cập",
	accounts: "Người dùng",
	data: "Dữ liệu",
	payments: "Đối soát khoản thu",
	reports: "Báo cáo",
	settings: "Cài đặt",
} as const;

export type ActivityCategory = keyof typeof activityCategories;
export type ActivityActor = { id: string; name: string };
export type ActivityEntry = {
	id: string;
	time: string;
	actorId: string;
	actorName: string;
	category: ActivityCategory;
	action: string;
	detail: string;
};

const databaseName = "cong-no-activity";
const storeName = "events";
const changeEvent = "cong-no:activity-written";
let currentActor: ActivityActor | undefined;

export function setActivityActor(actor?: ActivityActor) {
	currentActor = actor && { id: actor.id, name: actor.name };
}

function withEventStore<T>(
	mode: IDBTransactionMode,
	work: (store: IDBObjectStore) => IDBRequest<T>,
) {
	return new Promise<T>((resolve, reject) => {
		const open = indexedDB.open(databaseName, 1);
		open.onupgradeneeded = () =>
			open.result.createObjectStore(storeName, { keyPath: "id" });
		open.onerror = () => reject(open.error);
		open.onsuccess = () => {
			const database = open.result;
			try {
				const transaction = database.transaction(storeName, mode);
				const request = work(transaction.objectStore(storeName));
				transaction.oncomplete = () => {
					database.close();
					resolve(request.result);
				};
				transaction.onabort = () => {
					database.close();
					reject(
						transaction.error ??
							new Error("Không thể hoàn tất giao dịch nhật ký."),
					);
				};
			} catch (error) {
				database.close();
				reject(error);
			}
		};
	});
}

async function appendActivity(entry: ActivityEntry) {
	const bridge = getDatabaseBridge();
	if (lanEndpoint()) {
		const { category, action, detail } = entry;
		await requestLan<boolean>("append-activity", { category, action, detail });
	} else if (bridge) {
		const result = bridge.appendActivity(entry);
		if (!result.ok || result.value !== true)
			throw new Error(result.error || "Không thể ghi nhật ký SQLite.");
	} else {
		await withEventStore("readwrite", (store) => store.add(entry));
	}
	window.dispatchEvent(new Event(changeEvent));
}

// Gọi sau khi thao tác thành công. Người thực hiện được giữ ngay khi ghi nhận.
export function recordActivity(
	category: ActivityCategory,
	action: string,
	detail = "",
	actor = currentActor,
) {
	if (!actor) return Promise.resolve();
	return appendActivity({
		id: randomId(),
		time: new Date().toISOString(),
		actorId: actor.id,
		actorName: actor.name.slice(0, 140),
		category,
		action: action.slice(0, 140),
		detail: detail.slice(0, 500),
	}).catch((reason) =>
		reportStorageIssue(
			"Thao tác đã thực hiện nhưng chưa lưu được nhật ký sử dụng.",
			reason,
		),
	);
}

export function captureActivity() {
	const actor = currentActor;
	return (category: ActivityCategory, action: string, detail = "") => {
		return actor
			? recordActivity(category, action, detail, actor)
			: Promise.resolve();
	};
}

export function subscribeActivities(refresh: () => void) {
	window.addEventListener(changeEvent, refresh);
	window.addEventListener("focus", refresh);
	return () => {
		window.removeEventListener(changeEvent, refresh);
		window.removeEventListener("focus", refresh);
	};
}

async function readStoredActivities(): Promise<ActivityEntry[]> {
	if (lanEndpoint()) return requestLan<ActivityEntry[]>("read-activities");
	const bridge = getDatabaseBridge();
	if (bridge) {
		const result = bridge.readActivities();
		if (!result.ok || !Array.isArray(result.value))
			throw new Error(result.error || "Không thể đọc nhật ký SQLite.");
		return result.value;
	}
	const events: ActivityEntry[] = await withEventStore("readonly", (store) =>
		store.getAll(),
	);
	return events.sort(
		(a, b) => b.time.localeCompare(a.time) || b.id.localeCompare(a.id),
	);
}

export async function readActivities(): Promise<ActivityEntry[]> {
	return (await readStoredActivities()).filter(
		({ category, action }) => category !== "session" || action !== "Mở màn hình",
	);
}
