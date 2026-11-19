import { afterEach, describe, expect, it, vi } from "vitest";
import { readMisaSalesBook } from "../src/domain/misa/misa.sales-book.repository";
import { readReceiptLedger } from "../src/domain/payments/receipt-ledger.repository";
import * as transport from "../src/shared/api/client";
import { forgetCachedDataset } from "../src/shared/storage/datasetCache";

const book = {
	fileName: "MISA.xlsx",
	importedAt: "2026-11-01T00:00:00.000Z",
	rows: [],
};

function installBridge() {
	const stamps = new Map<string, string>([
		["cong-no.misa-sales-book.v1", "1:a"],
		["cong-no.receipt-ledger.v1", "1:a"],
	]);
	const readDatasetAsync = vi.fn(async (key: string) => ({
		ok: true,
		value:
			key === "cong-no.misa-sales-book.v1"
				? { version: 1, data: structuredClone(book) }
				: {
						version: 1,
						data: { revision: "r1", receipts: [], allocations: [] },
					},
	}));
	const datasetStamp = vi.fn(async (key: string) => ({
		ok: true,
		value: stamps.get(key) ?? null,
	}));

	vi.spyOn(transport, "api").mockImplementation(async (_method, path) => {
		const key = path.startsWith("sales-book")
			? "cong-no.misa-sales-book.v1"
			: "cong-no.receipt-ledger.v1";
		const response = path.endsWith("/stamp")
			? await datasetStamp(key)
			: await readDatasetAsync(key);
		if (!response.ok) throw new Error((response as { error?: string }).error);
		return response.value as never;
	});
	return { stamps, readDatasetAsync, datasetStamp };
}

describe("Bộ đệm sổ lớn dùng chung", () => {
	afterEach(() => {
		forgetCachedDataset();
		vi.restoreAllMocks();
	});

	it("chỉ tải lại sổ bán hàng khi dấu thay đổi khác", async () => {
		const bridge = installBridge();
		const first = await readMisaSalesBook();
		const second = await readMisaSalesBook();
		expect(first).toEqual(book);
		// Cùng đối tượng: các trang không phải tính lại khi sổ chưa đổi.
		expect(second).toBe(first);
		expect(bridge.readDatasetAsync).toHaveBeenCalledTimes(1);
		expect(bridge.datasetStamp).toHaveBeenCalledTimes(2);

		bridge.stamps.set("cong-no.misa-sales-book.v1", "1:b");
		const third = await readMisaSalesBook();
		expect(third).not.toBe(first);
		expect(bridge.readDatasetAsync).toHaveBeenCalledTimes(2);
	});

	it("gộp các lần đọc cùng lúc và quên bản đệm khi được yêu cầu", async () => {
		const bridge = installBridge();
		const [left, right] = await Promise.all([
			readReceiptLedger(),
			readReceiptLedger(),
		]);
		expect(left).toBe(right);
		expect(bridge.readDatasetAsync).toHaveBeenCalledTimes(1);
		forgetCachedDataset("receipt-ledger");
		await readReceiptLedger();
		expect(bridge.readDatasetAsync).toHaveBeenCalledTimes(2);
	});

	it("báo lỗi khi máy chủ không trả được dấu thay đổi", async () => {
		const bridge = installBridge();
		bridge.datasetStamp.mockResolvedValueOnce({
			ok: false,
			value: null,
			error: "Hỏng",
		} as never);
		await expect(readMisaSalesBook()).rejects.toThrow("Hỏng");
	});
});
