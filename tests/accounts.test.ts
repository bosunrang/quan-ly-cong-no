import { webcrypto } from "node:crypto";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canOpenPage } from "../src/domain/access/accounts.model";
import App from "../src/app/App";
import { navItems } from "../src/app/navigation";
import { pageMeta } from "../src/app/pageConfig";
import {
	accountAwaitingPassword,
	accountSession,
	authenticateAccount,
	changeAccountStatus,
	changeInitialPassword,
	createFirstAdministrator,
	readAccounts,
	saveAccount,
	sessionAccount,
} from "../src/domain/access/accounts.repository";
import * as accountsRepository from "../src/domain/access/accounts.repository";
import * as activityLog from "../src/shared/storage/activityLog";
import { ACCOUNTS_STORAGE_KEY } from "../src/shared/storage/databaseBridge";
import { AccountsPage } from "../src/features/accounts/AccountsPage";

const password = "gia-lap-test-mat-khau";
const operatorPassword = "test-008";
const adminDraft = {
	name: "Quản trị thử",
	username: "quan-tri",
	role: "admin",
	password,
	pages: [],
} as const;

beforeEach(() => {
	vi.stubGlobal("crypto", webcrypto);
	window.localStorage.removeItem(ACCOUNTS_STORAGE_KEY);
});

afterEach(() => {
	window.localStorage.removeItem(ACCOUNTS_STORAGE_KEY);
	vi.unstubAllGlobals();
});

