import { readFileSync } from "node:fs";
import { URL } from "node:url";
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

const styleModules = Object.fromEntries(
	Object.keys(import.meta.glob("../src/**/*.css")).map((path) => [
		path,
		readFileSync(new URL(path, import.meta.url), "utf8"),
	]),
);

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

	it("giữ kích thước chuẩn của điều khiển và hàng bảng trong token dùng chung", () => {
		const dimensions = {
			"--control-height": "36px",
			"--control-height-compact": "32px",
			"--control-height-small": "28px",
			"--field-label-gap": "6px",
			"--field-gap": "16px",
			"--table-header-height": "40px",
			"--table-header-height-compact": "30px",
			"--table-row-height": "44px",
			"--table-row-height-compact": "36px",
			"--table-row-height-input": "52px",
		};
		for (const [name, value] of Object.entries(dimensions)) {
			const declaration = new RegExp(`${name}\\s*:\\s*${value}\\s*;`);
			const token = new RegExp(`${name}\\s*:`);
			expect(styleModules["../src/styles/foundation/tokens.css"]).toMatch(
				declaration,
			);
			expect(
				Object.entries(styleModules)
					.filter(([, style]) => token.test(style))
					.map(([path]) => path),
			).toEqual(["../src/styles/foundation/tokens.css"]);
		}
	});

	it("dùng token chữ và chỉ định kiểu focus, thanh cuộn ở CSS dùng chung", () => {
		for (const [path, styles] of Object.entries(styleModules)) {
			expect(styles, path).not.toMatch(/font-size\s*:\s*[\d.]+(?:px|rem|em)\b/);
			if (!path.endsWith("/styles/shared/controls.css")) {
				expect(styles, path).not.toMatch(
					/:focus(?:-visible|-within)?\b|\boutline\s*:/,
				);
			}
			if (
				!path.endsWith("/styles/shared/controls.css") &&
				!path.endsWith("/styles/foundation/base.css")
			) {
				expect(styles, path).not.toMatch(
					/::-webkit-scrollbar|\bscrollbar-(?:width|color|gutter)\s*:/,
				);
			}
		}
	});

	it("dùng chung trạng thái tương tác của nút ở trang và hộp thoại", () => {
		const sharedButton = /\.(?:button|text-button|row-action|drawer-close)(?![\w-])/;
		const dialogScope = /\b(?:aria-modal|dialog-shell|dialog-overlay)\b/;
		const interaction = /:(?:hover|active|disabled)\b/;
		for (const [path, styles] of Object.entries(styleModules)) {
			const selectors = Array.from(styles.matchAll(/([^{}]+)\{/g), ([, selector]) =>
				selector.trim(),
			).filter((selector) => interaction.test(selector) && sharedButton.test(selector));
			if (path.endsWith("/styles/shared/controls.css")) {
				expect(selectors, path).not.toHaveLength(0);
				for (const selector of selectors) expect(selector).not.toMatch(dialogScope);
			} else {
				expect(selectors, path).toEqual([]);
			}
		}
	});

	it("lấy kích thước cố định và kiểu icon từ token đã khai báo", () => {
		const allStyles = Object.values(styleModules).join("\n");
		const declared = new Set(
			Array.from(allStyles.matchAll(/(--[\w-]+)\s*:/g), (match) => match[1]),
		);
		for (const [path, styles] of Object.entries(styleModules)) {
			for (const [, token] of styles.matchAll(/var\(\s*(--[\w-]+)/g)) {
				expect(declared.has(token), `${path} · ${token}`).toBe(true);
			}
			if (path.endsWith("/styles/foundation/tokens.css")) continue;
			const declarations = styles
				.replace(/\/\*[\s\S]*?\*\//g, "")
				.replace(/@media[^{]+/g, "");
			expect(declarations, path).not.toMatch(/(?<![\w.-])-?[\d.]+(?:px|rem)\b/);
		}
		for (const [path, source] of Object.entries(sourceModules)) {
			if (path.endsWith(".tsx"))
				expect(source, path).not.toMatch(/\bsize=\{\d+\}/);
		}
	});

	it("không dùng namespace CSS nhập dữ liệu của feature khác", () => {
		const featurePrefixes: Record<string, string> = {
			customers: "customer-import-",
			misa: "misa-import-",
		};
		const violations: string[] = [];

		for (const [sourcePath, source] of Object.entries(sourceModules)) {
			const sourceRelative = sourcePath.replace("../src/", "");
			const [, sourceFeature] =
				sourceRelative.match(/^features\/([^/]+)\//) ?? [];
			if (!sourceFeature) continue;

			for (const [ownerFeature, prefix] of Object.entries(featurePrefixes)) {
				if (ownerFeature === sourceFeature || !source.includes(prefix))
					continue;
				violations.push(
					`${sourceRelative} dùng namespace ${prefix} của feature ${ownerFeature}`,
				);
			}
		}

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
		expect(electronPreload).toContain(
			"contextBridge.exposeInMainWorld('congNoDatabase'",
		);
		expect(electronPreload).not.toContain("require('node:fs')");
		expect(electronDatabase).toContain("require('node:sqlite')");
		expect(electronDatabase).toContain("PRAGMA foreign_keys = ON");
		expect(electronDatabase).toContain("BEGIN IMMEDIATE");
		expect(indexHtml).toContain("Content-Security-Policy");
		expect(indexHtml).toContain("script-src 'self'");
		expect(indexHtml).toContain("object-src 'none'");
	});
});
