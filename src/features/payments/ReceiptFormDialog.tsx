import { ReceiptText } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { Customer } from "../../domain/customers/customer.model";
import { normalizeVietnamese } from "../../domain/customers/customer.province";
import type { ReceiptDraft } from "../../domain/payments/receipt-ledger";
import {
	resourceWithQuery,
	useServerData,
} from "../../shared/hooks/useServerData";
import { todayLocal } from "../../shared/lib/date";
import { randomId } from "../../shared/lib/randomId";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { Notice } from "../../shared/ui/Notice";
import { SearchableInput } from "../../shared/ui/SearchableInput";
import { parseVnd, VndAmountInput } from "./VndAmountInput";

interface Props {
	customers: Customer[];
	busy: boolean;
	error: string;
	onClose: () => void;
	onSave: (customer: Customer, fields: ReceiptDraft) => void;
}

export function ReceiptFormDialog({
	customers,
	busy,
	error,
	onClose,
	onSave,
}: Props) {
	const customerField = useId();
	const dateField = useId();
	const amountField = useId();
	// Bấm lưu hai lần hoặc gửi lại sau lỗi mạng dùng cùng mã nên không thành hai khoản thu.
	const [requestId] = useState(randomId);
	const [customer, setCustomer] = useState("");
	const [number, setNumber] = useState<string>();
	const [date, setDate] = useState(todayLocal);
	const suggestedNumber =
		useServerData<string>(
			date ? resourceWithQuery("receipts/next-number", { date }) : undefined,
		).data ?? "";

	const [amount, setAmount] = useState("");
	const [reference, setReference] = useState("");
	const [validation, setValidation] = useState("");
	const { byLabel, options } = useMemo(() => {
		const index = new Map<string, Customer | null>();
		for (const item of customers) {
			const label = [item.misaCode, item.name, item.taxCode]
				.filter(Boolean)
				.join(" · ");
			index.set(label, index.has(label) ? null : item);
		}
		const options = [...index.keys()]
			.filter((label) => index.get(label))
			.sort((left, right) => left.localeCompare(right, "vi"));
		return { byLabel: index, options };
	}, [customers]);

	return (
		<Dialog
			ariaLabelledBy="receipt-form-title"
			eyebrow="ĐỐI SOÁT KHOẢN THU"
			title="Ghi khoản thu"
			icon={<ReceiptText className="icon-size-19" />}
			disableClose={busy}
			onClose={onClose}
			onSubmit={(event) => {
				event.preventDefault();
				const found = byLabel.get(customer);
				if (!found) {
					setValidation("Chọn đúng khách hàng trong danh mục.");
					return;
				}
				if (busy) return;
				setValidation("");
				onSave(found, {
					id: requestId,
					number: number?.trim() || undefined,
					date,
					amount: parseVnd(amount),
					reference,
				});
			}}
			footer={
				<>
					<button
						className="button secondary"
						type="button"
						onClick={onClose}
						disabled={busy}
					>
						Hủy
					</button>
					<button className="button primary" type="submit" disabled={busy}>
						{busy ? "Đang lưu…" : "Lưu khoản thu"}
					</button>
				</>
			}
		>
			<div className="dialog-body">
				{(validation || error) && (
					<Notice tone="danger" announce>
						{validation || error}
					</Notice>
				)}
				<fieldset className="dialog-grid payment-fields" disabled={busy}>
					<div className="ui-field payment-field-wide">
						<label htmlFor={customerField}>Khách hàng</label>
						<SearchableInput
							id={customerField}
							label="khách hàng"
							options={options}
							normalize={normalizeVietnamese}
							value={customer}
							onChange={setCustomer}
							placeholder="Tìm tên, mã MISA hoặc MST"
						/>
					</div>
					<label>
						Số chứng từ thu
						<input
							value={number ?? suggestedNumber}
							placeholder={suggestedNumber}
							onChange={(event) => setNumber(event.target.value)}
							onBlur={() => setNumber(number?.trim() || undefined)}
						/>
					</label>
					<label htmlFor={dateField}>
						Ngày hạch toán
						<DateInput
							id={dateField}
							ariaLabel="Ngày hạch toán"
							value={date}
							onChange={setDate}
							disabled={busy}
						/>
					</label>
					<label htmlFor={amountField}>
						Số tiền thu
						<VndAmountInput
							id={amountField}
							required
							value={amount}
							onValueChange={setAmount}
						/>
					</label>
					<label>
						Tham chiếu hóa đơn (nếu có)
						<input
							value={reference}
							onChange={(event) => setReference(event.target.value)}
							placeholder="Số hóa đơn hoặc chứng từ"
						/>
					</label>
				</fieldset>
			</div>
		</Dialog>
	);
}
