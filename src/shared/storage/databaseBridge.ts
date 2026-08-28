export interface DatabaseEnvelope {
	version: number;
	data: unknown;
}

interface DatabaseResponse<T> {
	ok: boolean;
	value?: T;
	error?: string;
}

export interface DatabaseStatus {
	backend: "sqlite";
	schemaVersion: number;
}

interface MktDatabaseBridge {
	readDataset: (key: string) => DatabaseResponse<DatabaseEnvelope | null>;
	writeDataset: (
		key: string,
		version: number,
		data: unknown,
	) => DatabaseResponse<boolean>;
	queryProducts: (options: unknown) => DatabaseResponse<unknown>;
	readProductDetail: (productId: string) => DatabaseResponse<unknown>;
	writeMisaDetails: (
		version: number,
		rows: unknown[],
	) => DatabaseResponse<boolean>;
	queryMisaDetails: (options: unknown) => DatabaseResponse<unknown>;
	queryMisaRange: (options: unknown) => DatabaseResponse<unknown>;
	status: () => DatabaseResponse<DatabaseStatus>;
}

declare global {
	interface Window {
		mktDatabase?: MktDatabaseBridge;
	}
}

export function getDatabaseBridge(): MktDatabaseBridge | undefined {
	return typeof window === "undefined" ? undefined : window.mktDatabase;
}

export function getDatabaseStatus(): DatabaseStatus | undefined {
	const response = getDatabaseBridge()?.status();
	return response?.ok ? response.value : undefined;
}
