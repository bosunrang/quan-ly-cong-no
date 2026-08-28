import {
	DatabaseBackup,
	FileDown,
	FileUp,
	ImagePlus,
	Save,
	Trash2,
} from "lucide-react";
import { StatusPill } from "../../shared/ui/StatusPill";
import { useRef, useState } from "react";
import type { AppSettings } from "../../domain/settings/settings.model";
import { getDatabaseStatus } from "../../shared/storage/databaseBridge";

interface SettingsPageProps {
	settings: AppSettings;
	onSave: (settings: AppSettings) => boolean;
}

export function SettingsPage({ settings, onSave }: SettingsPageProps) {
	const databaseStatus = getDatabaseStatus();
	const fileInput = useRef<HTMLInputElement>(null);
	const [fileName, setFileName] = useState("Chưa chọn tệp");
	const [notice, setNotice] = useState("");
	const [companyName, setCompanyName] = useState(settings.companyName);
	const [companyAddress, setCompanyAddress] = useState(settings.companyAddress);
	const [displayName, setDisplayName] = useState(settings.displayName);
	const [tagline, setTagline] = useState(settings.tagline);
	const [logoDataUrl, setLogoDataUrl] = useState<string | null>(
		settings.logoDataUrl,
	);

	const showNotice = (message: string) => {
		setNotice(message);
		window.setTimeout(() => setNotice(""), 2200);
	};

	return (
		<div className="page-stack settings-page">
			{notice && (
				<div className="settings-toast" role="status">
					{notice}
				</div>
			)}

			<section className="settings-profile-grid">
				<form
					className="panel settings-form-card"
					onSubmit={(event) => {
						event.preventDefault();
						if (
							onSave({
								...settings,
								companyName: companyName.trim(),
								companyAddress: companyAddress.trim(),
							})
						) {
							showNotice("Đã lưu thông tin doanh nghiệp.");
						}
					}}
				>
					<div className="settings-form-head">
						<h2>Thông tin doanh nghiệp</h2>
					</div>
					<div className="settings-form-body">
						<label>
							Tên doanh nghiệp
							<input
								placeholder="Nhập tên doanh nghiệp"
								value={companyName}
								onChange={(event) => setCompanyName(event.target.value)}
							/>
						</label>
						<label>
							Địa chỉ
							<input
								placeholder="Nhập địa chỉ doanh nghiệp"
								value={companyAddress}
								onChange={(event) => setCompanyAddress(event.target.value)}
							/>
						</label>
						<button className="button primary" type="submit">
							<Save size={16} /> Lưu thông tin
						</button>
					</div>
				</form>

				<form
					className="panel settings-form-card"
					onSubmit={(event) => {
						event.preventDefault();
						if (
							onSave({
								...settings,
								displayName: displayName.trim(),
								tagline: tagline.trim(),
								logoDataUrl,
							})
						) {
							showNotice("Đã lưu tên và nhận diện phần mềm.");
						}
					}}
				>
					<div className="settings-form-head">
						<h2>Logo &amp; tên phần mềm</h2>
					</div>
					<div className="settings-brand-body">
						<div className="settings-brand-fields">
							<label>
								Tên hiển thị
								<input
									value={displayName}
									onChange={(event) => setDisplayName(event.target.value)}
								/>
							</label>
							<label>
								Dòng phụ
								<input
									value={tagline}
									onChange={(event) => setTagline(event.target.value)}
								/>
							</label>
							<div className="settings-brand-actions">
								<button className="button primary" type="submit">
									<Save size={16} /> Lưu logo
								</button>
								<button
									className="button secondary"
									type="button"
									onClick={() => {
										setLogoDataUrl(null);
										setFileName("Chưa chọn tệp");
										if (fileInput.current) fileInput.current.value = "";
										showNotice("Đã bỏ ảnh logo. Bấm Lưu logo để xác nhận.");
									}}
								>
									Bỏ ảnh logo
								</button>
							</div>
						</div>

						<div className="settings-logo-tools">
							<span className="settings-field-label">Logo hiện tại</span>
							<div className="settings-logo-preview">
								<div className="settings-logo-mark">
									{logoDataUrl ? (
										<img src={logoDataUrl} alt="Logo đang chọn" />
									) : (
										"MK"
									)}
								</div>
								<div>
									<strong>{displayName || "Tên phần mềm"}</strong>
									<small>{tagline || "Dòng phụ"}</small>
								</div>
							</div>
							<span className="settings-field-label">Chọn ảnh logo</span>
							<div className="settings-file-row">
								<input
									ref={fileInput}
									type="file"
									accept="image/png,image/jpeg,image/webp"
									hidden
									onChange={(event) => {
										const file = event.target.files?.[0];
										setFileName(file?.name || "Chưa chọn tệp");
										if (!file) return;
										const reader = new FileReader();
										reader.onload = () =>
											setLogoDataUrl(
												typeof reader.result === "string"
													? reader.result
													: null,
											);
										reader.readAsDataURL(file);
									}}
								/>
								<button
									className="button secondary"
									type="button"
									onClick={() => fileInput.current?.click()}
								>
									<ImagePlus size={16} /> Chọn tệp
								</button>
								<span>{fileName}</span>
							</div>
							<p>
								Nên dùng ảnh vuông PNG/JPG, dung lượng nhỏ. Logo sẽ được lưu
								cùng dữ liệu phần mềm.
							</p>
						</div>
					</div>
				</form>
			</section>

			<section className="panel settings-data-panel">
				<div className="settings-data-head">
					<DatabaseBackup size={18} />
					<h2>Quản trị dữ liệu</h2>
					<StatusPill
						className="settings-database-status"
						tone={databaseStatus ? "success" : "neutral"}
						icon={<i />}
					>
						{databaseStatus
							? `SQLite · schema ${databaseStatus.schemaVersion}`
							: "Bản trình duyệt · localStorage"}
					</StatusPill>
				</div>
				<div className="settings-data-grid">
					<article className="settings-data-card">
						<div>
							<h3>Xuất backup</h3>
							<p>
								Lưu toàn bộ dữ liệu hiện tại ra tệp sao lưu để sử dụng khi cần.
							</p>
						</div>
						<button
							className="button secondary"
							type="button"
							onClick={() =>
								showNotice(
									"Chức năng xuất backup sẽ được nối ở giai đoạn dữ liệu.",
								)
							}
						>
							<FileDown size={16} /> Xuất backup
						</button>
					</article>
					<article className="settings-data-card">
						<div>
							<h3>Nhập backup</h3>
							<p>Khôi phục dữ liệu từ tệp backup đã xuất trước đó.</p>
						</div>
						<button
							className="button secondary"
							type="button"
							onClick={() =>
								showNotice(
									"Chức năng nhập backup sẽ được nối ở giai đoạn dữ liệu.",
								)
							}
						>
							<FileUp size={16} /> Chọn file backup
						</button>
					</article>
					<article className="settings-data-card settings-data-danger">
						<div>
							<h3>Xóa sạch dữ liệu</h3>
							<p>Xóa toàn bộ dữ liệu đang lưu trên máy này sau khi xác nhận.</p>
						</div>
						<button
							className="button danger"
							type="button"
							onClick={() =>
								showNotice("Bản giao diện mẫu không thực hiện xóa dữ liệu.")
							}
						>
							<Trash2 size={16} /> Xóa sạch dữ liệu
						</button>
					</article>
				</div>
			</section>
		</div>
	);
}
