import { CalendarDays } from "lucide-react";
import { useId, useState } from "react";
import {
	invoiceDueDateFromTerm,
	invoiceTermStartDate,
} from "../../domain/payments/receivable-aging";
import type { InvoiceRow } from "../../domain/reports/view-types";
import { api } from "../../shared/api/client";
import { accountingChanged } from "../../shared/hooks/useServerData";
import { formatDateOnly, isIsoDate } from "../../shared/lib/date";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { Notice } from "../../shared/ui/Notice";

const termOptions = [30, 45, 60, 90, 120];

export function InvoiceDueDateDialog({
	invoice,
	resource,
	onClose,
}: {
	invoice: InvoiceRow;
	resource: string;
	onClose: () => void;
}) {
	const titleId = useId();
	const dateField = useId();
	const [date, setDate] = useState(invoice.aging?.dueDate ?? "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const expected = invoice.aging?.overrideDueDate ?? null;
	const documentLabel =
		invoice.invoiceNumber || invoice.documentNumbers.join(", ");
	const termStartDate = invoiceTermStartDate(invoice);
	const termStartLabel = isIsoDate(invoice.invoiceDate)
		? "ngày hóa đơn"
		: "ngày chứng từ";

	function chooseDate(next: string) {
		setDate(next);
		setError("");
	}

	async function save(dueDate: string | null) {
		if (saving || (dueDate !== null && !isIsoDate(dueDate))) return;
		setSaving(true);
		setError("");
		try {
			await api<boolean>("PATCH", resource, { dueDate, expected });
			accountingChanged();
			onClose();
		} catch (error) {
			setSaving(false);
			setError(
				error instanceof Error
					? error.message
					: "Không lưu được hạn thanh toán.",
			);
		}
	}

	return (
		<Dialog
			ariaLabelledBy={titleId}
			eyebrow="HÓA ĐƠN VÀ CHỨNG TỪ"
			title="Sửa hạn thanh toán"
			icon={<CalendarDays className="icon-size-19" />}
			onClose={onClose}
			disableClose={saving}
			onSubmit={(event) => {
				event.preventDefault();
				void save(date);
			}}
			footer={
				<>
					{expected !== null && (
						<button
							className="button secondary"
							type="button"
							disabled={saving}
							onClick={() => void save(null)}
						>
							Dùng kỳ hạn mặc định
						</button>
					)}
					<button
						className="button primary"
						type="submit"
						disabled={saving || !isIsoDate(date)}
					>
						Lưu hạn
					</button>
				</>
			}
		>
			<div className="dialog-body">
				{error && (
					<Notice tone="danger" announce>
						{error}
					</Notice>
				)}
				{termStartDate && (
					<div className="ui-field">
						<span>Kỳ hạn thanh toán</span>
						<fieldset className="filter-switch invoice-term-options">
							<legend className="visually-hidden">
								Chọn số ngày thanh toán
							</legend>
							{termOptions.map((days) => {
								const due = invoiceDueDateFromTerm(invoice, days);
								return (
									<button
										key={days}
										type="button"
										disabled={saving || !due}
										aria-pressed={due !== null && due === date}
										onClick={() => due && chooseDate(due)}
									>
										{days} ngày
									</button>
								);
							})}
						</fieldset>
						<small className="cell-meta">
							Tính từ {termStartLabel} {formatDateOnly(termStartDate)}.
						</small>
					</div>
				)}
				<label className="ui-field" htmlFor={dateField}>
					<span>Hạn thanh toán · {documentLabel}</span>
					<DateInput
						id={dateField}
						ariaLabel="Hạn thanh toán"
						value={date}
						disabled={saving}
						onChange={chooseDate}
					/>
				</label>
			</div>
		</Dialog>
	);
}
