import { describe, expect, it } from "vitest";
import type { Customer } from "../src/domain/customers/customer.model";
import { isMisaUnitDiscountEligible } from "../src/domain/misa/misa.model";
import { parseMisaRows } from "../src/features/misa/misa.import";

type SheetData = Parameters<typeof parseMisaRows>[1];

const customer = {
	id: "customer-a",
	misaCode: "KH-A",
	name: "Bệnh viện Đa khoa A",
} as Customer;

const titleRows = [
	["CHI TIẾT CÔNG NỢ PHẢI THU"],
	["Tài khoản: 131; Từ ngày 01/01/2026 đến ngày 31/08/2026"],
];

const twoLevelHeaders = [
	[
		null,
		"Tên khách hàng",
		"Ngày chứng từ",
		"Số chứng từ",
		"Diễn giải",
		"ĐVT",
		"Số lượng",
		"Đơn giá",
		"Diễn giải chung",
		"TK công nợ",
		"TK đối ứng",
		"Phát sinh",
		null,
		"Số dư",
		null,
	],
	[
		null,
		null,
		null,
		null,
		null,
		null,
		null,
		null,
		null,
		null,
		null,
		"Nợ",
		"Có",
		"Nợ",
		"Có",
	],
];

const flatHeaders = [
	"Tên khách hàng",
	"Ngày chứng từ",
	"Số chứng từ",
	"Diễn giải",
	"ĐVT",
	"Số lượng",
	"Đơn giá",
	"Diễn giải chung",
	"TK công nợ",
	"TK đối ứng",
	"Phát sinh Nợ",
	"Phát sinh Có",
	"Số dư Nợ",
	"Số dư Có",
];

