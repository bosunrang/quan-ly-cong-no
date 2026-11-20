import { api } from "../src/shared/api/client";
import { resourceWithQuery } from "../src/shared/hooks/useServerData";
import type {
	DashboardView,
	ReceivablesView,
	InvoiceRow,
	Page,
} from "../src/domain/reports/view-types";
import {
	type ReceivableStatement,
	statementBalanceInWords,
} from "../src/domain/reports/statement";
import { httpServer } from "./fixtures/http-server";
import {
	authenticateAccount,
	accountSession,
	changeInitialPassword,
	signOutLan,
} from "../src/domain/access/accounts.repository";
import {
	changeBusinessData,
	exportBusinessBackup,
} from "../src/domain/settings/business-data.repository";
// Bộ "số tiền chuẩn": một bản sao lưu mẫu (tests/fixtures/golden-backup.json) và các con số
// app phải hiển thị từ bản sao lưu đó (golden-numbers.json). Các số đã được đối chiếu tính tay.
// Khi chuyển kiến trúc (máy chủ tính, bảng riêng cho sổ...), test này phải đạt mà KHÔNG sửa
// tệp số chuẩn. Chỉ cập nhật tệp số chuẩn khi quy tắc nghiệp vụ được cố ý thay đổi.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateBusinessBackup } from "../src/domain/settings/business-data.rules.mjs";
import { computeGoldenNumbers, type GoldenData } from "./fixtures/golden";

const read = (name: string) =>
	JSON.parse(
		readFileSync(join(process.cwd(), "tests", "fixtures", name), "utf8"),
	);

