import { Landmark } from "lucide-react";
import { useId, useState } from "react";
import {
	type CustomerOpeningBalance,
	saveCustomerOpeningBalance,
} from "../../domain/misa/opening-balances.repository";
import { accountingChanged } from "../../shared/hooks/useServerData";
import { formatDateOnly } from "../../shared/lib/date";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { Notice } from "../../shared/ui/Notice";
import { parseVnd, VndAmountInput } from "../../shared/ui/VndAmountInput";

const money = new Intl.NumberFormat("vi-VN");
type Side = "debit" | "credit";
const sides = [
	{ value: "debit", label: "Dư Nợ", description: "Khách còn nợ" },
	{ value: "credit", label: "Dư Có", description: "Khách trả thừa" },
] as const;

export function OpeningBalanceDialog({
	customerId,
	customerName,
	balance,
	onClose,
}: {
	customerId: string;
	customerName: string;
	balance: CustomerOpeningBalance;
	onClose: () => void;
}) {
	const title = useId();
	const amountField = useId();
	const amountLabel = useId();
	const amountHint = useId();
	const sideGroup = useId();
	const [side, setSide] = useState<Side>(
		balance.amount < 0 ? "credit" : "debit",
	);
	const [amount, setAmount] = useState(
		balance.amount === 0 ? "" : money.format(Math.abs(balance.amount)),
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const value = parseVnd(amount || "0");
	const validAmount = Number.isSafeInteger(value);

	async function save() {
		if (!validAmount || saving) return;
		setSaving(true);
		setError("");
		try {
			await saveCustomerOpeningBalance(
				customerId,
				side === "credit" ? -value : value,
				balance.amount,
			);
			accountingChanged();
			onClose();
		} catch (reason) {
			setSaving(false);
			setError(
				reason instanceof Error ? reason.message : "Không lưu được số dư.",
			);
		}
	}

	return (
		<Dialog
			ariaLabelledBy={title}
			eyebrow="CÔNG NỢ PHẢI THU"
			title={balance.amount ? "Sửa số dư đầu kỳ" : "Nhập số dư đầu kỳ"}
			icon={<Landmark className="icon-size-19" />}
			disableClose={saving}
			onClose={onClose}
			onSubmit={(event) => {
				event.preventDefault();
				void save();
			}}
			footer={
				<>
					<button
						className="button secondary"
						type="button"
						disabled={saving}
						onClick={onClose}
					>
						Hủy
					</button>
					<button
						className="button primary"
						type="submit"
						disabled={saving || !validAmount}
					>
						{saving ? "Đang lưu…" : "Lưu số dư"}
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
				<div className="receivable-opening-context">
					<strong>{customerName}</strong>
					<span className="cell-meta">
						Cuối ngày {formatDateOnly(balance.date)}
					</span>
				</div>
				<fieldset className="receivable-opening-side" disabled={saving}>
					<legend className="ui-field-label">Loại số dư</legend>
					<div className="receivable-opening-choices">
						{sides.map(({ value, label, description }) => (
							<label
								className="choice-card receivable-opening-choice"
								key={value}
							>
								<input
									type="radio"
									name={sideGroup}
									value={value}
									checked={side === value}
									onChange={() => setSide(value)}
								/>
								<span>
									<strong>{label}</strong>
									<small>{description}</small>
								</span>
							</label>
						))}
					</div>
				</fieldset>
				<label className="ui-field" htmlFor={amountField}>
					<span id={amountLabel}>Số tiền (đồng)</span>
					<VndAmountInput
						className="receivable-opening-amount"
						id={amountField}
						value={amount}
						placeholder="0"
						disabled={saving}
						onValueChange={setAmount}
						aria-labelledby={amountLabel}
						aria-describedby={amountHint}
						aria-invalid={!validAmount}
					/>
					<small className="receivable-opening-hint" id={amountHint}>
						{validAmount
							? "Để trống hoặc nhập 0 để bỏ số dư."
							: "Nhập số tiền nguyên hợp lệ."}
					</small>
				</label>
			</div>
		</Dialog>
	);
}
