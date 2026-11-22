import { ReceiptText } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { Customer } from "../../domain/customers/customer.model";
import { normalizeVietnamese } from "../../domain/customers/customer.province";
import {
	type ReceiptDraft,
	similarReceiptDays,
} from "../../domain/payments/receipt-ledger";
import type { SimilarReceipt } from "../../domain/payments/receipt-ledger.repository";
import {
	resourceWithQuery,
	useServerData,
} from "../../shared/hooks/useServerData";
import { formatDateOnly, todayLocal } from "../../shared/lib/date";
import { randomId } from "../../shared/lib/randomId";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { Notice } from "../../shared/ui/Notice";
import { SearchableInput } from "../../shared/ui/SearchableInput";
import { parseVnd, VndAmountInput } from "../../shared/ui/VndAmountInput";

interface Props {
	customers: Customer[];
	busy: boolean;
	error: string;
	onClose: () => void;
	onSave: (
		customer: Customer,
		fields: ReceiptDraft,
		allowDuplicate: boolean,
	) => void;
}

const money = new Intl.NumberFormat("vi-VN");

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
	const [confirmedDuplicate, setConfirmedDuplicate] = useState(false);
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

	// Cảnh báo ghi trùng: khoản thu khác của cùng khách, cùng số tiền, gần ngày hạch toán.
	const selectedCustomer = byLabel.get(customer) ?? undefined;
	const parsedAmount = parseVnd(amount);
	const similarResource =
		selectedCustomer &&
		Number.isSafeInteger(parsedAmount) &&
		parsedAmount > 0 &&
		date
			? resourceWithQuery("receipts/similar", {
					customerId: selectedCustomer.id,
					amount: parsedAmount,
					date,
					exclude: requestId,
				})
			: undefined;
	const similar = useServerData<SimilarReceipt[]>(similarResource).data ?? [];
	// Đổi khách, số tiền hoặc ngày thì phải xác nhận lại với danh sách mới.
	const [confirmedFor, setConfirmedFor] = useState<string>();
	if (confirmedDuplicate && confirmedFor !== similarResource) {
		setConfirmedDuplicate(false);
		setConfirmedFor(undefined);
	}

	return (
		<Dialog
			ariaLabelledBy="receipt-form-title"
			eyebrow="ĐỐI SOÁT KHOẢN THU"
			title="Ghi khoản thu"
			icon={<ReceiptText className="icon-size-19" />}
			className="receipt-form-dialog"
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
				if (similar.length && !confirmedDuplicate) {
					setValidation(
						"Kiểm tra các khoản thu có thể trùng bên dưới. Nếu không phải ghi trùng, tích xác nhận rồi lưu lại.",
					);
					return;
				}
				setValidation("");
				onSave(
					found,
					{
						id: requestId,
						number: number?.trim() || undefined,
						date,
						amount: parseVnd(amount),
						reference,
					},
					confirmedDuplicate,
				);
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
				{similar.length > 0 && (
					<>
						<Notice tone="warning" title="Có thể ghi trùng khoản thu">
							Khách hàng này đã có {similar.length} khoản thu cùng số tiền trong
							vòng {similarReceiptDays} ngày:
							<ul className="receipt-similar-list">
								{similar.map((receipt) => (
									<li key={receipt.id}>
										{receipt.number} · ngày {formatDateOnly(receipt.date)} ·{" "}
										{money.format(receipt.amount)} đ
										{receipt.reference && ` · tham chiếu ${receipt.reference}`}
									</li>
								))}
							</ul>
						</Notice>
						<div className="payment-advance">
							<label className="payment-verify">
								<input
									type="checkbox"
									checked={confirmedDuplicate}
									onChange={(event) => {
										setConfirmedDuplicate(event.target.checked);
										setConfirmedFor(similarResource);
										setValidation("");
									}}
									disabled={busy}
								/>
								Tôi đã kiểm tra, đây không phải khoản thu ghi trùng
							</label>
						</div>
					</>
				)}
			</div>
		</Dialog>
	);
}
