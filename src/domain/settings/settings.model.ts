export interface AppSettings {
	companyName: string;
	companyAddress: string;
	/** Tài khoản ngân hàng in trên biên bản đối chiếu, tối đa ba dòng. */
	bankAccounts: string[];
	accountingContact: string;
	signatoryName: string;
	signatoryTitle: string;
	displayName: string;
	tagline: string;
	logoDataUrl: string | null;
}

export const MAX_BANK_ACCOUNTS = 3;

export const defaultSettings: AppSettings = {
	companyName: "",
	companyAddress: "",
	bankAccounts: [],
	accountingContact: "",
	signatoryName: "",
	signatoryTitle: "",
	displayName: "Công nợ",
	tagline: "Quản lý khoản phải thu",
	logoDataUrl: null,
};

/**
 * Trước khi có các trường bên bán, biên bản của Nam Hưng Việt lấy thông tin này
 * từ mã nguồn. Dữ liệu cũ chưa có trường bên bán được điền một lần để biên bản
 * không đổi; sau khi lưu Cài đặt, giá trị do người dùng quản lý.
 */
const legacySeller = {
	name: "CÔNG TY CỔ PHẦN VẮC XIN VÀ SINH PHẨM NAM HƯNG VIỆT",
	address: "Số 89 đường Nguyễn Thị Thập, Khu Him Lam, P. Tân Hưng, Tp.HCM",
	bankAccounts: [
		"007.1000.692833 tại Ngân hàng Vietcombank - CN Hồ Chí Minh",
		"6160.20100.8991 tại Ngân hàng NN&PTNT Việt Nam - CN Nam Sài Gòn",
	],
	accountingContact:
		"Phòng kế toán · 028.2223 2425 - nhánh 368 hoặc 0937 826 876 (Ms Ngọc)",
	signatoryName: "ĐỖ UYÊN THIÊN NHUNG",
	signatoryTitle: "Giám đốc",
};

const text = (value: unknown) => (typeof value === "string" ? value : undefined);

function bankAccountsOf(value: unknown) {
	return Array.isArray(value)
		? value
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim())
				.filter(Boolean)
				.slice(0, MAX_BANK_ACCOUNTS)
		: undefined;
}

export function normalizeSettings(value: unknown): AppSettings {
	const source =
		value && typeof value === "object"
			? (value as Partial<Record<keyof AppSettings, unknown>>)
			: {};
	const companyName =
		source.companyName === "CÔNG TY CỔ PHẦN ..." ? "" : text(source.companyName);
	const companyAddress =
		source.companyAddress === "Nhập địa chỉ doanh nghiệp"
			? ""
			: text(source.companyAddress);
	const legacy =
		source.bankAccounts === undefined &&
		source.accountingContact === undefined &&
		source.signatoryName === undefined &&
		source.signatoryTitle === undefined &&
		(companyName ?? "").trim().normalize("NFC").toLocaleUpperCase("vi-VN") ===
			legacySeller.name
			? legacySeller
			: undefined;
	const displayName = text(source.displayName);
	const tagline = text(source.tagline);

	return {
		companyName: companyName ?? defaultSettings.companyName,
		companyAddress:
			companyAddress || legacy?.address || defaultSettings.companyAddress,
		bankAccounts: bankAccountsOf(source.bankAccounts) ??
			legacy?.bankAccounts ?? [...defaultSettings.bankAccounts],
		accountingContact:
			text(source.accountingContact) ??
			legacy?.accountingContact ??
			defaultSettings.accountingContact,
		signatoryName:
			text(source.signatoryName) ??
			legacy?.signatoryName ??
			defaultSettings.signatoryName,
		signatoryTitle:
			text(source.signatoryTitle) ??
			legacy?.signatoryTitle ??
			defaultSettings.signatoryTitle,
		displayName: displayName ?? defaultSettings.displayName,
		tagline: tagline ?? defaultSettings.tagline,
		logoDataUrl:
			typeof source.logoDataUrl === "string" ? source.logoDataUrl : null,
	};
}

export function isAppSettings(value: unknown): value is AppSettings {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const settings = value as Record<string, unknown>;
	const optionalText = (key: string) =>
		settings[key] === undefined || typeof settings[key] === "string";
	// Các trường bên bán có thể chưa có ở dữ liệu cũ; normalizeSettings bổ sung sau.
	return (
		typeof settings.companyName === "string" &&
		typeof settings.companyAddress === "string" &&
		typeof settings.displayName === "string" &&
		typeof settings.tagline === "string" &&
		(typeof settings.logoDataUrl === "string" ||
			settings.logoDataUrl === null) &&
		(settings.bankAccounts === undefined ||
			(Array.isArray(settings.bankAccounts) &&
				settings.bankAccounts.every((item) => typeof item === "string"))) &&
		optionalText("accountingContact") &&
		optionalText("signatoryName") &&
		optionalText("signatoryTitle")
	);
}
