import { api } from "../../shared/api/client";
import { forgetCachedDataset } from "../../shared/storage/datasetCache";
import { validateBusinessBackup } from "./business-data.rules.mjs";
import type { BusinessBackup, BusinessChange } from "./business-data.types";

export async function exportBusinessBackup(): Promise<BusinessBackup> {
	return validateBusinessBackup(
		await api<BusinessBackup>("GET", "business-backup"),
	);
}

export async function changeBusinessData(change: BusinessChange) {
	const saved =
		change.type === "restore"
			? await api<boolean>("POST", "business-backup/restore", {
					backup: change.backup,
				})
			: await api<boolean>("DELETE", "business-data", {
					groups: change.groups,
				});
	if (!saved) throw new Error("Không thể cập nhật dữ liệu.");
	forgetCachedDataset();
}
