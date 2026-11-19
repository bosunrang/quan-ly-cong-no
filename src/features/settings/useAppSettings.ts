import { useCallback, useState } from "react";
import {
	readSettings,
	writeSettings,
} from "../../domain/settings/settings.repository";
import type { AppSettings } from "../../domain/settings/settings.model";
import { recordActivity } from "../../shared/storage/activityLog";
import { reportStorageIssue } from "../../shared/storage/localStorage";

export function useAppSettings() {
	const [settings, setSettings] = useState<AppSettings>(readSettings);

	const saveSettings = useCallback((nextSettings: AppSettings) => {
		if (!writeSettings(nextSettings)) return false;
		setSettings(nextSettings);
		void recordActivity("settings", "Lưu cấu hình ứng dụng");
		return true;
	}, []);

	const reloadSettings = useCallback(() => {
		try {
			setSettings(readSettings());
		} catch (error) {
			reportStorageIssue("Không thể tải cài đặt của công ty.", error);
		}
	}, []);

	return { settings, saveSettings, reloadSettings };
}
