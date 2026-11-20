import { isSessionExpired, api, setApiSession } from "../../shared/api/client";
import type { AccountProfile, AccountRole } from "./accounts.model";
import type { PageId } from "../../types";

const changeEvent = "cong-no:accounts-changed";

export type AccountSession = { id: string; version: string };
export type AccountDraft = {
	name: string;
	username: string;
	role: AccountRole;
	password: string;
	pages: readonly PageId[];
};

type LanAccountSnapshot = {
	profile: AccountProfile;
	accounts: AccountProfile[];
};

let lanAccounts: AccountProfile[] = [];

function updateLanAccounts(accounts: AccountProfile[]) {
	if (JSON.stringify(lanAccounts) === JSON.stringify(accounts)) return;
	lanAccounts = accounts;
	window.dispatchEvent(new Event(changeEvent));
}

async function requestAccount(
	method: "POST" | "PATCH",
	resource: "session" | "session/password",
	payload: object,
) {
	const result = await api<LanAccountSnapshot>(method, resource, payload);
	setApiSession(result.profile.sessionVersion);
	updateLanAccounts(result.accounts);
	return result.profile;
}

async function updateAccount(
	method: "POST" | "PATCH",
	path: string,
	payload: object,
) {
	const result = await api<LanAccountSnapshot & { account: AccountProfile }>(
		method,
		path,
		payload,
	);
	if (
		!lanAccounts.some(
			({ id, sessionVersion }) =>
				id === result.profile.id &&
				sessionVersion === result.profile.sessionVersion,
		)
	)
		setApiSession(result.profile.sessionVersion);
	updateLanAccounts(result.accounts);
	return result.account;
}

export async function signOutLan() {
	try {
		await api<boolean>("DELETE", "session");
	} catch (error) {
		if (!isSessionExpired(error)) throw error;
	}
	setApiSession();
	updateLanAccounts([]);
}

async function openSession() {
	try {
		return await api<LanAccountSnapshot>("GET", "session");
	} catch (error) {
		if (
			!import.meta.env.DEV ||
			!isSessionExpired(error) ||
			!document.querySelector(
				'meta[name="cong-no-lan-api"][data-dev-login="true"]',
			)
		) throw error;
		return api<LanAccountSnapshot>("POST", "dev-login");
	}
}

let openingSession: Promise<LanAccountSnapshot> | undefined;

export async function restoreLanSession() {
	openingSession ??= openSession().finally(() => {
		openingSession = undefined;
	});
	const result = await openingSession;
	setApiSession(result.profile.sessionVersion);
	updateLanAccounts(result.accounts);
	return accountSession(result.profile);
}

async function refreshLanAccounts() {
	const previous = lanAccounts;
	if (!previous.length) return;
	try {
		const result = await api<LanAccountSnapshot>("GET", "session");
		if (lanAccounts === previous) updateLanAccounts(result.accounts);
	} catch (error) {
		if (isSessionExpired(error) && lanAccounts === previous) {
			setApiSession();
			updateLanAccounts([]);
		}
	}
}

export function readAccounts(): AccountProfile[] {
	return lanAccounts;
}

export function subscribeAccounts(refresh: () => void) {
	const poll = () => void refreshLanAccounts();
	window.addEventListener(changeEvent, refresh);
	window.addEventListener("focus", poll);
	const timer = window.setInterval(poll, 30_000);
	return () => {
		window.removeEventListener(changeEvent, refresh);
		window.removeEventListener("focus", poll);
		window.clearInterval(timer);
	};
}

function matchingAccount<T extends AccountProfile>(
	accounts: T[],
	session?: AccountSession,
) {
	return accounts.find(
		(account) =>
			account.active &&
			account.id === session?.id &&
			account.sessionVersion === session.version,
	);
}

export function sessionAccount<T extends AccountProfile>(
	accounts: T[],
	session?: AccountSession,
) {
	const account = matchingAccount(accounts, session);
	return account?.mustChangePassword ? undefined : account;
}

export function accountAwaitingPassword<T extends AccountProfile>(
	accounts: T[],
	session?: AccountSession,
) {
	const account = matchingAccount(accounts, session);
	return account?.mustChangePassword ? account : undefined;
}

export function accountSession(account: AccountProfile): AccountSession {
	return { id: account.id, version: account.sessionVersion };
}

export async function authenticateAccount(username: string, password: string) {
	return requestAccount("POST", "session", { username, password });
}

export async function changeInitialPassword(
	_session: AccountSession,
	password: string,
) {
	return requestAccount("PATCH", "session/password", { password });
}

export async function saveAccount(
	_session: AccountSession | undefined,
	draft: AccountDraft,
	id?: string,
) {
	return updateAccount(
		id ? "PATCH" : "POST",
		id ? `accounts/${encodeURIComponent(id)}` : "accounts",
		{ draft },
	);
}

export async function changeAccountStatus(
	_session: AccountSession | undefined,
	id: string,
	active: boolean,
) {
	return updateAccount("PATCH", `accounts/${encodeURIComponent(id)}/status`, {
		active,
	});
}

export async function deleteAccount(id: string) {
	const result = await api<LanAccountSnapshot>(
		"DELETE",
		`accounts/${encodeURIComponent(id)}`,
	);
	updateLanAccounts(result.accounts);
}
