import type { PageId } from "../../types";

type GrantableRole = "editor" | "viewer";
type Role = "admin" | GrantableRole;

export const pages: readonly { readonly id: PageId; readonly roles: readonly GrantableRole[] }[];
export const pagesByRole: Readonly<Record<GrantableRole, readonly PageId[]>>;
export function grantablePages(role: Role): readonly PageId[];
export function canOpen(
	account: { role: Role; pages?: readonly PageId[] },
	page: PageId,
): boolean;
