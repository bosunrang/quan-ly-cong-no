import { describe, expect, it } from "vitest";
import {
	parseCustomerRows,
	parseCustomerWorkbook,
} from "../src/features/customers/customer.import";

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
			draft: { province: "Hà Nội", group: "state" },
		});
		expect(preview.rows[1].message).toContain("dòng 2");
	});

	it("bỏ qua cột người nhận chi phí của file cũ và bảo toàn quy tắc mã trùng", () => {
		const existing = [{ misaCode: "KH-001", name: "Đơn vị A", taxCode: "" }];
		const sheet: SheetData = [
			[...headers, "Người nhận chi phí"],
			[
				"KH-001",
				"Đơn vị A",
				"Nhà nước",
				"Hà Nội",
				"Hà Nội",
				" Nguyễn   Văn A ",
			],
		];

		const preview = parseCustomerRows("customers.xlsx", sheet, existing);

		expect(preview.readyCount).toBe(0);
		expect(preview.duplicateCount).toBe(1);
		expect(preview.rows[0]).toMatchObject({
			status: "duplicate",
			draft: { province: "Hà Nội" },
		});
	});

	it("đọc lại file CSV theo đúng cấu trúc xuất danh mục", async () => {
		const csv = [
			[
				"Mã khách hàng",
				"Tên khách hàng",
				"Địa chỉ",
				"Tỉnh/Thành phố",
				"Mã số thuế",
				"Nhân viên phụ trách",
				"Trạng thái",
			],
			[
				"KH-CSV",
				"Đơn vị, có dấu phẩy",
				"Số 1, Hà Nội",
				"Hà Nội",
				"0101",
				"Nguyễn Văn A",
				"Đang hoạt động",
			],
		]
			.map((row) =>
				row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
			)
			.join("\r\n");
		const preview = await parseCustomerWorkbook(
			new File([`\uFEFF${csv}`], "danh-muc-khach-hang.csv", {
				type: "text/csv",
			}),
			[],
		);

		expect(preview.readyCount).toBe(1);
		expect(preview.rows[0].draft).toMatchObject({
			name: "Đơn vị, có dấu phẩy",
			address: "Số 1, Hà Nội",
			province: "Hà Nội",
			group: "unknown",
			taxCode: "0101",
		});
	});

	it("phát hiện mã đã tồn tại trong danh mục", () => {
		const existing = [{ misaCode: "KH-001", name: "Đơn vị A", taxCode: "" }];
		const sheet: SheetData = [
			headers,
			["kh-001", "Đơn vị A", "Nhà nước", "Hà Nội", "Hà Nội"],
		];

		const preview = parseCustomerRows("customers.xlsx", sheet, existing);

		expect(preview.rows[0].status).toBe("duplicate");
		expect(preview.rows[0].message).toContain("đã có trong danh mục");
	});

	it("giữ số 0 đầu, chấp nhận cùng đơn vị và báo trùng mã số thuế khác tên", () => {
		const sheet: SheetData = [
			[...headers, "MST"],
			["KH-001", "Bệnh viện A", "", "Hà Nội", "Hà Nội", " 0100123456-001 "],
			["KH-002", "BỆNH VIỆN A", "", "Hà Nội", "Hà Nội", "0100123456-001"],
			["KH-003", "Bệnh viện B", "", "Hà Nội", "Hà Nội", "0100123456-001"],
			["KH-004", "Bệnh viện C", "", "Hà Nội", "Hà Nội", "0100999999"],
		];
		const preview = parseCustomerRows("customers.xlsx", sheet, [
			{ misaCode: "KH-OLD", name: "Đơn vị D", taxCode: "0100999999" },
		]);
		expect(preview.rows.map(({ status }) => status)).toEqual([
			"ready",
			"ready",
			"invalid",
			"invalid",
		]);
		expect(preview.rows[0].draft.taxCode).toBe("0100123456-001");
		expect(preview.rows[3].message).toContain("Mã số thuế");
	});

	it("từ chối file thiếu cột bắt buộc", () => {
		expect(() =>
			parseCustomerRows("customers.xlsx", [["Mã khách hàng"]], []),
		).toThrow("cần đủ 4 cột");
	});
});
