import { ArchiveRestore } from "lucide-react";
import { useState } from "react";
import { formatTimestamp } from "../../shared/lib/date";
import { clearLanRevisions, requestLan } from "../../shared/storage/lanStorage";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { Notice } from "../../shared/ui/Notice";

interface BackupStatus {
	backups: { fileName: string; createdAt: string; sizeBytes: number }[];
	retention: number;
	failed: boolean;
}

const sizeFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export function AutomaticBackups({ onRestore }: { onRestore: () => void }) {
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState<BackupStatus>();
	const [selected, setSelected] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	async function show() {
		setOpen(true);
		setStatus(undefined);
		setSelected("");
		setError("");
		try {
			setStatus(await requestLan<BackupStatus>("backup-status"));
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: "Không đọc được danh sách bản sao lưu.",
			);
		}
	}

	async function restore() {
		if (!selected || busy) return;
		setBusy(true);
		setError("");
		try {
			await requestLan<boolean>("restore-automatic-backup", {
				fileName: selected,
			});
			clearLanRevisions();
			setOpen(false);
			onRestore();
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: "Không thể khôi phục bản sao lưu.",
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<article className="settings-data-card">
			<div>
				<h3>Bản sao lưu tự động</h3>
				<p>
					Máy chủ sao lưu hằng ngày. Chọn một bản để khôi phục dữ liệu công ty.
				</p>
			</div>
			<button
				className="button secondary"
				type="button"
				onClick={() => void show()}
			>
				<ArchiveRestore className="icon-size-16" /> Chọn bản sao lưu
			</button>
			{open && (
				<Dialog
					ariaLabelledBy="settings-automatic-restore"
					eyebrow="QUẢN TRỊ DỮ LIỆU"
					title="Khôi phục bản sao lưu tự động"
					icon={<ArchiveRestore className="icon-size-19" />}
					tone="danger"
					className="settings-operation-dialog"
					disableClose={busy}
					onClose={() => setOpen(false)}
					footer={
						<>
							<button
								className="button secondary"
								type="button"
								disabled={busy}
								onClick={() => setOpen(false)}
							>
								Hủy
							</button>
							<button
								className="button danger"
								type="button"
								disabled={busy || !selected}
								onClick={() => void restore()}
							>
								{busy ? "Đang khôi phục…" : "Khôi phục bản này"}
							</button>
						</>
					}
				>
					<div className="dialog-body settings-operation-body">
						{error && (
							<Notice tone="danger" announce>
								{error}
							</Notice>
						)}
						<Notice tone="warning">
							Máy chủ sẽ lưu một bản sao của dữ liệu hiện tại trước khi khôi
							phục.
						</Notice>
						{status?.failed && (
							<Notice tone="warning">Lần sao lưu gần nhất gặp lỗi.</Notice>
						)}
						{!status && !error && (
							<p role="status">Đang kiểm tra các bản sao…</p>
						)}
						{status && !status.backups.length && (
							<p>Chưa có bản sao lưu tự động.</p>
						)}
						{Boolean(status?.backups.length) && (
							<div className="settings-options settings-backup-options">
								{status?.backups.map((item) => (
									<label
										className="settings-option choice-card"
										key={item.fileName}
									>
										<input
											type="radio"
											name="automatic-backup"
											checked={selected === item.fileName}
											onChange={() => setSelected(item.fileName)}
										/>
										<span>
											<strong>{formatTimestamp(item.createdAt)}</strong>
											<small>
												{item.fileName} ·{" "}
												{sizeFormat.format(item.sizeBytes / 1024)} KB
											</small>
										</span>
									</label>
								))}
							</div>
						)}
					</div>
				</Dialog>
			)}
		</article>
	);
}
