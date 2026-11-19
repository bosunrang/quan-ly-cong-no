import { ReceiptText } from "lucide-react";
import { useId } from "react";
import { formatDateOnly } from "../lib/date";
import { Dialog } from "./Dialog/Dialog";

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 12 });
const formatNumber = (value: number | null) =>
	value === null ? "—" : number.format(value);

interface InvoiceLinesDocument {
	invoiceNumber: string;
	invoiceSeries: string;
	invoiceDate: string;
	documentNumbers: readonly string[];
	lines: readonly {
		rowNumber: number;
		productName: string;
		unit: string;
		quantity: number | null;
		unitPrice: number | null;
		paymentTotal: number | null;
	}[];
	balance: { received: number; remaining: number } | null;
	allocationMismatch: boolean;
}

export function SalesInvoiceLinesDialog({
	document,
	customerName,
	backLabel = "Quay lại danh sách",
	onClose,
}: {
	document: InvoiceLinesDocument;
	customerName: string;
	backLabel?: string;
	onClose: () => void;
}) {
	const titleId = useId();
	const documentNumbers = document.documentNumbers.join(", ");
	const title = document.invoiceNumber
		? `Hóa đơn ${document.invoiceNumber}`
		: `Chứng từ ${documentNumbers}`;

	return (
		<Dialog
			ariaLabelledBy={titleId}
			eyebrow="CHI TIẾT DÒNG HÀNG"
			title={title}
			icon={<ReceiptText className="icon-size-19" />}
			className="invoice-lines-dialog"
			onClose={onClose}
			footer={
				<button className="button secondary" type="button" onClick={onClose}>
					{backLabel}
				</button>
			}
		>
			<div className="dialog-body">
				<p className="invoice-lines-source">
					<strong>{customerName}</strong>
					{document.invoiceSeries && (
						<span>Ký hiệu {document.invoiceSeries}</span>
					)}
					{document.invoiceDate && (
						<span>Ngày hóa đơn {formatDateOnly(document.invoiceDate)}</span>
					)}
					{document.invoiceNumber && <span>Chứng từ {documentNumbers}</span>}
				</p>
				<dl className="invoice-lines-balances">
					<div>
						<dt>Đã thu</dt>
						<dd>{formatNumber(document.balance?.received ?? null)}</dd>
					</div>
					<div>
						<dt>Còn phải thu</dt>
						<dd>{formatNumber(document.balance?.remaining ?? null)}</dd>
					</div>
				</dl>
				{document.allocationMismatch && (
					<p className="invoice-lines-source">
						Chứng từ MISA đã thay đổi. Kiểm tra phân bổ trong Đối soát khoản
						thu.
					</p>
				)}
				<section
					className="table-scroll table-scroll-auto-gutter invoice-lines-table"
					aria-label="Vùng cuộn dòng hàng"
					// biome-ignore lint/a11y/noNoninteractiveTabindex: Support scrolling the table by keyboard.
					tabIndex={0}
				>
					<table aria-label="Dòng hàng của hóa đơn hoặc chứng từ">
						<thead>
							<tr>
								<th scope="col">Tên hàng</th>
								<th scope="col">ĐVT</th>
								<th scope="col">Số lượng</th>
								<th scope="col">Đơn giá</th>
								<th scope="col">Tổng thanh toán</th>
							</tr>
						</thead>
						<tbody>
							{document.lines.map((line) => (
								<tr key={line.rowNumber}>
									<td>{line.productName || "—"}</td>
									<td>{line.unit || "—"}</td>
									<td>{formatNumber(line.quantity)}</td>
									<td>{formatNumber(line.unitPrice)}</td>
									<td className="strong-number">
										{formatNumber(line.paymentTotal)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			</div>
		</Dialog>
	);
}
