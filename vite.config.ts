import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const devAutoLogin = process.env.CONG_NO_DEV_AUTO_LOGIN !== "0";

export default defineConfig({
	plugins: [
		react(),
		{
			name: "cong-no-development-server",
			apply: "serve",
			async configureServer(vite) {
				// Máy chủ dev nạp lại phần tính toán mỗi khi bản build đổi; sửa src/domain thì build lại
				// ngay để máy chủ và giao diện dùng cùng công thức.
				process.env.CONG_NO_DOMAIN_RELOAD = "1";
				let building: Promise<void> | undefined;
				let again = false;
				const rebuild = () => {
					if (building) {
						again = true;
						return;
					}
					building = new Promise<void>((resolve) => {
						execFile(
							process.execPath,
							["server/build-domain.mjs"],
							(error, _stdout, stderr) => {
								if (error)
									vite.config.logger.error(
										`Build phần tính toán của máy chủ lỗi:\n${stderr || error.message}`,
									);
								else vite.config.logger.info("Đã build lại phần tính toán của máy chủ.");
								resolve();
							},
						);
					}).then(() => {
						building = undefined;
						if (again) {
							again = false;
							rebuild();
						}
					});
				};
				const domainSource = /[\\/]src[\\/](domain|shared[\\/]lib)[\\/]/;
				for (const event of ["change", "add", "unlink"])
					vite.watcher.on(event, (file: string) => {
						if (domainSource.test(file)) rebuild();
					});
				const { startDevelopmentServer } = require("./server/development.cjs");
				const devLoginKey = devAutoLogin ? randomUUID() : undefined;
				const backend = await startDevelopmentServer(undefined, undefined, {
					devLoginKey,
				});
				vite.config.server.proxy = {
					"/api/": {
						target: backend.target,
						changeOrigin: true,
						configure(proxy) {
							proxy.on("proxyReq", (outgoing, incoming) => {
								outgoing.removeHeader("x-cong-no-dev-login");
								const host = incoming.headers.host;
								const origin = incoming.headers.origin;
								if (
									devLoginKey &&
									incoming.method === "POST" &&
									incoming.url === "/api/dev-login" &&
									incoming.socket.remoteAddress === "127.0.0.1" &&
									(host === "127.0.0.1:5176" || host === "localhost:5176") &&
									origin === `http://${host}`
								) {
									outgoing.setHeader("x-cong-no-dev-login", devLoginKey);
								}
								if (
									origin === `http://${host}`
								)
									outgoing.setHeader("origin", backend.target);
							});
						},
					},
				};
				const stop = () => void backend.stop();
				vite.httpServer?.once("close", stop);
				return;
			},
			transformIndexHtml: {
				order: "pre",
				handler: () => [
					{
						tag: "meta",
						attrs: {
							name: "cong-no-lan-api",
							content: "/api/",
							...(devAutoLogin ? { "data-dev-login": "true" } : {}),
						},
						injectTo: "head",
					},
				],
			},
		},
	],
	base: "./",
	worker: { format: "es" },
	server: { host: "127.0.0.1", port: 5176, strictPort: true },
});