describe("Số tiền chuẩn", () => {
	const backup = read("golden-backup.json");
	const expected = read("golden-numbers.json");

	it("bản sao lưu mẫu đúng định dạng và khôi phục được", () => {
		expect(() => validateBusinessBackup(backup)).not.toThrow();
	});

	it("Dashboard, công nợ phải thu và biên bản đối chiếu ra đúng từng đồng", () => {
		const actual = computeGoldenNumbers(backup.data as GoldenData);
		expect(actual.dashboard).toEqual(expected.dashboard);
		expect(actual.receivables).toEqual(expected.receivables);
		expect(actual.statements).toEqual(expected.statements);
	});

	it("đi qua SQLite (khôi phục rồi xuất lại) vẫn ra đúng số chuẩn", () => {
		const require = createRequire(join(process.cwd(), "package.json"));
		const { openDatabase } = require("./electron/database.cjs");
		const database = openDatabase(":memory:");
		try {
			database.changeBusinessData({ type: "restore", backup });
			const restored = database.exportBusinessBackup(null);
			expect(computeGoldenNumbers(restored.data as GoldenData)).toEqual(
				expected,
			);
		} finally {
			database.close();
		}
	});

	it("đọc các route dữ liệu mới sau khi khôi phục vẫn ra đúng số chuẩn", async () => {
		const host = await httpServer();
		try {
			await host.server.initializeAdministrator("test-temporary-123");
			const admin = await authenticateAccount("admin", "test-temporary-123");
			await changeInitialPassword(accountSession(admin), "test-password-456");
			await changeBusinessData({ type: "restore", backup });
			const restored = await exportBusinessBackup();
			expect(restored.companyId).toBeNull();
			const params = (
				resource: string,
				values: Record<string, string | number>,
			) => resourceWithQuery(resource, values);
			for (const expectedDay of expected.dashboard) {
				const { from, through, receivables, unallocatedReceipts, ...totals } =
					expectedDay;
				const period = { from, through, limit: 100 };
				const dashboard = await api<DashboardView>(
					"GET",
					params("dashboard", period),
				);
				expect(dashboard).toMatchObject(totals);
				expect(dashboard.receivablesCount).toBe(receivables.length);
				for (const [i, row] of dashboard.rows.items.entries()) {
					expect(row).not.toHaveProperty("documents");
					expect(row).toMatchObject({
						customerCode: receivables[i].customerCode,
						remaining: receivables[i].remaining,
					});
					const invoices = await api<Page<InvoiceRow>>(
						"GET",
						params(
							`receivables/${encodeURIComponent(row.id)}/invoices`,
							period,
						),
					);
					expect(
						invoices.items.map(({ id, balance }) => ({
							id,
							remaining: balance?.remaining ?? null,
						})),
					).toEqual(receivables[i].documents);
				}
				const unapplied = await api<DashboardView>(
					"GET",
					params("dashboard", { ...period, view: "unallocated" }),
				);
				expect(unapplied.rows.items).toMatchObject(unallocatedReceipts);
			}
			const receivables = await api<ReceivablesView>(
				"GET",
				"receivables?limit=100",
			);
			expect(receivables.unmatchedAllocationCount).toBe(
				expected.receivables.unmatchedCount,
			);
			expect(receivables.rows.items).toHaveLength(
				expected.receivables.customers.length,
			);
			for (const [i, row] of receivables.rows.items.entries()) {
				const { documents, ...expectedRow } = expected.receivables.customers[i];
				expect(row).toMatchObject(expectedRow);
				expect(row).not.toHaveProperty("documents");
				const response = await api<Page<InvoiceRow>>(
					"GET",
					`receivables/${encodeURIComponent(row.id)}/invoices?limit=100`,
				);
				expect(
					response.items.map((document) => ({
						id: document.id,
						documentNumbers: document.documentNumbers,
						invoiceNumber: document.invoiceNumber,
						paymentTotal: document.paymentTotal,
						received: document.balance?.received ?? null,
						remaining: document.balance?.remaining ?? null,
						allocations:
							document.balance?.allocations.map(
								({ receiptNumber, allocationDate, amount }) => ({
									receiptNumber,
									allocationDate,
									amount,
								}),
							) ?? null,
						allocationMismatch: document.allocationMismatch,
					})),
				).toEqual(documents);
				expect(response.items.every((document) => !("lines" in document))).toBe(
					true,
				);
			}
			for (const { customerCode, words, ...statement } of expected.statements) {
				const id = (backup.data as GoldenData).customers.find(
					(item) => item.misaCode === customerCode,
				)?.id;
				if (!id) throw new Error("Thiếu khách hàng trong dữ liệu chuẩn.");
				const result = await api<ReceivableStatement>(
					"GET",
					params(`reports/statements/${encodeURIComponent(id)}`, {
						from: statement.from,
						through: statement.through,
					}),
				);
				expect(result).toMatchObject(statement);
				expect(statementBalanceInWords(result)).toBe(words);
			}
			expect(computeGoldenNumbers(restored.data as GoldenData)).toEqual(
				expected,
			);
			await signOutLan();
		} finally {
			await host.close();
		}
	}, 15_000);

	it("các mốc chính khớp số tính tay", () => {
		const close = (through: string) =>
			expected.dashboard.find(
				(row: { through: string }) => row.through === through,
			);
		// 2025-12-31: KH002 còn 7.850.000, KH003 còn 14.068.000 (phân bổ 5 triệu chưa hoàn tác).
		expect(close("2025-12-31")).toMatchObject({
			remaining: 21_918_000,
			periodReceived: 26_760_000,
			unallocated: 0,
		});
		// 2026-11-30: tổng còn phải thu và tiền đã thu chưa phân bổ.
		expect(close("2026-11-30")).toMatchObject({
			remaining: 74_559_500,
			periodReceived: 66_770_000,
			unallocated: 15_472_000,
		});
		const statement = expected.statements.find(
			(row: { customerCode: string; through: string }) =>
				row.customerCode === "KH001" && row.through === "2026-11-30",
		);
		// KH001 trả trước nhiều hơn số còn nợ: dư có 3.473.000.
		expect(statement).toMatchObject({
			closing: 4_849_000,
			unallocated: 8_322_000,
			net: -3_473_000,
		});
	});
});
