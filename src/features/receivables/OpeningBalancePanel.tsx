import { type FormEvent, useId, useState } from "react";
import type { OpeningBalance } from "../../domain/customers/customer.model";
import { api } from "../../shared/api/client";
import {
	accountingChanged,
	useServerData,
} from "../../shared/hooks/useServerData";
import { formatDateOnly, isIsoDate, todayLocal } from "../../shared/lib/date";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { Notice } from "../../shared/ui/Notice";
import { parseVnd, VndAmountInput } from "../../shared/ui/VndAmountInput";

type OpeningBalanceView = { balance: OpeningBalance | null; locked: boolean };
const money = new Intl.NumberFormat("vi-VN");

export function OpeningBalancePanel({
	customerId,
	canEdit,
}: {
	customerId: string;
	canEdit: boolean;
}) {
	const resource = `receivables/opening-balances/${encodeURIComponent(customerId)}`;
	const response = useServerData<OpeningBalanceView>(resource);
	const [notice, setNotice] = useState("");
	const balance = response.data?.balance ?? null;
	if (response.error)
		return (
			<Notice tone="danger" announce>
				{response.error}
			</Notice>
		);
	if (!response.data) return null;
	return (
		<section className="panel receivable-opening" aria-label="Số dư đầu kỳ">
			<h3>Số dư đầu kỳ</h3>
			{canEdit && !response.data.locked ? (
				<OpeningBalanceFields
					key={`${balance?.date}:${balance?.amount}`}
					balance={balance}
					resource={resource}
					onSaved={() => setNotice("Đã lưu số dư đầu kỳ.")}
				/>
			) : (
				<p>
					{balance
						? `${money.format(balance.amount)} ₫ · Ngày chốt ${formatDateOnly(balance.date)}`
						: "Chưa nhập số dư."}
				</p>
			)}
			{canEdit && response.data.locked && (
				<p>Số dư đã được dùng để phân bổ khoản thu.</p>
			)}
			{notice && <p role="status">{notice}</p>}
		</section>
	);
}

function OpeningBalanceFields({
	balance,
	resource,
	onSaved,
}: {
	balance: OpeningBalance | null;
	resource: string;
	onSaved: () => void;
}) {
	const amountId = useId();
	const dateId = useId();
	const [amount, setAmount] = useState(balance ? String(balance.amount) : "");
	const [date, setDate] = useState(balance?.date ?? "");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const value = parseVnd(amount);
	const valid =
		Number.isSafeInteger(value) &&
		value >= 0 &&
		(value === 0 || (isIsoDate(date) && date <= todayLocal()));
	const changed =
		value !== (balance?.amount ?? 0) || (value > 0 && date !== balance?.date);
	async function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!valid || !changed || busy) return;
		setBusy(true);
		setError("");
		try {
			await api("PUT", resource, { expected: balance, amount: value, date });
			onSaved();
			accountingChanged();
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: "Không thể lưu số dư đầu kỳ.",
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<form onSubmit={save}>
			<div className="receivable-opening-fields">
				<div className="ui-field">
					<label className="ui-field-label" htmlFor={amountId}>
						Số tiền (VND)
					</label>
					<VndAmountInput
						className="ui-text-input"
						id={amountId}
						value={amount}
						onValueChange={setAmount}
						disabled={busy}
						placeholder="0"
					/>
				</div>
				<div className="ui-field">
					<label className="ui-field-label" htmlFor={dateId}>
						Ngày chốt số dư
					</label>
					<DateInput
						id={dateId}
						ariaLabel="Ngày chốt số dư"
						value={date}
						onChange={setDate}
						disabled={busy}
					/>
				</div>
				<button
					type="submit"
					className="button primary"
					disabled={busy || !valid || !changed}
				>
					Lưu số dư
				</button>
			</div>
			<p>
				Chỉ nhập khoản nợ còn lại tại ngày chốt chưa có trong sổ MISA đã nhập.
				{balance && " Nhập 0 để xóa số dư."}
			</p>
			{error && (
				<Notice tone="danger" announce>
					{error}
				</Notice>
			)}
		</form>
	);
}
