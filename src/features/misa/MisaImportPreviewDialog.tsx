import {
	AlertTriangle,
	Building2,
	CheckCircle2,
	FileSpreadsheet,
	Upload,
} from "lucide-react";
import type { MisaDataset, MisaImportResult } from "../../domain/misa/misa.model";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { StatusPill } from "../../shared/ui/StatusPill";
import { formatDateOnly, formatTimestamp } from "../../shared/lib/date";

const number = new Intl.NumberFormat("vi-VN");

interface MisaImportPreviewDialogProps {
	preview: MisaImportResult;
	existingDataset: MisaDataset | null;
	isSaving?: boolean;
	onClose: () => void;
	onConfirm: () => void;
}

export function MisaImportPreviewDialog({
	preview,
	existingDataset,
	isSaving = false,
	onClose,
	onConfirm,
}: MisaImportPreviewDialogProps) {
	const matchedCount = preview.units.filter((unit) => unit.customerId).length;
	return (
		<Dialog
			ariaLabelledBy="misa-import-preview-title"
			eyebrow="NHẬP DỮ LIỆU MISA"
			title="Xem trước dữ liệu trước khi nhập"
			icon={<FileSpreadsheet size={19} />}
			className="misa-import-preview-dialog"
			onClose={onClose}
			footer={
				<>
					<button
						className="button secondary"
						type="button"
						disabled={isSaving}
						onClick={onClose}
					>
						Hủy
					</button>
					<button
						className="button primary"
						type="button"
						disabled={isSaving}
						onClick={onConfirm}
					>
						<Upload size={16} />
						{isSaving
							? "Đang lưu dữ liệu..."
							: `Xác nhận nhập ${number.format(preview.sourceRowCount)} dòng`}
					</button>
				</>
			}
		>
			<div className="misa-import-preview-body">
				<div className="misa-import-preview-file">
					<FileSpreadsheet size={18} />
					<div>
						<strong>{preview.fileName}</strong>
						<span>
							Kỳ {formatDateOnly(preview.periodFrom)} –{" "}
							{formatDateOnly(preview.periodTo)} ·{" "}
							{number.format(preview.sourceRowCount)} dòng nghiệp vụ ·{" "}
							{number.format(preview.units.length)} đơn vị (
							{number.format(matchedCount)} đã khớp danh mục)
						</span>
					</div>
				</div>
				{existingDataset && (
					<div className="misa-reimport-note">
						<AlertTriangle size={18} />
						<div>
							<strong>Dữ liệu MISA hiện có sẽ bị thay thế hoàn toàn</strong>
							<span>
								File <strong>{existingDataset.fileName}</strong> (nhập{" "}
								{formatTimestamp(existingDataset.importedAt)},{" "}
								{number.format(existingDataset.sourceRowCount)} dòng) sẽ bị xóa
								và ghi đè bằng dữ liệu mới. Hành động không thể hoàn tác.
							</span>
						</div>
					</div>
				)}
				<div className="misa-import-preview-table-wrap">
					<table className="misa-import-preview-table">
						<thead>
							<tr>
								<th>Đơn vị</th>
								<th>Mã khách hàng</th>
								<th className="numeric">Dòng nghiệp vụ</th>
								<th className="numeric">Đơn bán</th>
								<th className="numeric">Thu tiền</th>
								<th>Khớp danh mục</th>
							</tr>
						</thead>
						<tbody>
							{preview.units.map((unit) => (
								<tr key={unit.id}>
									<td>
										<strong>{unit.name}</strong>
									</td>
									<td>{unit.customerCode ?? "—"}</td>
									<td className="numeric">
										{number.format(unit.sourceRowCount)}
									</td>
									<td className="numeric">
										{number.format(unit.salesDocumentCount)}
									</td>
									<td className="numeric">
										{number.format(unit.receiptDocumentCount)}
									</td>
									<td>
										{unit.customerId ? (
											<StatusPill tone="success" icon={<CheckCircle2 size={13} />}>
												Đã khớp
											</StatusPill>
										) : (
											<StatusPill tone="warning" icon={<Building2 size={13} />}>
												Chưa khớp
											</StatusPill>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{!preview.units.length && (
						<div className="misa-import-preview-empty">
							Không tìm thấy đơn vị nào trong file.
						</div>
					)}
				</div>
			</div>
		</Dialog>
	);
}
