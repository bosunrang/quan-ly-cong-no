import { afterEach, describe, expect, it } from "vitest";
import { isInsecureLanConnection } from "../src/shared/storage/lanStorage";

function useLanEndpoint() {
	const meta = document.createElement("meta");
	meta.name = "cong-no-lan-api";
	meta.content = "/api/";
	document.head.append(meta);
}

describe("Cảnh báo kết nối LAN không mã hóa", () => {
	afterEach(() => {
		for (const meta of document.querySelectorAll('meta[name="cong-no-lan-api"]'))
			meta.remove();
	});

	it("chỉ cảnh báo khi vào máy chủ LAN qua HTTP từ máy khác", () => {
		expect(
			isInsecureLanConnection({ protocol: "http:", hostname: "192.168.1.5" }),
		).toBe(false);
		useLanEndpoint();
		expect(
			isInsecureLanConnection({ protocol: "http:", hostname: "192.168.1.5" }),
		).toBe(true);
		expect(
			isInsecureLanConnection({ protocol: "https:", hostname: "192.168.1.5" }),
		).toBe(false);
		expect(
			isInsecureLanConnection({ protocol: "http:", hostname: "127.0.0.1" }),
		).toBe(false);
	});
});
