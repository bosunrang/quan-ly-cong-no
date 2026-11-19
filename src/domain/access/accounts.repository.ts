import {
	ACCOUNTS_STORAGE_KEY as accountsKey,
	getDatabaseBridge,
} from "../../shared/storage/databaseBridge";
import {
	isLanSessionExpired,
	lanEndpoint,
	requestLan,
	setLanSession,
} from "../../shared/storage/lanStorage";
import {
	type AccountProfile,
	type AccountRole,
	canOpenPage,
	grantablePagesForRole,
	isAccountRole,
	isLocalAccount,
	type LocalAccount,
	normalizeUsername,
} from "./accounts.model";
import type { PageId } from "../../types";
import {
	makePasswordProof,
	MAX_PASSWORD_LENGTH,
	validatePassword,
	verifyPassword,
} from "./password";

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

async function requestAccount(operation: "login" | "initial-password", payload: object) {
	const result = await requestLan<LanAccountSnapshot>(operation, payload);
	setLanSession(result.profile.sessionVersion);
	updateLanAccounts(result.accounts);
	return result.profile;
}

async function updateAccount(operation: "save-account" | "account-status", payload: object) {
	const result = await requestLan<LanAccountSnapshot & { account: AccountProfile }>(operation, payload);
	if (!lanAccounts.some(({ id, sessionVersion }) =>
		id === result.profile.id && sessionVersion === result.profile.sessionVersion))
		setLanSession(result.profile.sessionVersion);
	updateLanAccounts(result.accounts);
	return result.account;
}

export async function signOutLan() {
	try {
		await requestLan<boolean>("logout");
	} catch (error) {
		if (!isLanSessionExpired(error)) throw error;
	}
	setLanSession();
	updateLanAccounts([]);
}

export async function restoreLanSession() {
	const result = await requestLan<LanAccountSnapshot>("session");
	setLanSession(result.profile.sessionVersion);
	updateLanAccounts(result.accounts);
	return accountSession(result.profile);
}

async function refreshLanAccounts() {
	const previous = lanAccounts;
	if (!previous.length) return;
	try {
		const result = await requestLan<LanAccountSnapshot>("session");
		if (lanAccounts === previous) updateLanAccounts(result.accounts);
	} catch (error) {
		if (isLanSessionExpired(error) && lanAccounts === previous) {
			setLanSession();
			updateLanAccounts([]);
		}
	}
}

export function readAccounts(): AccountProfile[] {
	return lanEndpoint() ? lanAccounts : readStoredAccounts();
}

function readStoredAccounts(): LocalAccount[] {
	const bridge = getDatabaseBridge();
	const response = bridge?.readDataset(accountsKey);
	if (response && !response.ok)
		throw new Error(response.error || "Không thể đọc tài khoản.");
	const raw = bridge ? null : window.localStorage.getItem(accountsKey);
	if (bridge ? response?.value === null : raw === null) return [];
	let envelope: unknown;
	try {
		envelope = bridge ? response?.value : JSON.parse(raw ?? "");
	} catch {
		throw new Error("Dữ liệu tài khoản không đọc được.");
	}
	if (
		!envelope ||
		typeof envelope !== "object" ||
		!("version" in envelope) ||
		!("data" in envelope)
	)
		throw new Error("Dữ liệu tài khoản không hợp lệ.");
	const { data } = envelope;
	if (
		envelope.version !== 1 ||
		!Array.isArray(data) ||
		!data.every(isLocalAccount) ||
		!data.some(
			(account: LocalAccount) => account.role === "admin" && account.active,
		)
	)
		throw new Error("Dữ liệu tài khoản không hợp lệ.");
	return data;
}

function writeAccounts(expected: LocalAccount[], accounts: LocalAccount[]) {
	const bridge = getDatabaseBridge();
	if (bridge) {
		const result = bridge.writeAccounts(expected, accounts);
		if (!result.ok) throw new Error(result.error || "Không thể lưu tài khoản.");
		if (result.value !== true)
			throw new Error("Danh sách tài khoản vừa thay đổi. Hãy thử lại.");
	} else {
		window.localStorage.setItem(
			accountsKey,
			JSON.stringify({ version: 1, data: accounts }),
		);
	}
	window.dispatchEvent(new Event(changeEvent));
}

export function subscribeAccounts(refresh: () => void) {
	if (lanEndpoint()) {
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
	const onStorage = (event: StorageEvent) => {
		if (event.key === null || event.key === accountsKey) refresh();
	};
	window.addEventListener(changeEvent, refresh);
	window.addEventListener("storage", onStorage);
	window.addEventListener("focus", refresh);
	return () => {
		window.removeEventListener(changeEvent, refresh);
		window.removeEventListener("storage", onStorage);
		window.removeEventListener("focus", refresh);
	};
}

function writeExclusive<T>(action: () => T): Promise<T> {
	return !getDatabaseBridge() && navigator.locks
		? navigator.locks.request(accountsKey, action)
		: Promise.resolve().then(action);
}

function matchingAccount<T extends AccountProfile>(accounts: T[], session?: AccountSession) {
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

function requireAdministrator(
	accounts: LocalAccount[],
	session?: AccountSession,
) {
	const account = sessionAccount(accounts, session);
	if (account?.role !== "admin")
		throw new Error("Cần đăng nhập bằng tài khoản quản trị.");
	return account;
}

function cleanDraft(draft: AccountDraft) {
	const name = draft.name.trim();
	const username = normalizeUsername(draft.username);
	if (!name || name.length > 100)
		throw new Error("Nhập tên người dùng từ 1 đến 100 ký tự.");
	if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username))
		throw new Error(
			"Tên đăng nhập cần 3–40 ký tự. Dùng chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới.",
		);
	if (!isAccountRole(draft.role)) throw new Error("Vai trò không hợp lệ.");
	if (draft.role === "admin") return { name, username, role: draft.role };
	const allowed = grantablePagesForRole(draft.role);
	if (
		!Array.isArray(draft.pages) ||
		!draft.pages.every((page) => allowed.includes(page))
	)
		throw new Error("Danh sách thẻ không phù hợp với vai trò đã chọn.");
	const pages = allowed.filter((page) => draft.pages.includes(page));
	if (!pages.length) throw new Error("Chọn ít nhất một thẻ được truy cập.");
	return { name, username, role: draft.role, pages };
}

