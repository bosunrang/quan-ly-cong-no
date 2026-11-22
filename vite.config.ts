import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";

const require = createRequire(import.meta.url);
const devAutoLogin = process.env.CONG_NO_DEV_AUTO_LOGIN !== "0";

export default defineConfig(() => {
	let stopBackend: (() => Promise<void>) | undefined;
	return {
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
									else
										vite.config.logger.info(
											"Đã build lại phần tính toán của máy chủ.",
										);
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
					const backendSource = /[\\/]server[\\/](?!generated[\\/]).*\.cjs$/;
					for (const event of ["change", "add", "unlink"])
						vite.watcher.on(event, (file: string) => {
							if (domainSource.test(file)) rebuild();
							if (backendSource.test(file)) {
								void vite.restart().catch((error: unknown) => {
									vite.config.logger.error(String(error));
								});
							}
						});
					const devLoginKey = devAutoLogin ? randomUUID() : undefined;
					// Worker mới nạp lại các module và schema SQLite sau mỗi lần Vite khởi động lại.
					const worker = new Worker(
						require.resolve("./server/development-worker.cjs"),
						{
							workerData: { devLoginKey },
						},
					);
					// Gọi sự kiện qua EventEmitter: tùy bản @types/node, Worker có thể không khai báo on/once.
					const events = worker as unknown as EventEmitter;
					const exited = new Promise<void>((resolve) => {
						events.once("exit", () => resolve());
					});
					stopBackend = () => {
						if (worker.threadId !== -1) worker.postMessage("stop");
						return exited;
					};
					const target = await new Promise<string>((resolve, reject) => {
						events.once("message", resolve);
						events.on("error", (error: unknown) => {
							vite.config.logger.error(String(error));
							reject(error);
						});
						void exited.then(() =>
							reject(new Error("Máy chủ dev đã dừng khi khởi động.")),
						);
					});
					vite.config.server.proxy = {
						"/api/": {
							target,
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
									if (origin === `http://${host}`)
										outgoing.setHeader("origin", target);
								});
							},
						},
					};
					return;
				},
				async closeBundle() {
					await stopBackend?.();
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
		server: {
			host: "127.0.0.1",
			port: 5176,
			strictPort: true,
			// Không theo dõi bộ cài, bản build và dữ liệu: watcher giữ handle thư mục làm electron-builder
			// không đổi tên được release/win-unpacked.tmp khi đóng gói lúc dev server đang chạy.
			watch: {
				ignored: [
					"**/release/**",
					"**/dist/**",
					"**/coverage/**",
					"**/data/**",
				],
			},
		},
	};
});
