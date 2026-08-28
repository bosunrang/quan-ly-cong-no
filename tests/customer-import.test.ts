import { describe, expect, it } from "vitest";
import type { Customer } from "../src/domain/customers/customer.model";
import { parseCustomerRows } from "../src/features/customers/customer.import";

type SheetData = Parameters<typeof parseCustomerRows>[1];

const headers = [
	"Mã khách hàng",
	"Tên khách hàng",
	"Nhà nước/Tư nhân",
	"Địa chỉ",
	"Tỉnh/Thành phố",
];

describe("customer import", () => {
	it("xem trước dòng hợp lệ, suy ra tỉnh và phát hiện mã trùng trong file", () => {
		const sheet: SheetData = [
			headers,
			["KH-001", "Đơn vị A", "Nhà nước", "Quận Ba Đình, Hà Nội", ""],
			["KH-001", "Đơn vị trùng", "Tư nhân", "Hà Nội", "Hà Nội"],
			["", "Thiếu mã", "Tư nhân", "Hà Nội", "Hà Nội"],
		];

		const preview = parseCustomerRows("customers.xlsx", sheet, []);

		expect(preview.readyCount).toBe(1);
		expect(preview.duplicateCount).toBe(1);
		expect(preview.invalidCount).toBe(1);
		expect(preview.rows[0]).toMatchObject({
			status: "ready",
			provinceInferred: true,
			draft: { province: "Hà Nội" },
		});
		expect(preview.rows[1].message).toContain("dòng 2");
	});

	it("phát hiện mã đã tồn tại trong danh mục", () => {
		const existing = [{ misaCode: "KH-001" }] as Customer[];
		const sheet: SheetData = [
			headers,
			["kh-001", "Đơn vị A", "Nhà nước", "Hà Nội", "Hà Nội"],
		];

		const preview = parseCustomerRows("customers.xlsx", sheet, existing);

		expect(preview.rows[0].status).toBe("duplicate");
		expect(preview.rows[0].message).toContain("đã có trong hệ thống");
	});

	it("từ chối file thiếu cột bắt buộc", () => {
		expect(() =>
			parseCustomerRows("customers.xlsx", [["Mã khách hàng"]], []),
		).toThrow("cần đủ 5 cột");
	});
});
