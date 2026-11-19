import { Notice } from "../../shared/ui/Notice";
import {
	AlertCircle,
	CheckCircle2,
	Copy,
	FileSpreadsheet,
	Upload,
} from "lucide-react";
import { useState } from "react";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { StatusPill } from "../../shared/ui/StatusPill";
import type {
	CustomerImportPreview,
	CustomerImportStatus,
} from "./customer.import";

type ImportFilter = "all" | CustomerImportStatus;

interface CustomerImportDialogProps {
	preview: CustomerImportPreview;
	onClose: () => void;
	onConfirm: () => void;
}

export function CustomerImportDialog({
	preview,
	onClose,
	onConfirm,
}: CustomerImportDialogProps) {
	const [filter, setFilter] = useState<ImportFilter>("all");
	const visibleRows =
		filter === "all"
			? preview.rows
			: preview.rows.filter((row) => row.status === filter);
	const importCount = preview.readyCount;

	return (
		<Dialog
			ariaLabelledBy="customer-import-title"
			eyebrow="NHẬP DỮ LIỆU EXCEL"
			title="Xem trước danh sách khách hàng"
			icon={<FileSpreadsheet className="icon-size-19" />}
			className="import-preview-dialog"
			onClose={onClose}
			footer={
				<>
					<button className="button secondary" type="button" onClick={onClose}>
						Hủy
					</button>
					<button
						className="button primary"
						type="button"
						disabled={importCount === 0}
						onClick={onConfirm}
					>
						<Upload className="icon-size-16" /> Xử lý {importCount} khách hàng
					</button>
				</>
			}
		>
			<div className="import-preview-body">
				<div className="import-preview-file">
					<FileSpreadsheet className="icon-size-18" />
					<div>
						<strong>{preview.fileName}</strong>
						<span>{preview.rows.length} dòng dữ liệu được đọc từ Excel</span>
					</div>
				</div>
				<div className="import-preview-filters customer-import-summary">
					<button
						type="button"
						aria-pressed={filter === "all"}
						onClick={() => setFilter("all")}
					>
						<span>Tổng số dòng</span>
						<strong>{preview.rows.length}</strong>
					</button>
					<button
						className="ready"
						type="button"
						aria-pressed={filter === "ready"}
						onClick={() => setFilter("ready")}
					>
						<CheckCircle2 className="icon-size-16" />
						<span>Sẵn sàng nhập</span>
						<strong>{preview.readyCount}</strong>
					</button>
					<button
						className="duplicate"
						type="button"
						aria-pressed={filter === "duplicate"}
						onClick={() => setFilter("duplicate")}
					>
						<Copy className="icon-size-16" />
						<span>Dòng trùng</span>
						<strong>{preview.duplicateCount}</strong>
					</button>
					<button
						className="invalid"
						type="button"
						aria-pressed={filter === "invalid"}
						onClick={() => setFilter("invalid")}
					>
						<AlertCircle className="icon-size-16" />
						<span>Cần kiểm tra</span>
						<strong>{preview.invalidCount}</strong>
					</button>
				</div>
				<Notice tone="info">
					Các dòng hợp lệ được thêm vào danh mục. Mã MISA đã có sẽ được bỏ qua.
				</Notice>
				<div className="import-preview-table-wrap">
					<table className="import-preview-table customer-import-preview-table">
						<thead>
							<tr>
								<th>Dòng</th>
								<th>Khách hàng</th>
								<th>Tỉnh/thành phố</th>
								<th>Kết quả kiểm tra</th>
							</tr>
						</thead>
						<tbody>
							{visibleRows.map((row) => (
								<tr key={row.rowNumber}>
									<td>{row.rowNumber}</td>
									<td>
										<strong>{row.draft.name || "Chưa có tên"}</strong>
										<span>
											{row.draft.misaCode || "Chưa có mã"} ·{" "}
											{row.draft.address || "Chưa có địa chỉ"}
										</span>
									</td>
									<td>{row.draft.province || "Chưa xác định"}</td>
									<td>
										<StatusPill
											className="import-preview-status"
											tone={
												row.status === "ready"
													? "success"
													: row.status === "duplicate"
														? "warning"
														: "danger"
											}
										>
											{row.status === "ready"
												? "Sẵn sàng"
												: row.status === "duplicate"
													? "Bỏ qua"
													: "Có lỗi"}
										</StatusPill>
										<small>{row.message}</small>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{visibleRows.length === 0 && (
						<div className="import-preview-empty">
							Không có dòng nào trong nhóm đang chọn.
						</div>
					)}
				</div>
			</div>
		</Dialog>
	);
}
