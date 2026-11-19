import { ImagePlus, Save } from "lucide-react";
import { useRef, useState } from "react";
import {
	type AppSettings,
	MAX_BANK_ACCOUNTS,
} from "../../domain/settings/settings.model";
import { useTransientNotice } from "../../shared/hooks/useTransientNotice";
import { Notice } from "../../shared/ui/Notice";
import { SettingsDataPanel } from "./SettingsDataPanel";
interface SettingsPageProps {
	settings: AppSettings;
	onSave: (settings: AppSettings) => boolean;
}

export function SettingsPage({ settings, onSave }: SettingsPageProps) {
	const fileInput = useRef<HTMLInputElement>(null);
	const [fileName, setFileName] = useState("Chưa chọn tệp");
	const { notice, showNotice, dismissNotice } = useTransientNotice(2200);
	const [companyName, setCompanyName] = useState(settings.companyName);
	const [companyAddress, setCompanyAddress] = useState(settings.companyAddress);
	const [bankAccounts, setBankAccounts] = useState(() =>
		Array.from(
			{ length: MAX_BANK_ACCOUNTS },
			(_, index) => settings.bankAccounts[index] ?? "",
		),
	);
	const [accountingContact, setAccountingContact] = useState(
		settings.accountingContact,
	);
	const [signatoryName, setSignatoryName] = useState(settings.signatoryName);
	const [signatoryTitle, setSignatoryTitle] = useState(settings.signatoryTitle);
	const [displayName, setDisplayName] = useState(settings.displayName);
	const [tagline, setTagline] = useState(settings.tagline);
	const [logoDataUrl, setLogoDataUrl] = useState<string | null>(
		settings.logoDataUrl,
	);
	return (
		<div className="page-stack settings-page">
			{notice && (
				<Notice tone={notice.tone} floating announce onDismiss={dismissNotice}>
					{notice.text}
				</Notice>
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
								bankAccounts: bankAccounts
									.map((account) => account.trim())
									.filter(Boolean),
								accountingContact: accountingContact.trim(),
								signatoryName: signatoryName.trim(),
								signatoryTitle: signatoryTitle.trim(),
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
						{bankAccounts.map((account, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: Fixed slots for bank account lines.
							<label key={index}>
								Tài khoản ngân hàng {index + 1}
								<input
									placeholder="Số tài khoản tại ngân hàng, chi nhánh"
									value={account}
									onChange={(event) => {
										const value = event.target.value;
										setBankAccounts((current) =>
											current.map((item, position) =>
												position === index ? value : item,
											),
										);
									}}
								/>
							</label>
						))}
						<label>
							Liên hệ đối chiếu
							<input
								placeholder="Phòng kế toán, số điện thoại"
								value={accountingContact}
								onChange={(event) => setAccountingContact(event.target.value)}
							/>
						</label>
						<label>
							Người ký biên bản
							<input
								placeholder="Họ tên người đại diện"
								value={signatoryName}
								onChange={(event) => setSignatoryName(event.target.value)}
							/>
						</label>
						<label>
							Chức danh người ký
							<input
								placeholder="Ví dụ: Giám đốc"
								value={signatoryTitle}
								onChange={(event) => setSignatoryTitle(event.target.value)}
							/>
						</label>
						<button className="button primary" type="submit">
							<Save className="icon-size-16" /> Lưu thông tin
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
									<Save className="icon-size-16" /> Lưu logo
								</button>
								<button
									className="button secondary"
									type="button"
									onClick={() => {
										setLogoDataUrl(null);
										setFileName("Chưa chọn tệp");
										if (fileInput.current) fileInput.current.value = "";
										showNotice(
											"Đã bỏ ảnh logo. Bấm Lưu logo để xác nhận.",
											undefined,
											"info",
										);
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
										"CN"
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
										if (file.size > 1_000_000) {
											showNotice(
												"Logo phải nhỏ hơn 1 MB.",
												undefined,
												"danger",
											);
											return;
										}
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
									<ImagePlus className="icon-size-16" /> Chọn tệp
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

			<SettingsDataPanel
				onNotice={(text, tone) => showNotice(text, undefined, tone)}
			/>
		</div>
	);
}
