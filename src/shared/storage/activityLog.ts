import { randomId } from "../lib/randomId";
import { api } from "../api/client";
import { reportStorageIssue } from "./storageIssues";

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

const changeEvent = "cong-no:activity-written";
let currentActor: ActivityActor | undefined;

export function setActivityActor(actor?: ActivityActor) {
	currentActor = actor && { id: actor.id, name: actor.name };
}

async function appendActivity(entry: ActivityEntry) {
	const { category, action, detail } = entry;
	if (
		!(await api<boolean>("POST", "activities", {
			category,
			action,
			detail,
		}))
	)
		throw new Error("Không thể ghi nhật ký.");
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

export async function readActivities(): Promise<ActivityEntry[]> {
	return (await api<ActivityEntry[]>("GET", "activities")).filter(
		({ category, action }) =>
			category !== "session" || action !== "Mở màn hình",
	);
}
