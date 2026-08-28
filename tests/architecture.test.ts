import { describe, expect, it } from "vitest";
import electronDatabase from "../electron/database.cjs?raw";
import electronMain from "../electron/main.cjs?raw";
import electronPreload from "../electron/preload.cjs?raw";
import indexHtml from "../index.html?raw";

const sourceModules = import.meta.glob("../src/**/*.{ts,tsx}", {
	eager: true,
	import: "default",
	query: "?raw",
}) as Record<string, string>;

const styleModules = import.meta.glob("../src/**/*.css", {
	eager: true,
	import: "default",
	query: "?raw",
}) as Record<string, string>;

function resolveRelativeImport(sourcePath: string, specifier: string): string {
	const parts = sourcePath.replace("../src/", "").split("/");
	parts.pop();
	for (const part of specifier.split("/")) {
		if (part === "..") parts.pop();
		else if (part !== ".") parts.push(part);
	}
	return parts.join("/");
}

describe("architecture guardrails", () => {
	it("giữ hướng phụ thuộc giữa app, feature, domain và shared", () => {
		const violations: string[] = [];
		const importPattern = /from\s+['"](\.[^'"]+)['"]/g;

		for (const [sourcePath, source] of Object.entries(sourceModules)) {
			const sourceRelative = sourcePath.replace("../src/", "");
			const [sourceLayer, sourceFeature] = sourceRelative.split("/");

			for (const match of source.matchAll(importPattern)) {
				const target = resolveRelativeImport(sourcePath, match[1]);
				const [targetLayer, targetFeature] = target.split("/");
				const sharedViolation =
					sourceLayer === "shared" &&
					["app", "domain", "features"].includes(targetLayer);
				const domainViolation =
					sourceLayer === "domain" && ["app", "features"].includes(targetLayer);
				const featureViolation =
					sourceLayer === "features" &&
					(targetLayer === "app" ||
						(targetLayer === "features" && targetFeature !== sourceFeature));

				if (sharedViolation || domainViolation || featureViolation) {
					violations.push(`${sourceRelative} -> ${target}`);
				}
			}
		}

		expect(violations).toEqual([]);
	});

	it("chỉ khai báo màu trực tiếp trong file token", () => {
		const rawColor = /#[\da-f]{3,8}\b|rgba?\(/i;
		const violations = Object.entries(styleModules)
			.filter(([path]) => !path.endsWith("/styles/foundation/tokens.css"))
			.filter(([, source]) => rawColor.test(source))
			.map(([path]) => path.replace("../src/", ""));

		expect(violations).toEqual([]);
	});

	it("chỉ dùng component trạng thái chung trong mã giao diện", () => {
		const legacyStatusClasses = /["'](?:simple-badge|status-badge)(?:\s|["'])/;
		const violations = Object.entries(sourceModules)
			.filter(([path]) => path.endsWith(".tsx"))
			.filter(([, source]) => legacyStatusClasses.test(source))
			.map(([path]) => path.replace("../src/", ""));

		expect(violations).toEqual([]);
	});

	it("giữ cấu hình Electron ở trạng thái phòng thủ mặc định", () => {
		expect(electronMain).toContain("app.enableSandbox()");
		expect(electronMain).toContain("contextIsolation: true");
		expect(electronMain).toContain("nodeIntegration: false");
		expect(electronMain).toContain("sandbox: true");
		expect(electronMain).toContain("webSecurity: true");
		expect(electronMain).toContain("allowRunningInsecureContent: false");
		expect(electronMain).toContain("setPermissionRequestHandler");
		expect(electronMain).toContain("setWindowOpenHandler");
		expect(electronMain).toContain("on('will-navigate'");
		expect(electronMain).toContain(
			"preload: path.join(__dirname, 'preload.cjs')",
		);
		expect(electronMain).toContain("ipcMain.on('database:read-dataset'");
		expect(electronMain).toContain("ipcMain.on('database:query-products'");
		expect(electronMain).toContain("ipcMain.on('database:read-product-detail'");
		expect(electronPreload).toContain(
			"contextBridge.exposeInMainWorld('mktDatabase'",
		);
		expect(electronPreload).not.toContain("require('node:fs')");
		expect(electronDatabase).toContain("require('node:sqlite')");
		expect(electronDatabase).toContain("PRAGMA foreign_keys = ON");
		expect(electronDatabase).toContain("BEGIN IMMEDIATE");
		expect(electronDatabase).toContain("LIMIT ? OFFSET ?");
		expect(indexHtml).toContain("Content-Security-Policy");
		expect(indexHtml).toContain("script-src 'self'");
		expect(indexHtml).toContain("object-src 'none'");
	});
});
