import {
	LockKeyhole,
	type LucideIcon,
	ShieldCheck,
	UserPlus,
	Users,
} from "lucide-react";
import { useState } from "react";
import {
	type AccountRole,
	canOpenPage,
	grantablePagesForRole,
	type AccountProfile,
	roleLabels,
	roleOptions,
} from "../../domain/access/accounts.model";
import {
	type AccountDraft,
	type AccountSession,
	changeAccountStatus,
	saveAccount,
} from "../../domain/access/accounts.repository";
import {
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
} from "../../domain/access/password";
import { usePagination } from "../../shared/hooks/usePagination";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { Notice } from "../../shared/ui/Notice";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";
import { RowActionButton } from "../../shared/ui/RowActionButton";
import { StatusPill } from "../../shared/ui/StatusPill";
import type { PageId } from "../../types";

type PageOption = {
	id: PageId;
	label: string;
	description: string;
	icon: LucideIcon;
};

export function AccountsPage({
	accounts,
	pageOptions,
	session,
	onSignIn,
}: {
	accounts: AccountProfile[];
	pageOptions: PageOption[];
	session?: AccountSession;
	onSignIn: (account: AccountProfile) => void;
}) {
	const [editor, setEditor] = useState<AccountProfile | "create">();
	const [statusTarget, setStatusTarget] = useState<AccountProfile>();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const pagination = usePagination(accounts);

	async function save(draft: AccountDraft) {
		if (busy || !editor) return;
		setBusy(true);
		setError("");
		try {
			const editing = typeof editor !== "string" ? editor : undefined;
			const account = await saveAccount(session, draft, editing?.id);
			if (session?.id === account.id) onSignIn(account);

			setEditor(undefined);
		} catch (reason) {
			setError(
				reason instanceof Error ? reason.message : "Không thể lưu tài khoản.",
			);
		} finally {
			setBusy(false);
		}
	}

	async function toggleStatus() {
		if (busy || !statusTarget) return;
		setBusy(true);
		setError("");
		try {
			await changeAccountStatus(session, statusTarget.id, !statusTarget.active);
			setStatusTarget(undefined);
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: "Không thể thay đổi trạng thái.",
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="page-stack">
			<section
				className="panel data-source-card"
				aria-labelledby="account-heading"
			>
				<div className="data-source-icon" aria-hidden="true">
					<Users className="icon-size-22" />
				</div>
				<div className="data-source-copy">
					<h2 id="account-heading">Tài khoản người dùng</h2>
				</div>
				<button
					className="button primary"
					type="button"
					onClick={() => {
						setError("");
						setEditor("create");
					}}
				>
					<UserPlus className="icon-size-16" aria-hidden="true" />
					Thêm người dùng
				</button>
			</section>
			{
				<section className="panel data-panel" aria-label="Danh sách người dùng">
					<div className="table-scroll table-scroll-auto-gutter access-table">
						<table>
							<thead>
								<tr>
									<th scope="col">Người dùng</th>
									<th scope="col">Tên đăng nhập</th>
									<th scope="col">Vai trò</th>
									<th scope="col">Thẻ được truy cập</th>
									<th scope="col">Trạng thái</th>
									<th scope="col">Thao tác</th>
								</tr>
							</thead>
							<tbody>
								{pagination.pageItems.map((account) => (
									<tr key={account.id}>
										<td>
											<strong>{account.name}</strong>
											{account.id === session?.id && (
												<span className="cell-meta">Đang đăng nhập</span>
											)}
										</td>
										<td>{account.username}</td>
										<td>{roleLabels[account.role]}</td>
										<td className="account-page-list">
											{account.role === "admin"
												? "Toàn bộ thẻ"
												: pageOptions
														.filter(({ id }) => canOpenPage(account, id))
														.map(({ label }) => label)
														.join(", ")}
										</td>
										<td>
											<div className="account-status-list">
												<StatusPill
													tone={account.active ? "success" : "neutral"}
												>
													{account.active ? "Đang hoạt động" : "Đã khóa"}
												</StatusPill>
												{account.active && account.mustChangePassword && (
													<StatusPill tone="warning">
														Chờ đổi mật khẩu
													</StatusPill>
												)}
											</div>
										</td>
										<td>
											<div className="access-row-actions">
												<RowActionButton
													action="edit"
													label={`Sửa ${account.name}`}
													onClick={() => {
														setError("");
														setEditor(account);
													}}
												/>
												{account.id !== session?.id && (
													<button
														className="button secondary"
														type="button"
														onClick={() => {
															setError("");
															setStatusTarget(account);
														}}
													>
														{account.active ? "Khóa" : "Mở khóa"}
													</button>
												)}
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<footer className="access-table-footer">
						<span>
							{pagination.firstVisible}–{pagination.lastVisible} /{" "}
							{accounts.length} người dùng
						</span>
						<PaginationControls
							currentPage={pagination.currentPage}
							pageCount={pagination.pageCount}
							onPageChange={pagination.setCurrentPage}
							previousLabel="Trang người dùng trước"
							nextLabel="Trang người dùng sau"
						/>
					</footer>
				</section>
			}
			{editor && (
				<AccountEditor
					account={typeof editor === "string" ? undefined : editor}
					pageOptions={pageOptions}
					self={typeof editor !== "string" && editor.id === session?.id}
					busy={busy}
					error={error}
					onSave={save}
					onClose={() => setEditor(undefined)}
				/>
			)}
			{statusTarget && (
				<Dialog
					ariaLabelledBy="account-status-title"
					eyebrow="NGƯỜI DÙNG"
					title={`${statusTarget.active ? "Khóa" : "Mở khóa"} tài khoản ${statusTarget.name}?`}
					icon={<LockKeyhole className="icon-size-19" aria-hidden="true" />}
					tone="warning"
					disableClose={busy}
					onClose={() => setStatusTarget(undefined)}
					footer={
						<>
							<button
								className="button secondary"
								type="button"
								disabled={busy}
								onClick={() => setStatusTarget(undefined)}
							>
								Hủy
							</button>
							<button
								className="button primary"
								type="button"
								disabled={busy}
								onClick={() => void toggleStatus()}
							>
								{statusTarget.active ? "Khóa tài khoản" : "Mở khóa tài khoản"}
							</button>
						</>
					}
				>
					<div className="dialog-body">
						{error ? (
							<Notice tone="danger" announce>
								{error}
							</Notice>
						) : (
							<p>
								{statusTarget.active
									? "Tài khoản sẽ mất quyền truy cập cho đến khi được mở khóa."
									: "Tài khoản có thể đăng nhập lại bằng mật khẩu hiện tại."}
							</p>
						)}
					</div>
				</Dialog>
			)}
		</div>
	);
}

function AccountEditor({
	account,
	pageOptions,
	self,
	busy,
	error,
	onSave,
	onClose,
}: {
	account?: AccountProfile;
	pageOptions: PageOption[];
	self: boolean;
	busy: boolean;
	error: string;
	onSave: (draft: AccountDraft) => void;
	onClose: () => void;
}) {
	const [draft, setDraft] = useState<AccountDraft>({
		name: account?.name ?? "",
		username: account?.username ?? "",
		role: account?.role ?? "editor",
		password: "",
		pages:
			account && account.role !== "admin"
				? pageOptions
						.filter(({ id }) => canOpenPage(account, id))
						.map(({ id }) => id)
				: [],
	});
	const [confirmation, setConfirmation] = useState("");
	const [confirmationError, setConfirmationError] = useState(false);
	const allowedPages = grantablePagesForRole(draft.role);
	const passwordLabel = account
		? self
			? "Mật khẩu mới (nếu đổi)"
			: "Mật khẩu tạm thời (nếu đặt lại)"
		: "Mật khẩu tạm thời";
	return (
		<Dialog
			ariaLabelledBy="account-editor-title"
			eyebrow="NGƯỜI DÙNG"
			title={account ? "Sửa tài khoản" : "Thêm người dùng"}
			icon={<ShieldCheck className="icon-size-19" aria-hidden="true" />}
			className="account-access-dialog"
			disableClose={busy}
			onClose={onClose}
			onSubmit={(event) => {
				event.preventDefault();
				if (draft.password !== confirmation) {
					setConfirmationError(true);
					return;
				}
				setConfirmationError(false);
				onSave(draft);
			}}
			footer={
				<>
					<button
						className="button secondary"
						type="button"
						disabled={busy}
						onClick={onClose}
					>
						Hủy
					</button>
					<button className="button primary" type="submit" disabled={busy}>
						{busy ? "Đang lưu…" : "Lưu tài khoản"}
					</button>
				</>
			}
		>
			<div className="dialog-body account-editor">
				{(confirmationError || error) && (
					<Notice tone="danger" announce>
						{confirmationError ? "Mật khẩu xác nhận chưa khớp." : error}
					</Notice>
				)}
				<div className="dialog-grid account-fields">
					<label>
						Họ và tên
						<input
							value={draft.name}
							autoComplete="off"
							required
							maxLength={100}
							disabled={busy}
							onChange={(event) =>
								setDraft({ ...draft, name: event.target.value })
							}
						/>
					</label>
					<label>
						Tên đăng nhập
						<input
							value={draft.username}
							autoComplete="off"
							required
							maxLength={40}
							disabled={busy}
							onChange={(event) =>
								setDraft({ ...draft, username: event.target.value })
							}
						/>
					</label>
					<label>
						Vai trò
						<select
							value={draft.role}
							disabled={self || busy}
							onChange={(event) => {
								const role = event.target.value as AccountRole;
								setDraft({
									...draft,
									role,
									pages:
										role === "admin"
											? draft.pages
											: draft.pages.filter((page) =>
													grantablePagesForRole(role).includes(page),
												),
								});
							}}
						>
							{roleOptions.map((role) => (
								<option key={role} value={role}>
									{roleLabels[role]}
								</option>
							))}
						</select>
					</label>
					<label>
						{passwordLabel}
						<input
							type="password"
							value={draft.password}
							autoComplete="new-password"
							minLength={MIN_PASSWORD_LENGTH}
							maxLength={MAX_PASSWORD_LENGTH}
							required={!account}
							disabled={busy}
							onChange={(event) =>
								setDraft({ ...draft, password: event.target.value })
							}
						/>
					</label>
					<label>
						Xác nhận mật khẩu
						<input
							type="password"
							value={confirmation}
							autoComplete="new-password"
							minLength={MIN_PASSWORD_LENGTH}
							maxLength={MAX_PASSWORD_LENGTH}
							required={Boolean(draft.password)}
							disabled={busy}
							onChange={(event) => {
								setConfirmation(event.target.value);
								setConfirmationError(false);
							}}
						/>
					</label>
				</div>
				{!self && (
					<p className="account-password-hint">
						Người dùng phải tự đặt mật khẩu mới khi đăng nhập bằng mật khẩu tạm
						thời.
					</p>
				)}
				{draft.role === "admin" ? (
					<Notice tone="info">
						Tài khoản quản trị có quyền truy cập toàn bộ các thẻ.
					</Notice>
				) : (
					<fieldset className="account-page-picker" disabled={busy}>
						<legend>Thẻ được truy cập</legend>
						<p>Chọn các thẻ người dùng được phép mở.</p>
						<div className="account-page-options">
							{pageOptions
								.filter(({ id }) => allowedPages.includes(id))
								.map(({ id, label, description, icon: Icon }) => (
									<label
										key={id}
										className={`choice-card account-page-option${draft.pages.includes(id) ? " is-selected" : ""}`}
									>
										<input
											type="checkbox"
											checked={draft.pages.includes(id)}
											aria-labelledby={`account-page-${id}`}
											onChange={(event) => {
												const checked = event.target.checked;
												setDraft((current) => ({
													...current,
													pages: checked
														? [...current.pages, id]
														: current.pages.filter((page) => page !== id),
												}));
											}}
										/>
										<span className="account-page-icon">
											<Icon className="icon-size-18" aria-hidden="true" />
										</span>
										<span className="account-page-copy">
											<strong id={`account-page-${id}`}>{label}</strong>
											<small>{description}</small>
										</span>
									</label>
								))}
						</div>
					</fieldset>
				)}
			</div>
		</Dialog>
	);
}
