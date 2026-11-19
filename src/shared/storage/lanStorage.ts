import type { DatabaseEnvelope } from "./databaseBridge";

interface LanResponse<T> {
	ok: boolean;
	value: T;
	revision?: string;
	error?: string;
}

class LanRequestError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

const headers = { "Content-Type": "application/json", "X-Cong-No-LAN": "1" };
const revisions = new Map<string, string>();
let sessionVersion: string | undefined;

export function setLanSession(version?: string) {
	sessionVersion = version;
	revisions.clear();
}

function requestHeaders() {
	return sessionVersion
		? { ...headers, "X-Cong-No-Session": sessionVersion }
		: headers;
}

export function lanEndpoint() {
	if (typeof document === "undefined") return undefined;
	const endpoint = document.querySelector<HTMLMetaElement>(
		'meta[name="cong-no-lan-api"]',
	)?.content;
	return endpoint && /^(?:\/[a-z][a-z-]+)?\/api\/$/.test(endpoint)
		? endpoint
		: undefined;
}

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Kết nối tới máy chủ LAN qua HTTP thường: mật khẩu và phiên đi qua mạng không mã hóa. */
export function isInsecureLanConnection(
	location: Pick<Location, "protocol" | "hostname"> | undefined = typeof window ===
	"undefined"
		? undefined
		: window.location,
) {
	return Boolean(
		lanEndpoint() &&
			location?.protocol === "http:" &&
			!loopbackHosts.has(location.hostname),
	);
}

export function isLanSessionExpired(error: unknown) {
	return error instanceof LanRequestError && error.status === 401;
}

function decode<T>(status: number, text: string): LanResponse<T> {
	let response: LanResponse<T> | undefined;
	try {
		response = JSON.parse(text);
	} catch {
		throw new LanRequestError(
			"Không nhận được phản hồi từ máy chủ công nợ.",
			status,
		);
	}
	if (!response?.ok || status !== 200)
		throw new LanRequestError(
			response?.error || "Máy chủ chưa hoàn tất thao tác.",
			status,
		);
	return response;
}

export async function requestLan<T>(operation: string, payload: object = {}) {
	const endpoint = lanEndpoint();
	if (!endpoint) throw new Error("Chưa kết nối máy chủ công nợ.");
	const response = await fetch(endpoint, {
		method: "POST",
		headers: requestHeaders(),
		body: JSON.stringify({ operation, payload }),
	});
	return decode<T>(response.status, await response.text()).value;
}

export function requestLanSync<T>(operation: string, payload: object = {}) {
	const endpoint = lanEndpoint();
	if (!endpoint) throw new Error("Chưa kết nối máy chủ công nợ.");
	// The existing directory and settings repositories read synchronously.
	const request = new XMLHttpRequest();
	request.open("POST", endpoint, false);
	for (const [name, value] of Object.entries(requestHeaders()))
		request.setRequestHeader(name, value);
	request.send(JSON.stringify({ operation, payload }));
	return decode<T>(request.status, request.responseText);
}

export function readLanDirectory(key: string) {
	const result = requestLanSync<DatabaseEnvelope>("read-dataset", { key });
	if (result.revision) revisions.set(key, result.revision);
	else revisions.delete(key);
	return result.value;
}

export function writeLanDirectory(key: string, version: number, data: unknown) {
	const result = requestLanSync<boolean>("write-dataset", {
		key,
		version,
		data,
		expected: revisions.get(key),
	});
	if (result.revision) revisions.set(key, result.revision);
	return result.value;
}

export function clearLanRevisions() {
	revisions.clear();
}

export function writeLanEmployeeDirectory(
	customers: unknown[],
	employees: unknown[],
	customerKey: string,
	employeeKey: string,
) {
	const { value } = requestLanSync<Record<string, string>>("write-directory", {
		customers,
		employees,
		expected: {
			[customerKey]: revisions.get(customerKey),
			[employeeKey]: revisions.get(employeeKey),
		},
	});
	for (const [key, revision] of Object.entries(value))
		revisions.set(key, revision);
	return true;
}
