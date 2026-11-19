import { ReceiptText } from "lucide-react";
import { useId } from "react";
import type { ReceivableDocument } from "../../domain/payments/receipt-receivables";
import { formatDateOnly } from "../../shared/lib/date";
import { Dialog } from "../../shared/ui/Dialog/Dialog";

const money = new Intl.NumberFormat("vi-VN");

export function InvoiceReceiptAllocationsDialog({
	document,
	onClose,
}: {
	document: ReceivableDocument;
	onClose: () => void;
}) {
	const titleId = useId();
	const allocations = document.balance?.allocations ?? [];
	const title = document.invoiceNumber
		? `Hóa đơn ${document.invoiceNumber}`
		: `Chứng từ ${document.documentNumbers.join(", ")}`;
	return (
		<Dialog
			ariaLabelledBy={titleId}
			eyebrow="KHOẢN THU ĐÃ PHÂN BỔ"
			title={title}
			icon={<ReceiptText className="icon-size-19" />}
			className="receivable-allocations-dialog"
			onClose={onClose}
			footer={
				<button className="button secondary" type="button" onClick={onClose}>
					Quay lại danh sách
				</button>
			}
		>
			<div className="dialog-body">
				{allocations.length ? (
					<section
						className="panel table-scroll table-scroll-auto-gutter receivable-allocations-table"
						aria-label="Vùng cuộn khoản thu đã phân bổ"
						// biome-ignore lint/a11y/noNoninteractiveTabindex: Support scrolling the table by keyboard.
						tabIndex={0}
					>
						<table aria-label="Khoản thu đã phân bổ">
							<thead>
								<tr>
									<th scope="col">Chứng từ thu</th>
									<th scope="col">Ngày thu</th>
									<th scope="col">Ngày phân bổ</th>
									<th scope="col">Số tiền phân bổ</th>
								</tr>
							</thead>
							<tbody>
								{allocations.map((entry) => (
									<tr key={entry.id}>
										<td>{entry.receiptNumber || "—"}</td>
										<td>{formatDateOnly(entry.receiptDate)}</td>
										<td>{formatDateOnly(entry.allocationDate)}</td>
										<td className="receivable-number strong-number">
											{money.format(entry.amount)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</section>
				) : (
					<p className="empty-state">Chưa có khoản thu được phân bổ.</p>
				)}
			</div>
		</Dialog>
	);
}
