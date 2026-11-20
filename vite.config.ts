import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

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
				const backend = await startDevelopmentServer();
				vite.config.server.proxy = {
					"/api/": {
						target: backend.target,
						changeOrigin: true,
						configure(proxy) {
							proxy.on("proxyReq", (outgoing, incoming) => {
								if (
									incoming.headers.origin === `http://${incoming.headers.host}`
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
						attrs: { name: "cong-no-lan-api", content: "/api/" },
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
