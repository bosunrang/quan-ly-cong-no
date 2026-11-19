import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/app/App";
import { canOpenPage } from "../src/domain/access/accounts.model";
import {
	accountAwaitingPassword,
	accountSession,
	authenticateAccount,
	changeAccountStatus,
	changeInitialPassword,
	readAccounts,
	restoreLanSession,
	saveAccount,
	sessionAccount,
	signOutLan,
} from "../src/domain/access/accounts.repository";
import { AccountsPage } from "../src/features/accounts/AccountsPage";
import { navItems } from "../src/app/navigation";
import { pageMeta } from "../src/app/pageConfig";
import { api, setApiSession } from "../src/shared/api/client";
import { httpServer } from "./fixtures/http-server";

const temporary = "test-temporary-123";
const password = "test-password-456";
const draft = {
	name: "Tra cứu thử",
	username: "tra-cuu",
	role: "viewer",
	password: temporary,
	pages: ["dashboard"],
} as const;
let host: Awaited<ReturnType<typeof httpServer>>;

beforeEach(async () => {
	host = await httpServer();
	setApiSession();
	await host.server.initializeAdministrator(temporary);
});
afterEach(async () => {
	await signOutLan();
	vi.restoreAllMocks();
	await host.close();
});
async function administrator() {
	const initial = await authenticateAccount("admin", temporary);
	return changeInitialPassword(accountSession(initial), password);
}

describe("Tài khoản qua máy chủ, kể cả desktop", () => {
	it("kho mới không tự có quyền quản trị và từ chối đọc sổ trước đăng nhập", async () => {
		await expect(restoreLanSession()).rejects.toThrow();
		await expect(api("GET", "sales-book")).rejects.toThrow();
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		const container = document.createElement("div");
		document.body.append(container);
		const root = createRoot(container);
		try {
			await act(async () => root.render(createElement(App)));
			await vi.waitFor(async () => {
				await act(async () => undefined);
				expect(container.querySelector("h1")?.textContent).toBe("Đăng nhập");
			});
			expect(container.querySelector("nav")).toBeNull();
		} finally {
			await act(async () => root.unmount());
			container.remove();
		}
	}, 15_000);
	it("bắt buộc đổi mật khẩu tạm, sau đó khôi phục phiên bằng cookie", async () => {
		const initial = await authenticateAccount("admin", temporary);
		const pending = accountSession(initial);
		expect(accountAwaitingPassword(readAccounts(), pending)?.id).toBe(
			initial.id,
		);
		expect(sessionAccount(readAccounts(), pending)).toBeUndefined();
		await expect(api("GET", "customers")).rejects.toThrow();
		await expect(changeInitialPassword(pending, temporary)).rejects.toThrow();
		const updated = await changeInitialPassword(pending, password);
		expect(sessionAccount(readAccounts(), accountSession(updated))?.id).toBe(
			initial.id,
		);
		expect(await restoreLanSession()).toEqual(accountSession(updated));
		await signOutLan();
		expect(readAccounts()).toEqual([]);
		await expect(authenticateAccount("admin", temporary)).rejects.toThrow();
		await expect(authenticateAccount("admin", password)).resolves.toMatchObject(
			{ mustChangePassword: false },
		);
	}, 15_000);
	it("kiểm quyền trên máy chủ và vô hiệu hóa phiên sau khi đổi quyền hoặc khóa", async () => {
		const admin = await administrator();
		const session = accountSession(admin);
		const viewer = await saveAccount(session, draft);
		const changed = await saveAccount(
			session,
			{ ...draft, password: "", pages: ["reports"] },
			viewer.id,
		);
		expect(changed.sessionVersion).not.toBe(viewer.sessionVersion);
		await changeAccountStatus(session, viewer.id, false);
		await signOutLan();
		await expect(
			authenticateAccount(draft.username, temporary),
		).rejects.toThrow();
		await authenticateAccount("admin", password);
		await changeAccountStatus(session, viewer.id, true);
		const pending = await authenticateAccount(draft.username, temporary);
		await changeInitialPassword(accountSession(pending), "viewer-password-789");
		await expect(saveAccount(undefined, draft)).rejects.toThrow();
		await expect(api("GET", "receipt-ledger")).resolves.toBeNull();
		await expect(
			api("PUT", "receipt-ledger", {
				revision: "",
				data: { revision: "r1", receipts: [], allocations: [] },
			}),
		).rejects.toThrow();
	}, 15_000);
	it("chặn quyền vượt vai trò và bảo vệ tài khoản quản trị đang dùng", async () => {
		const admin = await administrator();
		const session = accountSession(admin);
		await expect(
			saveAccount(session, { ...draft, pages: [] }),
		).rejects.toThrow();
		await expect(
			saveAccount(session, { ...draft, pages: ["users"] }),
		).rejects.toThrow();
		await expect(
			changeAccountStatus(session, admin.id, false),
		).rejects.toThrow();
		await expect(
			saveAccount(session, { ...draft, username: "admin" }),
		).rejects.toThrow();
		expect(canOpenPage({ role: "viewer", pages: ["reports"] }, "reports")).toBe(
			true,
		);
		expect(
			canOpenPage({ role: "viewer", pages: ["reports"] }, "payments"),
		).toBe(false);
	}, 15_000);
	it("chỉnh thẻ trong hộp thoại và lưu tài khoản qua HTTP", async () => {
		const admin = await administrator();
		const session = accountSession(admin);
		const viewer = await saveAccount(session, draft);
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
			const form =
				container.querySelector<HTMLFormElement>("form[role=dialog]");
			if (!form) throw new Error("Thiếu hộp thoại");
			await act(async () => {
				form
					.querySelector<HTMLInputElement>(
						'input[aria-labelledby="account-page-dashboard"]',
					)
					?.click();
				form
					.querySelector<HTMLInputElement>(
						'input[aria-labelledby="account-page-reports"]',
					)
					?.click();
			});
			await act(async () => {
				form.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				);
				await vi.waitFor(() =>
					expect(
						readAccounts().find(({ id }) => id === viewer.id)?.pages,
					).toEqual(["reports"]),
				);
			});
			expect(container.querySelector("form[role=dialog]")).toBeNull();
		} finally {
			await act(async () => root.unmount());
			container.remove();
		}
	}, 15_000);
});
