import { api } from "../../shared/api/client";
import { type AppSettings, normalizeSettings } from "./settings.model";

interface SettingsSnapshot {
	data: AppSettings;
	revision: string;
}

export async function readBranding() {
	return normalizeSettings(await api<AppSettings>("GET", "branding"));
}
export async function readSettings() {
	const result = await api<SettingsSnapshot>("GET", "settings");
	return { ...result, data: normalizeSettings(result.data) };
}
export async function writeSettings(settings: AppSettings, expected: string) {
	const data = normalizeSettings(settings);
	if (data.logoDataUrl && data.logoDataUrl.length > 1_500_000)
		throw new Error(
			"Logo quá lớn để lưu an toàn. Vui lòng chọn ảnh nhỏ hơn 1 MB.",
		);
	const result = await api<SettingsSnapshot>("PUT", "settings", {
		data,
		expected,
	});
	return { ...result, data: normalizeSettings(result.data) };
}
