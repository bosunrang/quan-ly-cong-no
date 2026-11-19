import { readCustomers } from "../src/domain/customers/customer.repository";
import { readSalesEmployees } from "../src/domain/employees/employee.repository";
import { readMisaSalesBook } from "../src/domain/misa/misa.sales-book.repository";
import { readReceiptLedger } from "../src/domain/payments/receipt-ledger.repository";
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
			const [customers, employees, salesBook, ledger] = await Promise.all([
				readCustomers(),
				readSalesEmployees(),
				readMisaSalesBook(),
				readReceiptLedger(),
			]);
			if (!salesBook)
				throw new Error("Không đọc được sổ bán hàng sau khi khôi phục");
			expect(
				computeGoldenNumbers({ customers, employees, salesBook, ledger }),
			).toEqual(expected);
			expect(computeGoldenNumbers(restored.data as GoldenData)).toEqual(
				expected,
			);
			await signOutLan();
		} finally {
			await host.close();
		}
	});

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
