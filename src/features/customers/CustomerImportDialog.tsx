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
import { customerGroupLabels } from "../../domain/customers/customer.model";
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

	return (
		<Dialog
			ariaLabelledBy="customer-import-title"
			eyebrow="NHẬP DỮ LIỆU EXCEL"
			title="Xem trước danh sách khách hàng"
			icon={<FileSpreadsheet size={19} />}
			className="customer-import-dialog"
			onClose={onClose}
			footer={
				<>
					<button className="button secondary" type="button" onClick={onClose}>
						Hủy
					</button>
					<button
						className="button primary"
						type="button"
						disabled={preview.readyCount === 0}
						onClick={onConfirm}
					>
						<Upload size={16} /> Nhập {preview.readyCount} khách hàng
					</button>
				</>
			}
		>
			<div className="customer-import-body">
				<div className="customer-import-file">
					<FileSpreadsheet size={18} />
					<div>
						<strong>{preview.fileName}</strong>
						<span>{preview.rows.length} dòng dữ liệu được đọc từ Excel</span>
					</div>
				</div>
				<div className="customer-import-summary">
					<button
						className={filter === "all" ? "is-active" : ""}
						type="button"
						onClick={() => setFilter("all")}
					>
						<span>Tổng số dòng</span>
						<strong>{preview.rows.length}</strong>
					</button>
					<button
						className={`ready ${filter === "ready" ? "is-active" : ""}`}
						type="button"
						onClick={() => setFilter("ready")}
					>
						<CheckCircle2 size={16} />
						<span>Sẵn sàng nhập</span>
						<strong>{preview.readyCount}</strong>
					</button>
					<button
						className={`duplicate ${filter === "duplicate" ? "is-active" : ""}`}
						type="button"
						onClick={() => setFilter("duplicate")}
					>
						<Copy size={16} />
						<span>Dòng trùng</span>
						<strong>{preview.duplicateCount}</strong>
					</button>
					<button
						className={`invalid ${filter === "invalid" ? "is-active" : ""}`}
						type="button"
						onClick={() => setFilter("invalid")}
					>
						<AlertCircle size={16} />
						<span>Cần kiểm tra</span>
						<strong>{preview.invalidCount}</strong>
					</button>
				</div>
				<p className="customer-import-rule">
					Hệ thống chỉ nhập các dòng “Sẵn sàng”. Mã đã tồn tại, mã lặp trong
					file hoặc dòng thiếu dữ liệu bắt buộc sẽ được bỏ qua.
				</p>
				<div className="customer-import-table-wrap">
					<table className="customer-import-table">
						<thead>
							<tr>
								<th>Dòng</th>
								<th>Khách hàng</th>
								<th>Nhóm</th>
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
									<td>{customerGroupLabels[row.draft.group]}</td>
									<td>{row.draft.province || "Chưa xác định"}</td>
									<td>
										<StatusPill
											className="customer-import-status"
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
						<div className="customer-import-empty">
							Không có dòng nào trong nhóm đang chọn.
						</div>
					)}
				</div>
			</div>
		</Dialog>
	);
}
