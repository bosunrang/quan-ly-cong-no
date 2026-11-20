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

export type ActivityFilter = {
	q?: string;
	actor?: string;
	category?: string;
};

export type ActivityPage = {
	items: ActivityEntry[];
	total: number;
	page: number;
	limit: number;
	/** [mã, tên mới nhất] của những người đã có thao tác. */
	actors: [string, string][];
};

function activityQuery(filter: ActivityFilter & { page?: number }) {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(filter))
		if (value !== undefined && value !== "") query.set(key, String(value));
	return query.size ? `?${query}` : "";
}

/** Máy chủ lọc, bỏ lượt chuyển màn hình của bản cũ và phân trang nhật ký. */
export function activityResource(filter: ActivityFilter & { page?: number }) {
	return `activities${activityQuery(filter)}`;
}

/** Toàn bộ thao tác khớp bộ lọc, chỉ tải khi xuất CSV. */
export function readActivitiesForExport(filter: ActivityFilter) {
	return api<ActivityEntry[]>(
		"GET",
		`activities/export${activityQuery(filter)}`,
	);
}
