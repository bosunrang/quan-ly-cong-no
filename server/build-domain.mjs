import { fileURLToPath } from "node:url";
import { build } from "vite";

await build({
 configFile: false,
 // Không chép thư mục public (phông chữ) vào bản build của máy chủ.
 publicDir: false,
 logLevel: "warn",
 build: {
  ssr: fileURLToPath(new URL("./domain-entry.ts", import.meta.url)),
  outDir: fileURLToPath(new URL("./generated", import.meta.url)),
  emptyOutDir: true,
  rollupOptions: { output: { format: "cjs", entryFileNames: "domain.cjs" } },
 },
});
