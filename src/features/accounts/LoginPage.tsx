import { useState } from "react";
import type { AccountProfile } from "../../domain/access/accounts.model";
import { authenticateAccount } from "../../domain/access/accounts.repository";
import { MAX_PASSWORD_LENGTH } from "../../domain/access/password";
import {
	type AppSettings,
	defaultSettings,
} from "../../domain/settings/settings.model";
import { isInsecureLanConnection } from "../../shared/api/client";
import { Notice } from "../../shared/ui/Notice";
import { AccessBrand } from "./AccessBrand";

export function LoginPage({
	settings,
	onSignIn,
}: {
	settings: AppSettings;
	onSignIn: (account: AccountProfile) => void;
}) {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [insecure] = useState(() => isInsecureLanConnection());

	async function signIn() {
		if (busy) return;
		setBusy(true);
		setError("");
		try {
			onSignIn(await authenticateAccount(username, password));
		} catch (reason) {
			setError(
				reason instanceof Error ? reason.message : "Không thể đăng nhập.",
			);
			setPassword("");
		} finally {
			setBusy(false);
		}
	}

	return (
		<main className="access-login">
			<form
				className="panel access-login-panel"
				onSubmit={(event) => {
					event.preventDefault();
					void signIn();
				}}
			>
				<h1 className="visually-hidden">Đăng nhập</h1>
				<AccessBrand
					title={settings.displayName.trim() || defaultSettings.displayName}
					subtitle={settings.tagline.trim() || defaultSettings.tagline}
					logoDataUrl={settings.logoDataUrl}
				/>
				{insecure && (
					<Notice tone="warning" title="Kết nối chưa mã hóa">
						Mật khẩu được gửi qua mạng nội bộ ở dạng không mã hóa. Chỉ đăng nhập
						trong mạng tin cậy và đề nghị quản trị bật HTTPS cho máy chủ công
						nợ.
					</Notice>
				)}
				{error && (
					<Notice tone="danger" announce>
						{error}
					</Notice>
				)}
				<div className="ui-field">
					<label htmlFor="login-username">Tên đăng nhập</label>
					<input
						id="login-username"
						autoComplete="username"
						value={username}
						maxLength={40}
						required
						disabled={busy}
						onChange={(event) => setUsername(event.target.value)}
					/>
				</div>
				<div className="ui-field">
					<label htmlFor="login-password">Mật khẩu</label>
					<input
						id="login-password"
						type="password"
						autoComplete="current-password"
						value={password}
						maxLength={MAX_PASSWORD_LENGTH}
						required
						disabled={busy}
						onChange={(event) => setPassword(event.target.value)}
					/>
				</div>
				<button className="button primary" type="submit" disabled={busy}>
					{busy ? "Đang đăng nhập…" : "Đăng nhập"}
				</button>
			</form>
		</main>
	);
}
