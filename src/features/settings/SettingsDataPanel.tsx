import {
	AlertTriangle,
	DatabaseBackup,
	FileDown,
	FileUp,
	Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import {
	changeBusinessData,
	exportBusinessBackup,
} from "../../domain/settings/business-data.repository";
import {
	businessGroups,
	validateBusinessBackup,
} from "../../domain/settings/business-data.rules.mjs";
import type {
	BusinessBackup,
	BusinessGroup,
} from "../../domain/settings/business-data.types";
import { formatTimestamp, todayLocal } from "../../shared/lib/date";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { Notice } from "../../shared/ui/Notice";
import { StatusPill } from "../../shared/ui/StatusPill";
import { AutomaticBackups } from "./AutomaticBackups";

const groups = {
	salesBook: ["Dữ liệu MISA", "Các dòng bán hàng đã nhập"],
	ledger: ["Khoản thu và phân bổ", "Chứng từ thu, lịch sử phân bổ và hoàn tác"],
	customers: ["Khách hàng", "Danh mục và lịch sử phân công khách hàng"],
	employees: [
		"Nhân viên",
		"Hồ sơ và liên kết tài khoản. Kết thúc phân công đang mở",
	],
} satisfies Record<BusinessGroup, [string, string]>;

type Review =
	| { type: "restore"; backup: BusinessBackup; fileName: string }
	| { type: "delete" };

interface Props {
	onNotice: (text: string, tone?: "success" | "danger") => void;
}

export function SettingsDataPanel({ onNotice }: Props) {
	const fileInput = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [review, setReview] = useState<Review>();
	const [selected, setSelected] = useState<BusinessGroup[]>([]);
	const [error, setError] = useState("");

	function dismiss() {
		setReview(undefined);
		setSelected([]);
		setError("");
	}
	function finish(message: string) {
		dismiss();
		onNotice(message);
		window.setTimeout(() => window.location.reload(), 550);
	}
	async function saveFile() {
		setBusy(true);
		try {
			const backup = await exportBusinessBackup();
			const file = new Blob([JSON.stringify(backup)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(file);
			const link = document.createElement("a");
			link.href = url;
			link.download = `sao-luu-cong-no-${backup.companyId ? `${backup.companyId}-` : ""}${todayLocal()}.json`;
			link.click();
			window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
			onNotice("Đã xuất bản sao lưu.");
		} catch (reason) {
			onNotice(
				reason instanceof Error
					? reason.message
					: "Không thể xuất bản sao lưu.",
				"danger",
			);
		} finally {
			setBusy(false);
		}
	}
	async function chooseFile(file?: File) {
		if (!file) return;
		setBusy(true);
		try {
			if (file.size > 60 * 1024 * 1024)
				throw new Error("Tệp sao lưu vượt quá 60 MB.");
			const backup = validateBusinessBackup(
				JSON.parse(await file.text()) as unknown,
			);
			setReview({ type: "restore", backup, fileName: file.name });
		} catch (reason) {
			onNotice(
				reason instanceof SyntaxError
					? "Không đọc được tệp JSON."
					: reason instanceof Error
						? reason.message
						: "Không đọc được bản sao lưu.",
				"danger",
			);
		} finally {
			setBusy(false);
		}
	}
	async function confirm() {
		if (!review || busy) return;
		setBusy(true);
		setError("");
		try {
			const restoring = review.type === "restore";
			await changeBusinessData(
				restoring
					? { type: "restore", backup: review.backup }
					: { type: "delete", groups: selected },
			);
			finish(
				restoring ? "Đã khôi phục bản sao lưu." : "Đã xóa dữ liệu đã chọn.",
			);
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: "Không thể cập nhật dữ liệu.",
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="panel settings-data-panel">
			<div className="settings-data-head">
				<DatabaseBackup className="icon-size-18" />
				<h2>Quản trị dữ liệu</h2>
				<StatusPill
					className="settings-database-status"
					tone="success"
					icon={<i />}
				>
					SQLite · Máy chủ
				</StatusPill>
			</div>
			<div className="settings-data-grid">
				<article className="settings-data-card">
					<div>
						<h3>Xuất sao lưu</h3>
						<p>
							Lưu dữ liệu nghiệp vụ và thông tin doanh nghiệp thành tệp JSON.
						</p>
					</div>
					<button
						type="button"
						className="button secondary"
						onClick={() => void saveFile()}
						disabled={busy}
					>
						<FileDown className="icon-size-16" /> Xuất sao lưu
					</button>
				</article>
				<article className="settings-data-card">
					<div>
						<h3>Nhập sao lưu</h3>
						<p>Chọn tệp JSON đã xuất để khôi phục dữ liệu nghiệp vụ.</p>
					</div>
					<input
						type="file"
						hidden
						accept=".json,application/json"
						ref={fileInput}
						onChange={(event) => {
							const file = event.currentTarget.files?.[0];
							event.currentTarget.value = "";
							void chooseFile(file);
						}}
					/>
					<button
						type="button"
						className="button secondary"
						onClick={() => fileInput.current?.click()}
						disabled={busy}
					>
						<FileUp className="icon-size-16" /> Chọn tệp sao lưu
					</button>
				</article>
				{
					<AutomaticBackups
						onRestore={() => finish("Đã khôi phục bản sao lưu tự động.")}
					/>
				}
				<article className="settings-data-card settings-data-danger">
					<div>
						<h3>Xóa dữ liệu</h3>
						<p>Chọn từng nhóm cần xóa trong kho hiện tại.</p>
					</div>
					<button
						type="button"
						className="button danger-outline"
						onClick={() => setReview({ type: "delete" })}
						disabled={busy}
					>
						<Trash2 className="icon-size-16" /> Xóa dữ liệu
					</button>
				</article>
			</div>

			{review && (
				<Dialog
					ariaLabelledBy="settings-data-review"
					eyebrow="QUẢN TRỊ DỮ LIỆU"
					title={
						review.type === "restore"
							? "Khôi phục dữ liệu từ tệp"
							: "Chọn nhóm dữ liệu cần xóa"
					}
					icon={<AlertTriangle className="icon-size-19" />}
					tone="danger"
					className="settings-operation-dialog"
					disableClose={busy}
					onClose={dismiss}
					footer={
						<>
							<button
								type="button"
								className="button secondary"
								disabled={busy}
								onClick={dismiss}
							>
								Hủy
							</button>
							<button
								type="button"
								className="button danger"
								disabled={
									busy || (review.type === "delete" && !selected.length)
								}
								onClick={() => void confirm()}
							>
								{busy
									? "Đang xử lý…"
									: review.type === "restore"
										? "Khôi phục"
										: "Xóa dữ liệu đã chọn"}
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
						{review.type === "restore" ? (
							<>
								<p>
									<strong>{review.fileName}</strong> ·{" "}
									{formatTimestamp(review.backup.createdAt)}
								</p>
								<p>
									{review.backup.data.settings?.companyName ||
										review.backup.companyId ||
										"Dữ liệu cục bộ"}
								</p>
								<Notice tone="warning">
									Dữ liệu nghiệp vụ và thông tin doanh nghiệp hiện tại sẽ được
									thay bằng nội dung của tệp.
								</Notice>
							</>
						) : (
							<div className="settings-options">
								<label className="settings-option choice-card">
									<input
										type="checkbox"
										checked={selected.length === businessGroups.length}
										onChange={(event) =>
											setSelected(
												event.target.checked ? [...businessGroups] : [],
											)
										}
									/>
									<strong>Tất cả nhóm dữ liệu</strong>
								</label>
								{businessGroups.map((key) => (
									<label className="settings-option choice-card" key={key}>
										<input
											type="checkbox"
											checked={selected.includes(key)}
											onChange={(event) =>
												setSelected((current) =>
													event.target.checked
														? [...current, key]
														: current.filter((item) => item !== key),
												)
											}
										/>
										<span>
											<strong>{groups[key][0]}</strong>
											<small>{groups[key][1]}</small>
										</span>
									</label>
								))}
								<Notice tone="warning">
									Máy chủ sẽ lưu một bản sao trước khi xóa.
								</Notice>
							</div>
						)}
					</div>
				</Dialog>
			)}
		</section>
	);
}
