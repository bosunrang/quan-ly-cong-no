import type { PageId } from "../../types";
import { canOpen, grantablePages } from "./permissions.mjs";

export const roleLabels = {
	admin: "Quản trị",
	editor: "Nhân viên",
	viewer: "Chỉ xem",
} as const;

export type AccountRole = keyof typeof roleLabels;

export interface PasswordProof {
	salt: string;
	hash: string;
}

export interface LocalAccount {
	id: string;
	username: string;
	name: string;
	role: AccountRole;
	pages?: PageId[];
	active: boolean;
	sessionVersion: string;
	proof: PasswordProof;
	mustChangePassword?: boolean;
}

export type AccountProfile = Omit<LocalAccount, "proof">;

export const roleOptions: AccountRole[] = ["admin", "editor", "viewer"];

// Danh sách thẻ theo vai trò nằm ở permissions.mjs, dùng chung với máy chủ.
export function grantablePagesForRole(role: AccountRole): readonly PageId[] {
	return grantablePages(role);
}

export type PageAccess = Pick<LocalAccount, "role" | "pages">;

export function canOpenPage(access: PageAccess, page: PageId) {
	return canOpen(access, page);
}

export function normalizeUsername(username: string) {
	return username.trim().toLowerCase();
}

export function isAccountRole(value: unknown): value is AccountRole {
	return value === "admin" || value === "editor" || value === "viewer";
}

export function isLocalAccount(value: unknown): value is LocalAccount {
	if (!value || typeof value !== "object") return false;
	const account = value as Partial<LocalAccount>;
	const { role, pages } = account;
	if (!isAccountRole(role)) return false;
	return (
		typeof account.id === "string" &&
		typeof account.username === "string" &&
		typeof account.name === "string" &&
		(pages === undefined ||
			(Array.isArray(pages) &&
				pages.length > 0 &&
				pages.every((page) => grantablePagesForRole(role).includes(page)))) &&
		typeof account.active === "boolean" &&
		typeof account.sessionVersion === "string" &&
		(account.mustChangePassword === undefined ||
			typeof account.mustChangePassword === "boolean") &&
		typeof account.proof?.salt === "string" &&
		/^[0-9a-f]{32}$/.test(account.proof.salt) &&
		typeof account.proof.hash === "string" &&
		/^[0-9a-f]{64}$/.test(account.proof.hash)
	);
}
