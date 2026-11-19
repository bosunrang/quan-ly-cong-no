import { useState } from "react";
import type { AccountProfile } from "../../domain/access/accounts.model";
import {
	type AccountSession,
	changeInitialPassword,
} from "../../domain/access/accounts.repository";
import {
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
} from "../../domain/access/password";
import { Notice } from "../../shared/ui/Notice";
import { AccessBrand } from "./AccessBrand";

export function InitialPasswordPage({
	session,
	username,
	logoDataUrl,
	sessionError,
	onComplete,
	onCancel,
}: {
	session: AccountSession;
	username: string;
	logoDataUrl: string | null;
	sessionError?: string;
	onComplete: (account: AccountProfile) => void;
	onCancel: () => void;
}) {
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	async function submit() {
		if (busy) return;
		if (password !== confirmation) {
			setError("Mật khẩu xác nhận chưa khớp.");
			return;
		}
		setError("");
		setBusy(true);
		try {
			onComplete(await changeInitialPassword(session, password));
		} catch (reason) {
			setError(
				reason instanceof Error ? reason.message : "Không thể đổi mật khẩu.",
			);
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
					void submit();
				}}
			>
				<h1 className="visually-hidden">Đổi mật khẩu</h1>
				<AccessBrand
					title="Đổi mật khẩu"
					subtitle={`Tài khoản ${username}`}
					logoDataUrl={logoDataUrl}
				/>
				<p>
					Đặt mật khẩu mới để tiếp tục sử dụng app. Mật khẩu mới cần ít nhất{" "}
					{MIN_PASSWORD_LENGTH} ký tự và khác mật khẩu được cấp.
				</p>
				{(error || sessionError) && (
					<Notice tone="danger" announce>
						{error || sessionError}
					</Notice>
				)}
				<div className="ui-field">
					<label htmlFor="initial-password">Mật khẩu mới</label>
					<input
						id="initial-password"
						type="password"
						autoComplete="new-password"
						value={password}
						minLength={MIN_PASSWORD_LENGTH}
						maxLength={MAX_PASSWORD_LENGTH}
						required
						disabled={busy}
						onChange={(event) => setPassword(event.target.value)}
					/>
				</div>
				<div className="ui-field">
					<label htmlFor="initial-confirmation">Xác nhận mật khẩu mới</label>
					<input
						id="initial-confirmation"
						type="password"
						autoComplete="new-password"
						value={confirmation}
						minLength={MIN_PASSWORD_LENGTH}
						maxLength={MAX_PASSWORD_LENGTH}
						required
						disabled={busy}
						onChange={(event) => setConfirmation(event.target.value)}
					/>
				</div>
				<div className="access-password-actions">
					<button className="button primary" type="submit" disabled={busy}>
						{busy ? "Đang lưu…" : "Lưu mật khẩu"}
					</button>
					<button
						className="text-button"
						type="button"
						disabled={busy}
						onClick={onCancel}
					>
						Quay lại đăng nhập
					</button>
				</div>
			</form>
		</main>
	);
}
