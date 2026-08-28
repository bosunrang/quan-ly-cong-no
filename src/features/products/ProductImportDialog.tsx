import {
	AlertCircle,
	CheckCircle2,
	Copy,
	FileSpreadsheet,
	RefreshCw,
	Upload,
} from "lucide-react";
import { useState } from "react";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { StatusPill, type StatusTone } from "../../shared/ui/StatusPill";
import type {
	ProductImportPreview,
	ProductImportStatus,
} from "./product.import";

type Filter = "all" | ProductImportStatus;

interface Props {
	preview: ProductImportPreview;
	onClose: () => void;
	onConfirm: () => void;
}

export function ProductImportDialog({ preview, onClose, onConfirm }: Props) {
	const [filter, setFilter] = useState<Filter>("all");
	const visibleRows =
		filter === "all"
			? preview.rows
			: preview.rows.filter((row) => row.status === filter);
	const importCount = preview.readyCount + preview.updateCount;
	const rowTone = (status: ProductImportStatus): StatusTone =>
		status === "ready" || status === "update"
			? "success"
			: status === "duplicate"
				? "warning"
				: "danger";
	return (
		<Dialog
			ariaLabelledBy="product-import-title"
			eyebrow="NHẬP DANH MỤC EXCEL"
			title="Xem trước danh sách sản phẩm"
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
						disabled={importCount === 0}
						onClick={onConfirm}
					>
						<Upload size={16} /> Nhập {importCount} sản phẩm
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
				<div className="product-import-summary">
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
						<span>Thêm mới</span>
						<strong>{preview.readyCount}</strong>
					</button>
					<button
						className={`update ${filter === "update" ? "is-active" : ""}`}
						type="button"
						onClick={() => setFilter("update")}
					>
						<RefreshCw size={16} />
						<span>Cập nhật</span>
						<strong>{preview.updateCount}</strong>
					</button>
					<button
						className={`duplicate ${filter === "duplicate" ? "is-active" : ""}`}
						type="button"
						onClick={() => setFilter("duplicate")}
					>
						<Copy size={16} />
						<span>Trùng/không đổi</span>
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
					Sản phẩm không thay đổi sẽ được bỏ qua. Chỉ cập nhật Tên hàng, ĐVT
					hoặc Nhóm khi dữ liệu thực sự khác; chính sách hiện có vẫn được giữ
					nguyên.
				</p>
				<div className="customer-import-table-wrap product-import-table-wrap">
					<table className="customer-import-table product-import-preview-table">
						<thead>
							<tr>
								<th>Dòng</th>
								<th>Mã hàng</th>
								<th>Tên hàng</th>
								<th>ĐVT</th>
								<th>Nhóm</th>
								<th>Kết quả</th>
							</tr>
						</thead>
						<tbody>
							{visibleRows.map((row) => (
								<tr key={row.rowNumber}>
									<td>{row.rowNumber}</td>
									<td>
										<strong>{row.draft.code || "Thiếu mã"}</strong>
									</td>
									<td>{row.draft.name || "Thiếu tên"}</td>
									<td>{row.draft.unit || "—"}</td>
									<td>{row.draft.group || "Chưa phân nhóm"}</td>
									<td>
										<StatusPill
											className="customer-import-status"
											tone={rowTone(row.status)}
										>
											{row.status === "ready"
												? "Thêm mới"
												: row.status === "update"
													? "Cập nhật"
													: row.status === "duplicate"
														? "Trùng"
														: "Có lỗi"}
										</StatusPill>
										<small>{row.message}</small>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{!visibleRows.length && (
						<div className="customer-import-empty">
							Không có dòng nào trong nhóm đang chọn.
						</div>
					)}
				</div>
			</div>
		</Dialog>
	);
}
