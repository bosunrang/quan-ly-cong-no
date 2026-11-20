import { useEffect, useRef, useState } from "react";
import {
	readBranding,
	readSettings,
	writeSettings,
} from "../../domain/settings/settings.repository";
import {
	type AppSettings,
	defaultSettings,
} from "../../domain/settings/settings.model";
import { reportStorageIssue } from "../../shared/storage/storageIssues";

type State = {
	session?: string;
	data: AppSettings;
	revision?: string;
	error?: string;
};

export function useAppSettings(session?: string) {
	const [snapshot, setSnapshot] = useState<State>();
	const request = useRef(0);

	useEffect(() => {
		const id = ++request.current;
		const response = session
			? readSettings()
			: readBranding().then((data) => ({ data, revision: undefined }));
		void response
			.then((result) => {
				if (request.current === id) setSnapshot({ ...result, session });
			})
			.catch((reason: unknown) => {
				const error =
					reason instanceof Error
						? reason.message
						: "Không thể tải cài đặt của công ty.";
				if (request.current === id)
					setSnapshot({ session, data: defaultSettings, error });
			});
		return () => {
			++request.current;
		};
	}, [session]);

	const current = snapshot?.session === session ? snapshot : undefined;
	async function saveSettings(next: AppSettings) {
		if (!current?.revision) return false;
		const id = request.current;
		try {
			const saved = await writeSettings(next, current.revision);
			if (request.current === id) {
				setSnapshot({ ...saved, session });
			}
			return true;
		} catch (reason) {
			reportStorageIssue(
				reason instanceof Error ? reason.message : "Không thể lưu cài đặt.",
				reason,
			);
			return false;
		}
	}
	return {
		settings: current?.data ?? defaultSettings,
		error: current?.error,
		loading: !current,
		saveSettings,
	};
}
