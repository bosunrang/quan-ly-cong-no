import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export default defineConfig({
	plugins: [
		react(),
		{
			name: "cong-no-development-server",
			apply: "serve",
			async configureServer(vite) {
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
