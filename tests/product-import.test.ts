import { describe, expect, it } from "vitest";
import type { Product } from "../src/domain/products/product.model";
import { parseProductRows } from "../src/features/products/product.import";

type SheetData = Parameters<typeof parseProductRows>[1];
const headers = ["Mã hàng", "Tên hàng", "ĐVT", "Nhóm"];

const existing = [
	{
		id: "PRD-1",
		code: "SP-001",
		name: "Tên cũ",
		unit: "Hộp",
		group: "Cũ",
		status: "active",
		createdAt: "2026-01-01T08:00:00.000Z",
		updatedAt: "2026-01-01T08:00:00.000Z",
	},
] as Product[];

describe("product import", () => {
	it("đọc đúng mẫu Danh sách sản phẩm và phân loại thêm mới/cập nhật", () => {
		const sheet: SheetData = [
			headers,
			["SP-001", "Tên mới", "Lọ", "Hóa chất"],
			["SP-002", "Sản phẩm mới", "Hộp", "Vật tư"],
		];
		const preview = parseProductRows(
			"Danh sách sản phẩm.xlsx",
			sheet,
			existing,
		);
		expect(preview.updateCount).toBe(1);
		expect(preview.readyCount).toBe(1);
		expect(preview.rows[0]).toMatchObject({
			status: "update",
			draft: { code: "SP-001", existingProductId: "PRD-1" },
		});
	});

	it("bỏ qua mã trùng trong file và chặn dòng thiếu dữ liệu bắt buộc", () => {
		const preview = parseProductRows(
			"products.xlsx",
			[
				headers,
				["SP-002", "Sản phẩm", "Hộp", ""],
				["sp-002", "Bị trùng", "Hộp", ""],
				["", "Thiếu mã", "", ""],
			],
			[],
		);
		expect(preview.readyCount).toBe(1);
		expect(preview.duplicateCount).toBe(1);
		expect(preview.invalidCount).toBe(1);
		expect(preview.rows[1].message).toContain("dòng 2");
	});

	it("bỏ qua sản phẩm đã có khi dữ liệu không thay đổi", () => {
		const preview = parseProductRows(
			"products.xlsx",
			[headers, ["sp-001", "  TÊN   CŨ ", "hộp", "cũ"]],
			existing,
		);

		expect(preview.updateCount).toBe(0);
		expect(preview.duplicateCount).toBe(1);
		expect(preview.rows[0]).toMatchObject({
			status: "duplicate",
			message: "Trùng với sản phẩm đã có",
		});
	});

	it("từ chối file không đúng bốn cột mẫu", () => {
		expect(() =>
			parseProductRows("products.xlsx", [["Mã hàng", "Tên hàng"]], []),
		).toThrow("cần đủ 4 cột");
	});
});
