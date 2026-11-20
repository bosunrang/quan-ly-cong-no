import * as transport from "../src/shared/api/client";
import { afterEach, expect, it, vi } from "vitest";
import {
	activityResource,
	readActivitiesForExport,
} from "../src/shared/storage/activityLog";

afterEach(() => {
	vi.restoreAllMocks();
});

it("gửi bộ lọc nhật ký lên máy chủ và bỏ các ô trống", () => {
	expect(activityResource({ q: "", actor: "", category: "", page: 1 })).toBe(
		"activities?page=1",
	);
	expect(
		activityResource({
			q: "khách hàng",
			actor: "kt-1",
			category: "data",
			page: 3,
		}),
	).toBe(
		"activities?q=kh%C3%A1ch+h%C3%A0ng&actor=kt-1&category=data&page=3",
	);
});

it("chỉ tải toàn bộ thao tác khớp bộ lọc khi xuất CSV", async () => {
	const api = vi.spyOn(transport, "api").mockResolvedValue([]);
	await readActivitiesForExport({ q: "", actor: "kt-1", category: "" });
	expect(api).toHaveBeenCalledWith("GET", "activities/export?actor=kt-1");
});
