import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	consumeStorageIssue,
	readVersionedLocalStorage,
	writeVersionedLocalStorage,
} from "../src/shared/storage/localStorage";

describe("versioned local storage", () => {
	beforeEach(() => {
		window.localStorage.clear();
		Reflect.deleteProperty(window, "congNoDatabase");
		consumeStorageIssue();
		vi.restoreAllMocks();
	});

	it("ưu tiên SQLite và không đọc bản dự phòng khi dữ liệu hợp lệ", () => {
		window.localStorage.setItem(
			"items.v2",
			JSON.stringify({ version: 2, data: ["local"] }),
		);
		Object.defineProperty(window, "congNoDatabase", {
			configurable: true,
			value: {
				readDataset: vi.fn(() => ({
					ok: true,
					value: { version: 2, data: ["sqlite"] },
				})),
				writeDataset: vi.fn(),
				status: vi.fn(() => ({
					ok: true,
					value: { backend: "sqlite", schemaVersion: 1 },
				})),
			},
		});

		const result = readVersionedLocalStorage({
			key: "items.v2",
			label: "danh sách thử nghiệm",
			version: 2,
			fallback: () => [],
			isValid: (value): value is string[] =>
				Array.isArray(value) && value.every((item) => typeof item === "string"),
		});

		expect(result).toEqual(["sqlite"]);
	});

	it("chuyển bản localStorage hiện tại sang SQLite nhưng vẫn giữ bản dự phòng", () => {
		window.localStorage.setItem(
			"items.v2",
			JSON.stringify({ version: 2, data: ["local"] }),
		);
		const writeDataset = vi.fn(() => ({ ok: true, value: true }));
		Object.defineProperty(window, "congNoDatabase", {
			configurable: true,
			value: {
				readDataset: vi.fn(() => ({ ok: true, value: null })),
				writeDataset,
				status: vi.fn(() => ({
					ok: true,
					value: { backend: "sqlite", schemaVersion: 1 },
				})),
			},
		});

		const result = readVersionedLocalStorage({
			key: "items.v2",
			label: "danh sách thử nghiệm",
			version: 2,
			fallback: () => [],
			isValid: (value): value is string[] =>
				Array.isArray(value) && value.every((item) => typeof item === "string"),
		});

		expect(result).toEqual(["local"]);
		expect(writeDataset).toHaveBeenCalledWith("items.v2", 2, ["local"]);
		// Bản cũ được cất sang khóa dự phòng và không còn được đọc lại.
		expect(window.localStorage.getItem("items.v2")).toBeNull();
		expect(
			JSON.parse(
				window.localStorage.getItem("items.v2.backup-before-sqlite") ?? "",
			),
		).toEqual({ version: 2, data: ["local"] });
	});

	it.each([
		["lỗi đọc", { ok: false, error: "disk" }],
		["sai cấu trúc", { ok: true, value: { version: 2, data: [1] } }],
	])(
		"không dùng bản trên trình duyệt thay SQLite khi SQLite %s",
		(_, response) => {
			window.localStorage.setItem(
				"items.v2",
				JSON.stringify({ version: 2, data: ["cu"] }),
			);
			const writeDataset = vi.fn(() => ({ ok: true, value: true }));
			Object.defineProperty(window, "congNoDatabase", {
				configurable: true,
				value: {
					readDataset: vi.fn(() => response),
					writeDataset,
					status: vi.fn(() => ({
						ok: true,
						value: { backend: "sqlite", schemaVersion: 1 },
					})),
				},
			});
			expect(() =>
				readVersionedLocalStorage({
					key: "items.v2",
					label: "danh sách thử nghiệm",
					version: 2,
					fallback: () => [],
					isValid: (value): value is string[] =>
						Array.isArray(value) &&
						value.every((item) => typeof item === "string"),
				}),
			).toThrow("Dữ liệu chưa bị thay đổi");
			expect(writeDataset).not.toHaveBeenCalled();
		},
	);

	it("cách ly JSON lỗi trước khi dùng fallback", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		window.localStorage.setItem("items.v2", "{invalid json");

		const result = readVersionedLocalStorage({
			key: "items.v2",
			label: "danh sách thử nghiệm",
			version: 2,
			fallback: () => ["fallback"],
			isValid: (value): value is string[] => Array.isArray(value),
		});

		expect(result).toEqual(["fallback"]);
		const storedKeys = Array.from(
			{ length: window.localStorage.length },
			(_, index) => window.localStorage.key(index),
		);
		expect(storedKeys.some((key) => key?.startsWith("items.v2.corrupt."))).toBe(
			true,
		);
		expect(consumeStorageIssue()).toContain("không đọc được");
	});

	it("trả về false và phát cảnh báo khi ghi thất bại", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(window.localStorage, "setItem").mockImplementationOnce(() => {
			throw new DOMException("Quota exceeded", "QuotaExceededError");
		});

		expect(
			writeVersionedLocalStorage("items.v2", 2, ["A"], "danh sách thử nghiệm"),
		).toBe(false);
		expect(consumeStorageIssue()).toContain("chưa được ghi xuống máy");
	});
});
