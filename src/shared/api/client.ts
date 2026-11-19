export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code?: string,
	) {
		super(message);
	}
}
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
let sessionVersion: string | undefined;
export function setApiSession(version?: string) {
	sessionVersion = version;
}
export function isSessionExpired(error: unknown) {
	return error instanceof ApiError && error.status === 401;
}

function apiRoot() {
	const endpoint =
		typeof document !== "undefined"
			? document.querySelector<HTMLMetaElement>('meta[name="cong-no-lan-api"]')
					?.content
			: undefined;
	if (!endpoint || !/^(?:\/[a-z][a-z-]+)?\/api\/$/.test(endpoint))
		throw new Error(
			"Mở ứng dụng qua máy chủ công nợ. Chạy pnpm dev khi phát triển.",
		);
	return endpoint;
}

export async function api<T>(
	method: Method,
	resource: string,
	body?: unknown,
): Promise<T> {
	const url = apiRoot() + resource;
	let response: Response;
	try {
		response = await fetch(url, {
			method,
			credentials: "same-origin",
			headers: {
				"X-Cong-No-LAN": "1",
				...(sessionVersion ? { "X-Cong-No-Session": sessionVersion } : {}),
				...(body === undefined ? {} : { "Content-Type": "application/json" }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	} catch {
		throw new ApiError("Không kết nối được máy chủ công nợ.", 0);
	}
	const result = (await response.json().catch(() => null)) as {
		ok?: boolean;
		value?: T;
		error?: string;
		code?: string;
	} | null;
	if (!response.ok || result?.ok !== true || !("value" in result))
		throw new ApiError(
			result?.error ?? "Máy chủ chưa hoàn tất thao tác.",
			response.status,
			result?.code,
		);
	return result.value as T;
}

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Kết nối tới máy chủ LAN qua HTTP thường: mật khẩu và phiên đi qua mạng không mã hóa. */
export function isInsecureLanConnection(
	location:
		| Pick<Location, "protocol" | "hostname">
		| undefined = typeof window === "undefined" ? undefined : window.location,
) {
	return Boolean(
		location?.protocol === "http:" && !loopbackHosts.has(location.hostname),
	);
}