export async function createFirstAdministrator(draft: AccountDraft) {
	if (lanEndpoint()) throw new Error("Khởi tạo tài khoản quản trị trên máy chủ.");
	const fields = cleanDraft({ ...draft, role: "admin" });
	const proof = await makePasswordProof(draft.password);
	return writeExclusive(() => {
		if (readStoredAccounts().length)
			throw new Error("Tài khoản quản trị đã được tạo. Hãy đăng nhập.");
		const account: LocalAccount = {
			...fields,
			id: crypto.randomUUID(),
			proof,
			active: true,
			sessionVersion: crypto.randomUUID(),
		};
		writeAccounts([], [account]);
		return account;
	});
}

export async function authenticateAccount(username: string, password: string) {
	if (lanEndpoint()) return requestAccount("login", { username, password });
	const candidate = readStoredAccounts().find(
		(account) => account.username === normalizeUsername(username),
	);
	if (
		!candidate?.active ||
		password.length > MAX_PASSWORD_LENGTH ||
		!(await verifyPassword(password, candidate.proof))
	)
		throw new Error(
			"Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.",
		);
	const current = matchingAccount(readStoredAccounts(), accountSession(candidate));
	if (!current) throw new Error("Tài khoản vừa thay đổi. Hãy đăng nhập lại.");
	return current;
}

export async function changeInitialPassword(
	session: AccountSession,
	password: string,
) {
	if (lanEndpoint()) return requestAccount("initial-password", { password });
	const account = accountAwaitingPassword(readStoredAccounts(), session);
	if (!account)
		throw new Error("Phiên đổi mật khẩu đã hết hiệu lực. Hãy đăng nhập lại.");
	validatePassword(password);
	if (await verifyPassword(password, account.proof))
		throw new Error("Mật khẩu mới phải khác mật khẩu được cấp.");
	const proof = await makePasswordProof(password);
	return writeExclusive(() => {
		const accounts = readStoredAccounts();
		const current = accountAwaitingPassword(accounts, session);
		if (!current) throw new Error("Tài khoản vừa thay đổi. Hãy đăng nhập lại.");
		const next = {
			...current,
			proof,
			mustChangePassword: false,
			sessionVersion: crypto.randomUUID(),
		};
		writeAccounts(
			accounts,
			accounts.map((item) => (item.id === next.id ? next : item)),
		);
		return next;
	});
}

export async function saveAccount(
	session: AccountSession | undefined,
	draft: AccountDraft,
	id?: string,
) {
	if (lanEndpoint()) return updateAccount("save-account", { draft, id });
	const fields = cleanDraft(draft);
	const proof =
		!id || draft.password !== ""
			? await makePasswordProof(draft.password)
			: undefined;
	return writeExclusive(() => {
		const accounts = readStoredAccounts();
		const administrator = requireAdministrator(accounts, session);
		const previous = accounts.find((account) => account.id === id);
		if (id && !previous)
			throw new Error("Tài khoản không còn trong danh sách.");
		if (
			accounts.some(
				(account) => account.id !== id && account.username === fields.username,
			)
		)
			throw new Error("Tên đăng nhập này đã được sử dụng.");
		if (id === administrator.id && fields.role !== "admin")
			throw new Error("Tài khoản đang đăng nhập cần giữ vai trò quản trị.");

		if (previous) {
			const pages = fields.pages;
			const changedAccess =
				fields.role !== previous.role ||
				grantablePagesForRole(fields.role).some(
					(page) => canOpenPage(previous, page) !== pages?.includes(page),
				);
			const next = {
				...previous,
				...fields,
				pages,
				proof: proof ?? previous.proof,
				mustChangePassword: proof
					? previous.id !== administrator.id
					: previous.mustChangePassword,
				sessionVersion:
					proof || changedAccess
						? crypto.randomUUID()
						: previous.sessionVersion,
			};
			writeAccounts(
				accounts,
				accounts.map((account) => (account.id === id ? next : account)),
			);
			return next;
		}
		if (!proof) throw new Error("Nhập mật khẩu cho tài khoản mới.");
		const next = {
			...fields,
			id: crypto.randomUUID(),
			proof,
			mustChangePassword: true,
			active: true,
			sessionVersion: crypto.randomUUID(),
		};
		writeAccounts(accounts, [...accounts, next]);
		return next;
	});
}

export async function changeAccountStatus(
	session: AccountSession | undefined,
	id: string,
	active: boolean,
) {
	if (lanEndpoint()) return updateAccount("account-status", { id, active });
	return writeExclusive(() => {
		const accounts = readStoredAccounts();
		const administrator = requireAdministrator(accounts, session);
		if (id === administrator.id)
			throw new Error("Bạn đang sử dụng tài khoản này.");
		const account = accounts.find((item) => item.id === id);
		if (!account || account.active === active)
			throw new Error("Trạng thái tài khoản vừa thay đổi.");
		const next = { ...account, active, sessionVersion: crypto.randomUUID() };
		writeAccounts(
			accounts,
			accounts.map((item) => (item.id === id ? next : item)),
		);
		return next;
	});
}
