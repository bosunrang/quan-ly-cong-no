import { describe, expect, it } from "vitest";
import {
	defaultSettings,
	isAppSettings,
	normalizeSettings,
} from "../src/domain/settings/settings.model";
import { statementSeller } from "../src/features/reports/report.model";

const nhv = "CÔNG TY CỔ PHẦN VẮC XIN VÀ SINH PHẨM NAM HƯNG VIỆT";
const legacyRecord = {
	companyName: nhv,
	companyAddress: "",
	displayName: "Nam Hưng Việt",
	tagline: "Quản lý công nợ",
	logoDataUrl: null,
};

describe("Thông tin bên bán trong Cài đặt", () => {
	it("chấp nhận cài đặt cũ chưa có trường bên bán", () => {
		expect(isAppSettings(legacyRecord)).toBe(true);
		expect(isAppSettings({ ...legacyRecord, bankAccounts: [1] })).toBe(false);
	});

	it("điền một lần thông tin bên bán đang in cho kho Nam Hưng Việt cũ", () => {
		const settings = normalizeSettings(legacyRecord);
		expect(settings.bankAccounts).toHaveLength(2);
		expect(settings.signatoryTitle).toBe("Giám đốc");
		expect(settings.companyAddress).toContain("Nguyễn Thị Thập");
		const seller = statementSeller(settings);
		expect(seller.name).toBe(nhv);
		expect(seller.accounts).toEqual(settings.bankAccounts);
	});

	it("không điền thông tin Nam Hưng Việt cho công ty khác hoặc sau khi đã lưu", () => {
		const other = normalizeSettings({ ...legacyRecord, companyName: "Winbio" });
		expect(other).toMatchObject({
			bankAccounts: [],
			accountingContact: "",
			signatoryName: "",
			companyAddress: "",
		});
		const cleared = normalizeSettings({
			...legacyRecord,
			bankAccounts: [],
			accountingContact: "",
			signatoryName: "",
			signatoryTitle: "",
		});
		expect(cleared.bankAccounts).toEqual([]);
		expect(cleared.signatoryName).toBe("");
	});

	it("lấy bên bán chỉ từ Cài đặt", () => {
		expect(
			statementSeller(
				normalizeSettings({
					...defaultSettings,
					companyName: "Công ty B",
					bankAccounts: [" 001 tại VCB ", "", "002 tại BIDV", "003", "004"],
					signatoryName: "Trần B",
					signatoryTitle: "Kế toán trưởng",
				}),
			),
		).toEqual({
			name: "Công ty B",
			address: "",
			accounts: ["001 tại VCB", "002 tại BIDV", "003"],
			contact: "",
			signatory: "Trần B",
			signatoryTitle: "Kế toán trưởng",
		});
	});
});