describe("Tài khoản cục bộ", () => {
	it("chặn quyền dữ liệu đến khi đổi mật khẩu được cấp và áp dụng lại sau khi quản trị đặt lại", async () => {
		const admin = await createFirstAdministrator(adminDraft);
		const adminSession = accountSession(admin);
		const draft = {
			...adminDraft,
			name: "Quản trị được cấp",
			username: "quan-tri-moi",
			password: operatorPassword,
		};
		const created = await saveAccount(adminSession, draft);
		const signedIn = await authenticateAccount(
			created.username,
			operatorPassword,
		);
		const pending = accountSession(signedIn);
		expect(accountAwaitingPassword(readAccounts(), pending)?.id).toBe(
			created.id,
		);
		expect(sessionAccount(readAccounts(), pending)).toBeUndefined();
		await expect(changeAccountStatus(pending, admin.id, false)).rejects.toThrow(
			"quản trị",
		);
		await expect(
			changeInitialPassword(pending, operatorPassword),
		).rejects.toThrow("khác mật khẩu được cấp");

		await expect(changeInitialPassword(pending, "mau-8-k")).rejects.toThrow(
			"từ 8",
		);
		const newPassword = "mau-8-ky";
		const update = await changeInitialPassword(pending, newPassword);
		expect(sessionAccount(readAccounts(), accountSession(update))?.id).toBe(
			created.id,
		);
		await expect(changeInitialPassword(pending, newPassword)).rejects.toThrow(
			"hết hiệu lực",
		);
		await expect(
			authenticateAccount(created.username, operatorPassword),
		).rejects.toThrow("mật khẩu không đúng");
		await expect(
			authenticateAccount(created.username, newPassword),
		).resolves.toMatchObject({ mustChangePassword: false });

		const reset = await saveAccount(adminSession, draft, update.id);
		expect(reset.mustChangePassword).toBe(true);
		expect(
			sessionAccount(readAccounts(), accountSession(update)),
		).toBeUndefined();
	}, 15000);

	it("hiện trang đổi mật khẩu thay cho các thẻ sau khi đăng nhập bằng mật khẩu được cấp", async () => {
		const admin = await createFirstAdministrator(adminDraft);
		const pending = await saveAccount(accountSession(admin), {
			name: "Người dùng thử",
			username: "cho-doi",
			role: "viewer",
			password: operatorPassword,
			pages: ["reports"],
		});
		const signIn = vi
			.spyOn(accountsRepository, "authenticateAccount")
			.mockResolvedValue(pending);
		const log = vi
			.spyOn(activityLog, "recordActivity")
			.mockResolvedValue(undefined);
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		const container = document.createElement("div");
		document.body.append(container);
		const root = createRoot(container);
		try {
			await act(async () => root.render(createElement(App)));
			const login = container.querySelector("form");
			if (!login) throw new Error("Thiếu biểu mẫu đăng nhập.");
			await act(async () => {
				login.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				);
			});
			expect(container.querySelector("h1")?.textContent).toBe("Đổi mật khẩu");
			expect(
				container.querySelector('nav[aria-label="Điều hướng chính"]'),
			).toBeNull();
			const cancel = Array.from(container.querySelectorAll("button")).find(
				(button) => button.textContent === "Quay lại đăng nhập",
			);
			await act(async () => cancel?.click());
			expect(container.querySelector("h1")?.textContent).toBe("Đăng nhập");
			expect(
				readAccounts().find(({ id }) => id === pending.id)?.mustChangePassword,
			).toBe(true);
		} finally {
			await act(async () => root.unmount());
			container.remove();
			signIn.mockRestore();
			log.mockRestore();
		}
	});

	it("tạo quản trị đầu tiên, băm mật khẩu và xác thực đúng thông tin", async () => {
		expect(readAccounts()).toEqual([]);
		const admin = await createFirstAdministrator(adminDraft);
		expect(readAccounts()[0]).toMatchObject({
			name: adminDraft.name,
			role: "admin",
			active: true,
		});
		expect(window.localStorage.getItem(ACCOUNTS_STORAGE_KEY)).not.toContain(
			password,
		);
		await expect(
			authenticateAccount(" QUAN-TRI ", password),
		).resolves.toMatchObject({ id: admin.id });
		await expect(
			authenticateAccount("quan-tri", "mật khẩu sai"),
		).rejects.toThrow("mật khẩu không đúng");
		await expect(createFirstAdministrator(adminDraft)).rejects.toThrow(
			"đã được tạo",
		);
	});

	it("kiểm tra quyền quản trị và vô hiệu hóa phiên cũ khi khóa, đổi quyền hoặc đổi mật khẩu", async () => {
		const admin = await createFirstAdministrator(adminDraft);
		const adminSession = accountSession(admin);
		const editorDraft = {
			name: "Nhập liệu thử",
			username: "nhap-lieu",
			role: "editor",
			password: operatorPassword,
			pages: ["payments"],
		} as const;
		await expect(saveAccount(undefined, editorDraft)).rejects.toThrow(
			"quản trị",
		);
		const editor = await saveAccount(adminSession, editorDraft);
		const editorSession = accountSession(editor);
		await expect(
			changeAccountStatus(editorSession, admin.id, false),
		).rejects.toThrow("quản trị");
		await expect(
			changeAccountStatus(adminSession, admin.id, false),
		).rejects.toThrow("đang sử dụng");
		const viewer = await saveAccount(
			adminSession,
			{ ...editorDraft, role: "viewer", password: "", pages: ["reports"] },
			editor.id,
		);
		expect(sessionAccount(readAccounts(), editorSession)).toBeUndefined();
		const viewerSession = accountSession(viewer);
		await changeAccountStatus(adminSession, viewer.id, false);
		await expect(
			authenticateAccount(viewer.username, operatorPassword),
		).rejects.toThrow("bị khóa");
		await changeAccountStatus(adminSession, viewer.id, true);
		expect(sessionAccount(readAccounts(), viewerSession)).toBeUndefined();
		const restored = await authenticateAccount(
			viewer.username,
			operatorPassword,
		);
		await saveAccount(
			adminSession,
			{
				...editorDraft,
				role: "viewer",
				password: "gia-lap-test-mat-khau-moi",
				pages: ["reports"],
			},
			viewer.id,
		);
		expect(
			sessionAccount(readAccounts(), accountSession(restored)),
		).toBeUndefined();
	});

	it("giới hạn tra cứu và thao tác theo vai trò", () => {
		expect(canOpenPage({ role: "admin" }, "audit")).toBe(true);
		expect(canOpenPage({ role: "editor" }, "payments")).toBe(true);
		expect(canOpenPage({ role: "editor" }, "audit")).toBe(false);
		expect(canOpenPage({ role: "viewer" }, "reports")).toBe(true);
		expect(canOpenPage({ role: "viewer" }, "payments")).toBe(false);
		expect(canOpenPage({ role: "viewer" }, "misa")).toBe(false);
		expect(
			canOpenPage({ role: "editor", pages: ["customers"] }, "dashboard"),
		).toBe(false);
		expect(
			canOpenPage({ role: "editor", pages: ["customers"] }, "customers"),
		).toBe(true);
	});

	it("lưu các thẻ đã cấp, vô hiệu hóa phiên khi đổi thẻ và chặn quyền vượt vai trò", async () => {
		const admin = await createFirstAdministrator(adminDraft);
		const session = accountSession(admin);
		const draft = {
			name: "Nhập liệu thử",
			username: "kiem-tra-the",
			role: "editor",
			password: operatorPassword,
		} as const;
		await expect(saveAccount(session, { ...draft, pages: [] })).rejects.toThrow(
			"Chọn ít nhất một thẻ",
		);
		await expect(
			saveAccount(session, { ...draft, pages: ["users"] }),
		).rejects.toThrow("không phù hợp");
		const operator = await saveAccount(session, {
			...draft,
			pages: ["payments"],
		});
		expect(readAccounts().find(({ id }) => id === operator.id)?.pages).toEqual([
			"payments",
		]);
		const updated = await saveAccount(
			session,
			{ ...draft, password: "", pages: ["reports"] },
			operator.id,
		);
		expect(canOpenPage(updated, "payments")).toBe(false);
		expect(canOpenPage(updated, "reports")).toBe(true);
		expect(
			sessionAccount(readAccounts(), accountSession(operator)),
		).toBeUndefined();
	});

	it("chặn chế độ chưa thiết lập khi dữ liệu tài khoản bị lỗi", () => {
		window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, "null");
		expect(readAccounts).toThrow("Dữ liệu tài khoản không hợp lệ.");
	});

	it("chỉnh và lưu ô thẻ được truy cập trong hộp thoại tài khoản", async () => {
		const admin = await createFirstAdministrator(adminDraft);
		const session = accountSession(admin);
		const viewer = await saveAccount(session, {
			name: "Tra cứu thử",
			username: "tra-cuu",
			role: "viewer",
			password: operatorPassword,
			pages: ["dashboard"],
		});
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		const container = document.createElement("div");
		document.body.append(container);
		const root = createRoot(container);
		try {
			await act(async () =>
				root.render(
					createElement(AccountsPage, {
						accounts: [admin, viewer],
						session,
						pageOptions: navItems.map((item) => ({
							...item,
							description: pageMeta[item.id].subtitle,
						})),
						onSignIn: vi.fn(),
					}),
				),
			);
			await act(async () =>
				container
					.querySelector<HTMLButtonElement>(
						'button[aria-label="Sửa Tra cứu thử"]',
					)
					?.click(),
			);
			const dialog =
				container.querySelector<HTMLFormElement>("form[role=dialog]");
			const dashboard = dialog?.querySelector<HTMLInputElement>(
				'input[aria-labelledby="account-page-dashboard"]',
			);
			const reports = dialog?.querySelector<HTMLInputElement>(
				'input[aria-labelledby="account-page-reports"]',
			);
			if (!dialog || !dashboard || !reports)
				throw new Error("Thiếu ô chọn thẻ truy cập.");
			expect(dashboard.checked).toBe(true);
			expect(reports.checked).toBe(false);
			expect(
				dialog.querySelector('input[aria-labelledby="account-page-payments"]'),
			).toBeNull();
			await act(async () => {
				reports.click();
				dashboard.click();
			});
			await act(async () => {
				dialog.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				);
			});
			expect(readAccounts().find(({ id }) => id === viewer.id)?.pages).toEqual([
				"reports",
			]);
			expect(container.querySelector("form[role=dialog]")).toBeNull();
		} finally {
			await act(async () => root.unmount());
			container.remove();
		}
	});
});
