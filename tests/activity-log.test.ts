import { afterEach, expect, it } from "vitest";
import {
	type ActivityEntry,
	readActivities,
} from "../src/shared/storage/activityLog";

afterEach(() => {
	Reflect.deleteProperty(window, "congNoDatabase");
});

it("ẩn lịch sử chuyển thẻ nhưng giữ các thao tác quan trọng", async () => {
	const entry: ActivityEntry = {
		id: "navigation",
		time: "2026-11-19T10:00:00.000Z",
		actorId: "admin",
		actorName: "Quản trị viên",
		category: "session",
		action: "Mở màn hình",
		detail: "Nhật ký sử dụng",
	};
	const login = { ...entry, id: "login", action: "Đăng nhập", detail: "" };
	const importBook = {
		...entry,
		id: "import",
		category: "data",
		action: "Nhập sổ bán hàng MISA",
		detail: "Sổ bán hàng.xlsx",
	};
	Object.defineProperty(window, "congNoDatabase", {
		configurable: true,
		value: {
			readActivities: () => ({ ok: true, value: [entry, login, importBook] }),
		},
	});

	expect(await readActivities()).toEqual([login, importBook]);
});
