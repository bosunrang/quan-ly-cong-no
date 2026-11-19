import { afterEach, expect, it, vi } from "vitest";
import { api, setApiSession } from "../src/shared/api/client";

afterEach(() => {
	document.querySelector('meta[name="cong-no-lan-api"]')?.remove();
	setApiSession();
	vi.unstubAllGlobals();
});

function endpoint() {
	const meta = document.createElement("meta");
	meta.name = "cong-no-lan-api";
	meta.content = "/api/";
	document.head.append(meta);
}

it("thiếu endpoint thì dừng trước khi gửi yêu cầu", async () => {
	const fetch = vi.fn();
	vi.stubGlobal("fetch", fetch);
	await expect(api("GET", "customers")).rejects.toThrow(
		"Mở ứng dụng qua máy chủ",
	);
	expect(fetch).not.toHaveBeenCalled();
});

it("dùng cookie cùng nguồn, method và đường dẫn riêng, không gửi body khi đọc", async () => {
	endpoint();
	const fetch = vi
		.fn()
		.mockResolvedValue(new Response(JSON.stringify({ ok: true, value: [] })));
	vi.stubGlobal("fetch", fetch);
	setApiSession("profile-version");
	await expect(api("GET", "customers")).resolves.toEqual([]);
	expect(fetch).toHaveBeenCalledWith(
		"/api/customers",
		expect.objectContaining({
			method: "GET",
			credentials: "same-origin",
			body: undefined,
			headers: { "X-Cong-No-LAN": "1", "X-Cong-No-Session": "profile-version" },
		}),
	);
});

it("giữ mã HTTP và chi tiết khi máy chủ từ chối cập nhật", async () => {
	endpoint();
	vi.stubGlobal(
		"fetch",
		vi
			.fn()
			.mockResolvedValue(
				new Response(
					JSON.stringify({
						ok: false,
						error: "Bản ghi vừa thay đổi",
						code: "HTTP_409",
					}),
					{ status: 409 },
				),
			),
	);
	await expect(api("PATCH", "customers/one", {})).rejects.toMatchObject({
		status: 409,
		code: "HTTP_409",
		message: "Bản ghi vừa thay đổi",
	});
});

it("báo lỗi kết nối khi không tới được máy chủ", async () => {
	endpoint();
	vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
	await expect(api("GET", "customers")).rejects.toMatchObject({ status: 0 });
});
