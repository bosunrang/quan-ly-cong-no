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

const SETTINGS_STORAGE_KEY = "mkt-cost.settings.v2";
const STORAGE_VERSION = 2;
const LEGACY_STORAGE_KEY = "mkt-cost.settings";
const MAX_LOGO_DATA_URL_LENGTH = 1_500_000;

export function readSettings(): AppSettings {
	return readVersionedLocalStorage({
		key: SETTINGS_STORAGE_KEY,
		label: "cài đặt ứng dụng",
		version: STORAGE_VERSION,
		fallback: () => ({ ...defaultSettings }),
		isValid: isAppSettings,
		legacy: [
			{
				key: LEGACY_STORAGE_KEY,
				migrate: (value) =>
					value && typeof value === "object" && !Array.isArray(value)
						? normalizeSettings(value)
						: undefined,
			},
		],
	});
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
