import type { SheetData } from "read-excel-file/browser";

type WorkerReply = { ok: true; sheet: SheetData } | { ok: false; error: string };

class WorkerUnavailable extends Error {}

function readInWorker(file: File): Promise<SheetData> {
	if (typeof Worker === "undefined")
		return Promise.reject(new WorkerUnavailable());
	let worker: Worker;
	try {
		worker = new Worker(new URL("./excelSheet.worker.ts", import.meta.url), {
			type: "module",
		});
	} catch {
		return Promise.reject(new WorkerUnavailable());
	}
	return new Promise((resolve, reject) => {
		worker.addEventListener("message", (event: MessageEvent<WorkerReply>) => {
			worker.terminate();
			if (event.data.ok) resolve(event.data.sheet);
			else reject(new Error(event.data.error));
		});
		// Lỗi tải worker (ví dụ môi trường chặn worker): đọc lại trên luồng chính.
		worker.addEventListener("error", (event) => {
			event.preventDefault();
			worker.terminate();
			reject(new WorkerUnavailable());
		});
		worker.postMessage(file);
	});
}

/**
 * Đọc trang tính đầu tiên của tệp Excel. Ưu tiên chạy trong Web Worker để tệp sổ lớn
 * không làm đứng giao diện; nếu không tạo được worker thì đọc trên luồng chính.
 */
export async function readExcelSheet(file: File): Promise<SheetData> {
	try {
		try {
			return await readInWorker(file);
		} catch (error) {
			if (!(error instanceof WorkerUnavailable)) throw error;
		}
		const { readSheet } = await import("read-excel-file/browser");
		return await readSheet(file);
	} catch (error) {
		// Thư viện báo lỗi bằng tiếng Anh; giữ chi tiết gốc ở console.
		console.error("Không đọc được tệp Excel.", error);
		throw new Error(
			`Không đọc được tệp "${file.name}". Hãy chọn đúng tệp Excel .xlsx xuất từ MISA hoặc theo mẫu.`,
		);
	}
}