describe("MISA import", () => {
	it("đủ điều kiện chi khi đã thu bằng hoặc nhiều hơn doanh số bán", () => {
		expect(
			isMisaUnitDiscountEligible({
				salesAmount: 100000,
				receiptAmount: 100000,
			}),
		).toBe(true);
		expect(
			isMisaUnitDiscountEligible({
				salesAmount: 100000,
				receiptAmount: 120000,
			}),
		).toBe(true);
		expect(
			isMisaUnitDiscountEligible({
				salesAmount: 100000,
				receiptAmount: 99999,
			}),
		).toBe(false);
	});

	it("nhận diện trả hàng theo số lượng âm, không phụ thuộc số chứng từ", () => {
		const result = parseMisaRows(
			"misa.xlsx",
			[
				flatHeaders,
				[
					"Bệnh viện Đa khoa A",
					"13/04/2026",
					"CTY-THANH-VIEN-A-INV-001",
					"Influvac Tetra 0.5ml",
					"Lọ",
					100,
					229000,
					"Bán hàng",
					131,
					511,
					22900000,
					0,
					22900000,
					0,
				],
				[
					"Bệnh viện Đa khoa A",
					"09/06/2026",
					"CTY-THANH-VIEN-B-00077",
					"Influvac Tetra 0.5ml",
					"Lọ",
					-50,
					229000,
					"Bù trừ công nợ",
					131,
					521,
					0,
					11450000,
					11450000,
					0,
				],
			],
			[customer],
			new Date("2026-08-27T01:00:00.000Z"),
		);

		expect(result.rows[1]).toMatchObject({
			documentNumber: "CTY-THANH-VIEN-B-00077",
			quantity: -50,
			documentKind: "sale",
		});
		expect(result.units[0]).toMatchObject({
			salesLineCount: 2,
			salesDocumentCount: 2,
			salesAmount: 11450000,
		});
	});

	it("gom dòng bán, thu tiền và số dư theo từng đơn vị", () => {
		const sheet: SheetData = [
			...titleRows,
			...twoLevelHeaders,
			[
				"Tên khách hàng : Bệnh viện Đa khoa A (4)",
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				200000,
				50000,
				null,
				null,
			],
			[
				null,
				"Bệnh viện Đa khoa A",
				null,
				null,
				"Số dư đầu kỳ",
				null,
				null,
				null,
				null,
				null,
				null,
				0,
				0,
				100000,
				0,
			],
			[
				null,
				"Bệnh viện Đa khoa A",
				"05/01/2026",
				"BH260001",
				"Sản phẩm 1",
				"Hộp",
				2,
				50000,
				null,
				131,
				511,
				100000,
				0,
				200000,
				0,
			],
			[
				null,
				"Bệnh viện Đa khoa A",
				"05/01/2026",
				"BH260001",
				"Sản phẩm 2",
				"Hộp",
				1,
				100000,
				null,
				131,
				511,
				100000,
				0,
				300000,
				0,
			],
			[
				null,
				"Bệnh viện Đa khoa A",
				"08/01/2026",
				"NTTK26001",
				"Thu tiền",
				null,
				null,
				null,
				null,
				131,
				112,
				0,
				50000,
				250000,
				0,
			],
			[
				"Tên khách hàng : Phòng khám B (1)",
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				10000,
				0,
				null,
				null,
			],
			[
				null,
				"Phòng khám B",
				"10/01/2026",
				"NVK26001",
				"Điều chỉnh",
				null,
				null,
				null,
				null,
				131,
				331,
				10000,
				0,
				10000,
				0,
			],
			[
				"Số dòng = 5",
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				null,
			],
		];

		const result = parseMisaRows(
			"misa.xlsx",
			sheet,
			[customer],
			new Date("2026-08-27T01:00:00.000Z"),
		);

		expect(result).toMatchObject({
			fileName: "misa.xlsx",
			periodFrom: "2026-01-05",
			periodTo: "2026-01-10",
			sourceRowCount: 4,
			detailsAvailable: true,
		});
		expect(result.rows).toHaveLength(4);
		expect(result.rows[0]).toMatchObject({
			date: "2026-01-05",
			documentNumber: "BH260001",
			description: "Sản phẩm 1",
			unit: "Hộp",
			quantity: 2,
			unitPrice: 50000,
			debtAccount: "131",
			contraAccount: "511",
			debit: 100000,
			balanceDebit: 200000,
			balanceCredit: 0,
			documentKind: "sale",
		});
		expect(result.units).toHaveLength(2);
		expect(result.units[0]).toMatchObject({
			name: "Bệnh viện Đa khoa A",
			customerId: "customer-a",
			customerCode: "KH-A",
			sourceRowCount: 3,
			salesLineCount: 2,
			salesDocumentCount: 1,
			receiptDocumentCount: 1,
			salesAmount: 200000,
			receiptAmount: 50000,
			openingBalance: 100000,
		});
		expect(result.units[1]).toMatchObject({
			name: "Phòng khám B",
			customerId: null,
			adjustmentDocumentCount: 1,
		});
	});

	it("đối chiếu tên không phân biệt dấu và hoa thường", () => {
		const sheet: SheetData = [
			flatHeaders,
			[
				"BENH VIEN DA KHOA A",
				"01/02/2026",
				"BH01",
				"Sản phẩm",
				"Hộp",
				1,
				100,
				"Bán hàng",
				131,
				511,
				100,
				0,
				100,
				0,
			],
		];
		const result = parseMisaRows("misa.xlsx", sheet, [customer]);
		expect(result.units[0].customerId).toBe("customer-a");
	});

	it("không tự ghép khi danh mục có hai tên trùng sau chuẩn hóa", () => {
		const sheet: SheetData = [
			flatHeaders,
			[
				"Bệnh viện Đa khoa A",
				"01/02/2026",
				"BH01",
				"Sản phẩm",
				"Hộp",
				1,
				100,
				"Bán hàng",
				131,
				511,
				100,
				0,
				100,
				0,
			],
		];
		const duplicate = {
			...customer,
			id: "customer-a-2",
			name: "BENH VIEN DA KHOA A",
		};
		const result = parseMisaRows("misa.xlsx", sheet, [customer, duplicate]);
		expect(result.units[0].customerId).toBeNull();
	});

	it("từ chối file không đúng cấu trúc báo cáo MISA", () => {
		expect(() => parseMisaRows("wrong.xlsx", [["Tên khách hàng"]], [])).toThrow(
			"Không nhận ra cấu trúc file",
		);
	});
});
