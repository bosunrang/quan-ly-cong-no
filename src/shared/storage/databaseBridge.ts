export interface DatabaseEnvelope {
	version: number;
	data: unknown;
}

export const BROWSER_SALES_DATABASE = "cong-no-misa-sales";
export const ACCOUNTS_STORAGE_KEY = "cong-no.accounts.v1";

interface DatabaseResponse<T> {
	ok: boolean;
	value?: T;
	error?: string;
}

export interface DatabaseStatus {
	backend: "sqlite";
	schemaVersion: number;
}

export interface AppBranding {
	displayName: string;
	tagline: string;
	logoDataUrl: string | null;
}

interface CongNoDatabaseBridge {
	exportBusinessBackup: () => Promise<DatabaseResponse<unknown>>;
	changeBusinessData: (change: unknown) => Promise<DatabaseResponse<boolean>>;
	readDataset: (key: string) => DatabaseResponse<DatabaseEnvelope | null>;
	readDatasetAsync?: (
		key: string,
	) => Promise<DatabaseResponse<DatabaseEnvelope | null>>;
	datasetStamp?: (key: string) => Promise<DatabaseResponse<string | null>>;
	writeDataset: (
		key: string,
		version: number,
		data: unknown,
	) => DatabaseResponse<boolean>;
	writeReceiptLedger: (
		revision: string,
		data: unknown,
		salesBookImportedAt?: string,
	) => DatabaseResponse<boolean> | Promise<DatabaseResponse<boolean>>;
	writeMisaSalesBook: (
		expectedImportedAt: string | null,
		data: unknown,
	) => DatabaseResponse<boolean> | Promise<DatabaseResponse<boolean>>;
	clearAllData: (branding: AppBranding) => DatabaseResponse<boolean>;
	appendActivity: (entry: unknown) => DatabaseResponse<boolean>;
	writeAccounts: (expected: unknown[], accounts: unknown[]) => DatabaseResponse<boolean>;
	readActivities: () => DatabaseResponse<unknown>;
	status: () => DatabaseResponse<DatabaseStatus>;
}

declare global {
	interface Window {
		congNoDatabase?: CongNoDatabaseBridge;
	}
}

export function getDatabaseBridge(): CongNoDatabaseBridge | undefined {
	return typeof window === "undefined" ? undefined : window.congNoDatabase;
}

export function getDatabaseStatus(): DatabaseStatus | undefined {
	const response = getDatabaseBridge()?.status();
	return response?.ok ? response.value : undefined;
}
