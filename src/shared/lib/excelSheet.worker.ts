import { readSheet } from "read-excel-file/web-worker";

// Giải nén và đọc tệp Excel ngoài luồng giao diện; trả lại bảng ô (ngày giữ kiểu Date).
const scope = globalThis as unknown as {
	addEventListener(type: "message", listener: (event: MessageEvent<File>) => void): void;
	postMessage(message: unknown): void;
};

scope.addEventListener("message", async (event) => {
	try {
		scope.postMessage({ ok: true, sheet: await readSheet(event.data) });
	} catch (error) {
		scope.postMessage({
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		});
	}
});
