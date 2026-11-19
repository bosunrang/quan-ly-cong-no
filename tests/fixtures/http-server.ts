import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { vi } from "vitest";

const require = createRequire(join(process.cwd(), "package.json"));
const { startDevelopmentServer } = require("./server/development.cjs");
const nativeFetch = globalThis.fetch;

/** Real HTTP + SQLite, isolated from user databases. Cookies simulate one browser. */
export async function httpServer() {
	const directory = mkdtempSync(join(tmpdir(), "cong-no-http-"));
	const backend = await startDevelopmentServer(directory);
	let cookie = "";
	const meta = document.createElement("meta");
	meta.name = "cong-no-lan-api";
	meta.content = "/api/";
	document.head.append(meta);
	const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const headers = new Headers(init?.headers);
		if (cookie) headers.set("Cookie", cookie);
		const response = await nativeFetch(new URL(String(input), backend.target), {
			...init,
			headers,
		});
		const nextCookie = response.headers.get("set-cookie");
		if (nextCookie) cookie = nextCookie.split(";")[0];
		return response;
	});
	vi.stubGlobal("fetch", fetch);
	return {
		...backend,
		directory,
		fetch,
		async close() {
			vi.unstubAllGlobals();
			meta.remove();
			await backend.stop();
			rmSync(directory, { recursive: true, force: true });
		},
	};
}
