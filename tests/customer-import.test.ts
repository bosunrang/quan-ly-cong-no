import { describe, expect, it } from "vitest";
import type { SalesEmployee } from "../src/domain/employees/employee.model";
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

const employees: SalesEmployee[] = [
	{ id: "target-1", code: "0007", name: "Nguyễn Văn An", status: "active" },
	{ id: "target-2", code: "NV-02", name: "Trùng Tên", status: "active" },
	{ id: "target-3", code: "NV-03", name: "Trùng Tên", status: "active" },
	{ id: "target-4", code: "NV-04", name: "Đã nghỉ", status: "inactive" },
].map(
	(employee) =>
		({
			...employee,
			phone: "",
			email: "",
			createdAt: "2026-01-01T00:00:00.000Z",
		}) as SalesEmployee,
);

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

	it("file cũ thiếu hai cột vẫn mặc định hoạt động và chưa thiết lập thời hạn", () => {
		const preview = parseCustomerRows(
			"old.xlsx",
			[headers, ["OLD", "Khách hàng cũ", "", "Hà Nội", "Hà Nội"]],
			[],
		);
		expect(preview.readyCount).toBe(1);
		expect(preview.rows[0].draft.status).toBe("active");
		expect(preview.rows[0].draft).not.toHaveProperty("paymentTermDays");
	});

	it("giữ thời hạn và trạng thái với số, chữ số và ô trống", () => {
		const preview = parseCustomerRows(
			"terms.xlsx",
			[
				[...headers, "Thời hạn công nợ (ngày)", "Trạng thái"],
				["A", "Khách A", "", "Hà Nội", "Hà Nội", 90, "Tạm ngưng"],
				["B", "Khách B", "", "Hà Nội", "Hà Nội", "0", "Đang hoạt động"],
				["C", "Khách C", "", "Hà Nội", "Hà Nội", null, ""],
			],
			[],
		);
		expect(preview.readyCount).toBe(3);
		expect(preview.rows[0].draft).toMatchObject({
			paymentTermDays: 90,
			status: "paused",
		});
		expect(preview.rows[1].draft).toMatchObject({
			paymentTermDays: 0,
			status: "active",
		});
		expect(preview.rows[2].draft.status).toBe("active");
		expect(preview.rows[2].draft).not.toHaveProperty("paymentTermDays");
	});

	it.each([-1, 1.5, "abc", "30 ngày", "9007199254740992", true])(
		"báo lỗi thời hạn không hợp lệ: %s",
		(value) => {
			const preview = parseCustomerRows(
				"invalid.xlsx",
				[
					[...headers, "Thời hạn công nợ (ngày)"],
					["A", "Khách A", "", "Hà Nội", "Hà Nội", value],
				],
				[],
			);
			expect(preview.invalidCount).toBe(1);
			expect(preview.rows[0].message).toContain("số nguyên không âm");
		},
	);

	it("báo lỗi trạng thái lạ thay vì tự chuyển sang đang hoạt động", () => {
		const preview = parseCustomerRows(
			"invalid.xlsx",
			[
				[...headers, "Trạng thái"],
				["A", "Khách A", "", "Hà Nội", "Hà Nội", "Không rõ"],
			],
			[],
		);
		expect(preview.invalidCount).toBe(1);
		expect(preview.rows[0].message).toContain("Trạng thái");
	});

	it("ghép nhân viên theo mã, tên duy nhất và xem trước nhân viên cần tạo mới", () => {
		const preview = parseCustomerRows(
			"employees.xlsx",
			[
				[
					...headers,
					"Mã nhân viên phụ trách",
					"Nhân viên phụ trách",
					"Ngày bắt đầu phụ trách",
				],
				[
					"A",
					"Khách A",
					"",
					"Hà Nội",
					"Hà Nội",
					"0007",
					"Nguyễn Văn An",
					"01/10/2026",
				],
				["B", "Khách B", "", "Hà Nội", "Hà Nội", "", " Nguyễn   Văn An ", ""],
				[
					"C",
					"Khách C",
					"",
					"Hà Nội",
					"Hà Nội",
					"NV-NEW",
					"Người mới",
					"2026-10-02",
				],
				["D", "Khách D", "", "Hà Nội", "Hà Nội", "NV-NEW", "Người mới", ""],
				["E", "Khách E", "", "Hà Nội", "Hà Nội", "NV-02", "Trùng Tên", ""],
			],
			[],
			{ employees },
		);
		expect(preview.readyCount).toBe(5);
		expect(preview.rows[0].draft).toMatchObject({
			employeeCode: "0007",
			employeeName: "Nguyễn Văn An",
			assignmentFrom: "2026-10-01",
		});
		expect(preview.rows[0].draft).not.toHaveProperty("employeeId");
		expect(preview.rows[1].employeeMessage).toContain("0007");
		expect(preview.rows[2].employeeMessage).toContain("Sẽ tạo nhân viên");
		expect(preview.rows[3].employeeMessage).toContain("NV-NEW");
		expect(preview.rows[3].employeeMessage).not.toContain("Sẽ tạo");
	});

	it.each([
		["", "Trùng Tên", "", "bị trùng"],
		["0007", "Tên người khác", "", "thuộc tên khác"],
		["MA-KHAC", "Nguyễn Văn An", "", "đã có mã khác"],
		["NV-04", "Đã nghỉ", "", "ngừng hoạt động"],
		["KHONG-CO", "", "", "Cần tên nhân viên"],
		["0007", "Nguyễn Văn An", "31/02/2026", "Ngày bắt đầu"],
		["", "", "2026-10-01", "thiếu nhân viên"],
	])(
		"báo lỗi nhân viên hoặc ngày phân công: %s %s %s",
		(code, name, date, message) => {
			const preview = parseCustomerRows(
				"invalid.xlsx",
				[
					[
						...headers,
						"Mã nhân viên phụ trách",
						"Nhân viên phụ trách",
						"Ngày bắt đầu phụ trách",
					],
					["A", "Khách A", "", "Hà Nội", "Hà Nội", code, name, date],
				],
				[],
				{ employees },
			);
			expect(preview.invalidCount).toBe(1);
			expect(preview.rows[0].message).toContain(message);
		},
	);

	it("báo mâu thuẫn nhân viên ngay trong cùng file và chặn nhập phân công ngoài quyền quản trị", () => {
		const sheet: SheetData = [
			[...headers, "Mã nhân viên phụ trách", "Nhân viên phụ trách"],
			["A", "Khách A", "", "Hà Nội", "Hà Nội", "NV-NEW", "Tên A"],
			["B", "Khách B", "", "Hà Nội", "Hà Nội", "NV-NEW", "Tên B"],
		];
		const preview = parseCustomerRows("conflict.xlsx", sheet, []);
		expect(preview.readyCount).toBe(1);
		expect(preview.invalidCount).toBe(1);
		const restricted = parseCustomerRows("restricted.xlsx", sheet, [], {
			canImportAssignments: false,
		});
		expect(restricted.readyCount).toBe(0);
		expect(restricted.rows[0].message).toContain("quản trị viên");
	});
});
