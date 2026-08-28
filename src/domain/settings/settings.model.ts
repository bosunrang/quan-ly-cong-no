export interface AppSettings {
	companyName: string;
	companyAddress: string;
	displayName: string;
	tagline: string;
	logoDataUrl: string | null;
}

export const defaultSettings: AppSettings = {
	companyName: "",
	companyAddress: "",
	displayName: "MKT Cost",
	tagline: "Quản lý chiết khấu",
	logoDataUrl: null,
};

export function normalizeSettings(value: unknown): AppSettings {
	const source =
		value && typeof value === "object" ? (value as Partial<AppSettings>) : {};
	const companyName =
		source.companyName === "CÔNG TY CỔ PHẦN ..." ? "" : source.companyName;
	const companyAddress =
		source.companyAddress === "Nhập địa chỉ doanh nghiệp"
			? ""
			: source.companyAddress;

	return {
		companyName:
			typeof companyName === "string"
				? companyName
				: defaultSettings.companyName,
		companyAddress:
			typeof companyAddress === "string"
				? companyAddress
				: defaultSettings.companyAddress,
		displayName:
			typeof source.displayName === "string"
				? source.displayName
				: defaultSettings.displayName,
		tagline:
			typeof source.tagline === "string"
				? source.tagline
				: defaultSettings.tagline,
		logoDataUrl:
			typeof source.logoDataUrl === "string" ? source.logoDataUrl : null,
	};
}

export function isAppSettings(value: unknown): value is AppSettings {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const settings = value as Record<string, unknown>;
	return (
		typeof settings.companyName === "string" &&
		typeof settings.companyAddress === "string" &&
		typeof settings.displayName === "string" &&
		typeof settings.tagline === "string" &&
		(typeof settings.logoDataUrl === "string" || settings.logoDataUrl === null)
	);
}
