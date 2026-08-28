import {
	readVersionedLocalStorage,
	writeVersionedLocalStorage,
} from "../../shared/storage/localStorage";
import {
	isReconciliationData,
	type ReconciliationData,
} from "./reconciliation.model";
import { seedReconciliationData } from "./reconciliation.seed";
import { normalizeDateOnly } from "../../shared/lib/date";

const STORAGE_KEY = "mkt-cost.reconciliation.v2";
const LEGACY_STORAGE_KEY = "mkt-cost.reconciliation.v1";
const STORAGE_VERSION = 2;

const cloneSeed = () => structuredClone(seedReconciliationData);

export function readReconciliationData(): ReconciliationData {
	return readVersionedLocalStorage({
		key: STORAGE_KEY,
		label: "đối soát",
		version: STORAGE_VERSION,
		fallback: cloneSeed,
		isValid: isReconciliationData,
		legacy: [
			{
				key: LEGACY_STORAGE_KEY,
				migrate: (value) => {
					const source =
						value &&
						typeof value === "object" &&
						!Array.isArray(value) &&
						"data" in value
							? value.data
							: value;
					if (!source || typeof source !== "object" || Array.isArray(source))
						return undefined;
					const data = source as Record<string, unknown>;
					const migrated = {
						...data,
						updatedThrough:
							typeof data.updatedThrough === "string"
								? normalizeDateOnly(data.updatedThrough)
								: undefined,
					};
					return isReconciliationData(migrated) ? migrated : undefined;
				},
			},
		],
	});
}

export function writeReconciliationData(data: ReconciliationData): boolean {
	return writeVersionedLocalStorage(
		STORAGE_KEY,
		STORAGE_VERSION,
		data,
		"dữ liệu đối soát",
	);
}
