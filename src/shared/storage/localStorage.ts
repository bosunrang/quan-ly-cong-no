import { getDatabaseBridge } from "./databaseBridge";
import { lanEndpoint, readLanDirectory, writeLanDirectory } from "./lanStorage";

interface VersionedStorageOptions<T> {
	key: string;
	label: string;
	version: number;
	fallback: () => T;
	isValid: (value: unknown) => value is T;
}

interface StoredEnvelope<T> {
	version: number;
	data: T;
}

type JsonReadResult =
	| { status: "missing" }
	| { status: "valid"; raw: string; value: unknown }
	| { status: "invalid"; raw?: string };

type DatabaseReadResult =
	| { status: "unavailable" | "missing" | "invalid" }
	| { status: "valid"; value: unknown };

const STORAGE_ISSUE_EVENT = "cong-no:storage-issue";
let pendingStorageIssue: string | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function reportStorageIssue(message: string, cause?: unknown): void {
	pendingStorageIssue = message;
	console.error(message, cause);
	if (typeof window !== "undefined") {
		queueMicrotask(() =>
			window.dispatchEvent(
				new CustomEvent<string>(STORAGE_ISSUE_EVENT, { detail: message }),
			),
		);
	}
}

export function consumeStorageIssue(): string | undefined {
	const issue = pendingStorageIssue;
	pendingStorageIssue = undefined;
	return issue;
}

export function subscribeStorageIssues(
	listener: (message: string) => void,
): () => void {
	if (typeof window === "undefined") return () => undefined;
	const handleIssue = (event: Event) =>
		listener((event as CustomEvent<string>).detail);
	window.addEventListener(STORAGE_ISSUE_EVENT, handleIssue);
	return () => window.removeEventListener(STORAGE_ISSUE_EVENT, handleIssue);
}

function readJson(key: string, label: string): JsonReadResult {
	if (typeof window === "undefined") return { status: "missing" };
	let raw: string | null;
	try {
		raw = window.localStorage.getItem(key);
	} catch (error) {
		reportStorageIssue(
			`Không thể truy cập vùng lưu trữ ${label}. Dữ liệu hiện tại chưa được thay đổi.`,
			error,
		);
		return { status: "invalid" };
	}
	if (raw === null) return { status: "missing" };
	try {
		return { status: "valid", raw, value: JSON.parse(raw) };
	} catch (error) {
		quarantineValue(key, raw, label);
		reportStorageIssue(
			`Dữ liệu ${label} không đọc được. App đang dùng dữ liệu mặc định và đã giữ một bản sao lỗi.`,
			error,
		);
		return { status: "invalid", raw };
	}
}

function readDatabase(key: string, label: string): DatabaseReadResult {
	const bridge = getDatabaseBridge();
	if (!bridge) return { status: "unavailable" };
	const response = bridge.readDataset(key);
	if (!response.ok) {
		reportStorageIssue(
			`Không thể đọc ${label} từ SQLite. Dữ liệu chưa bị thay đổi.`,
			response.error,
		);
		return { status: "invalid" };
	}
	return response.value === null || response.value === undefined
		? { status: "missing" }
		: { status: "valid", value: response.value };
}

function quarantineValue(key: string, raw: string, label: string): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(`${key}.corrupt.${Date.now()}`, raw);
	} catch (error) {
		console.error(`Không thể tạo bản sao dữ liệu lỗi cho ${label}.`, error);
	}
}

function invalidSchema(key: string, raw: string, label: string): void {
	quarantineValue(key, raw, label);
	reportStorageIssue(
		`Dữ liệu ${label} không đúng cấu trúc. App đang dùng dữ liệu mặc định và đã giữ một bản sao lỗi.`,
	);
}

export function readVersionedLocalStorage<T>(
	options: VersionedStorageOptions<T>,
): T {
	if (lanEndpoint()) {
		const envelope = readLanDirectory(options.key);
		if (envelope?.version === options.version && options.isValid(envelope.data))
			return envelope.data;
		throw new Error(`Dữ liệu ${options.label} trên máy chủ không đúng cấu trúc.`);
	}
	const database = readDatabase(options.key, options.label);
	if (database.status === "valid") {
		const envelope = database.value;
		if (
			isRecord(envelope) &&
			envelope.version === options.version &&
			options.isValid(envelope.data)
		) {
			return envelope.data;
		}
	}
	// SQLite là nguồn dữ liệu duy nhất khi có. Không dùng bản sao trong trình duyệt
	// thay thế, vì bản sao có thể đã cũ và sẽ bị ghi đè ngược vào SQLite ở lần lưu sau.
	if (database.status === "valid" || database.status === "invalid")
		throw new Error(
			database.status === "valid"
				? `Dữ liệu ${options.label} trong SQLite không đúng cấu trúc. Dữ liệu chưa bị thay đổi; hãy khôi phục từ bản sao lưu.`
				: `Không thể đọc ${options.label} từ SQLite. Dữ liệu chưa bị thay đổi.`,
		);

	const current = readJson(options.key, options.label);
	if (current.status === "valid") {
		const envelope = current.value;
		if (
			isRecord(envelope) &&
			envelope.version === options.version &&
			options.isValid(envelope.data)
		) {
			if (database.status !== "unavailable")
				writeVersionedLocalStorage(
					options.key,
					options.version,
					envelope.data,
					options.label,
				);
			return envelope.data;
		}
		invalidSchema(options.key, current.raw, options.label);
	}

	const fallback = options.fallback();
	if (database.status !== "unavailable")
		writeVersionedLocalStorage(
			options.key,
			options.version,
			fallback,
			options.label,
		);
	return fallback;
}

export function writeVersionedLocalStorage<T>(
	key: string,
	version: number,
	data: T,
	label: string,
): boolean {
	if (typeof window === "undefined") return false;
	if (lanEndpoint()) {
		try {
			return writeLanDirectory(key, version, data);
		} catch (error) {
			reportStorageIssue(
				error instanceof Error ? error.message : `Không thể lưu ${label} trên máy chủ.`,
				error,
			);
			return false;
		}
	}
	const envelope: StoredEnvelope<T> = { version, data };
	const bridge = getDatabaseBridge();
	if (bridge) {
		const response = bridge.writeDataset(key, version, data);
		if (!response.ok || response.value !== true) {
			reportStorageIssue(
				`Không thể lưu ${label} vào SQLite. Thay đổi vừa thực hiện chưa được ghi xuống máy.`,
				response.error,
			);
			return false;
		}
		// Bản cũ trên trình duyệt (từ trước khi dùng SQLite) được cất sang khóa dự phòng
		// riêng để không bao giờ được đọc lại thay cho dữ liệu SQLite.
		try {
			const previous = window.localStorage.getItem(key);
			if (previous !== null) {
				const backupKey = `${key}.backup-before-sqlite`;
				if (window.localStorage.getItem(backupKey) === null)
					window.localStorage.setItem(backupKey, previous);
				window.localStorage.removeItem(key);
			}
		} catch (error) {
			console.error(`Không thể cất bản cũ của ${label} trên trình duyệt.`, error);
		}
		return true;
	}
	try {
		window.localStorage.setItem(key, JSON.stringify(envelope));
		return true;
	} catch (error) {
		reportStorageIssue(
			`Không thể lưu ${label}. Thay đổi vừa thực hiện chưa được ghi xuống máy.`,
			error,
		);
		return false;
	}
}
