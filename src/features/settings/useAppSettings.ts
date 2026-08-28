import { useCallback, useState } from "react";
import {
	readSettings,
	writeSettings,
} from "../../domain/settings/settings.repository";
import type { AppSettings } from "../../domain/settings/settings.model";

export function useAppSettings() {
	const [settings, setSettings] = useState<AppSettings>(readSettings);

	const saveSettings = useCallback((nextSettings: AppSettings) => {
		if (!writeSettings(nextSettings)) return false;
		setSettings(nextSettings);
		return true;
	}, []);

	return { settings, saveSettings };
}
