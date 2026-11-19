import type { PasswordProof } from "./accounts.model";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

function toHex(bytes: Uint8Array) {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

async function derivePassword(password: string, salt: string) {
	if (!crypto.subtle)
		throw new Error(
			"Mở app qua 127.0.0.1 hoặc bản desktop để sử dụng tài khoản.",
		);
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const saltBytes = Uint8Array.from(salt.match(/../g) ?? [], (pair) =>
		Number.parseInt(pair, 16),
	);
	const hash = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: 600_000 },
		key,
		256,
	);
	return toHex(new Uint8Array(hash));
}

export function validatePassword(password: string) {
	if (
		password.trim().length < MIN_PASSWORD_LENGTH ||
		password.length > MAX_PASSWORD_LENGTH
	)
		throw new Error(
			`Mật khẩu phải có từ ${MIN_PASSWORD_LENGTH} đến ${MAX_PASSWORD_LENGTH} ký tự, tính cả khoảng trắng bên trong.`,
		);
}

export async function makePasswordProof(
	password: string,
): Promise<PasswordProof> {
	validatePassword(password);
	const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
	return { salt, hash: await derivePassword(password, salt) };
}

export async function verifyPassword(password: string, proof: PasswordProof) {
	const hash = await derivePassword(password, proof.salt);
	let difference = 0;
	for (let index = 0; index < hash.length; index += 1)
		difference |= hash.charCodeAt(index) ^ proof.hash.charCodeAt(index);
	return difference === 0;
}
