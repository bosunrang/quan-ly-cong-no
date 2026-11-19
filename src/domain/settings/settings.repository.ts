import {
	defaultSettings,
	isAppSettings,
	normalizeSettings,
	type AppSettings,
} from "./settings.model";
import {
	readVersionedLocalStorage,
	reportStorageIssue,
	writeVersionedLocalStorage,
} from "../../shared/storage/localStorage";

export const SETTINGS_STORAGE_KEY = "cong-no.settings.v2";
const STORAGE_VERSION = 2;
const MAX_LOGO_DATA_URL_LENGTH = 1_500_000;

export function readSettings(): AppSettings {
	return normalizeSettings(
		readVersionedLocalStorage({
			key: SETTINGS_STORAGE_KEY,
			label: "cài đặt ứng dụng",
			version: STORAGE_VERSION,
			fallback: () => ({ ...defaultSettings }),
			isValid: isAppSettings,
		}),
	);
}

export function writeSettings(settings: AppSettings): boolean {
	const normalized = normalizeSettings(settings);
	if (
		normalized.logoDataUrl &&
		normalized.logoDataUrl.length > MAX_LOGO_DATA_URL_LENGTH
	) {
		reportStorageIssue(
			"Logo quá lớn để lưu an toàn. Vui lòng chọn ảnh nhỏ hơn 1 MB.",
		);
		return false;
	}
	return writeVersionedLocalStorage(
		SETTINGS_STORAGE_KEY,
		STORAGE_VERSION,
		normalized,
		"cài đặt ứng dụng",
	);
}
