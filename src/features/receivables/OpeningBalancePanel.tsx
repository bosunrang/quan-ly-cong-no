import { Landmark, PencilLine } from "lucide-react";
import { useId, useState } from "react";
import {
	type CustomerOpeningBalance,
	customerOpeningBalanceResource,
	saveCustomerOpeningBalance,
} from "../../domain/misa/opening-balances.repository";
import {
	accountingChanged,
	useServerData,
} from "../../shared/hooks/useServerData";
import { formatDateOnly } from "../../shared/lib/date";
import { Notice } from "../../shared/ui/Notice";
import { parseVnd, VndAmountInput } from "../../shared/ui/VndAmountInput";

const money = new Intl.NumberFormat("vi-VN");
type Side = "debit" | "credit";

/** Số dư đầu kỳ của khách theo ngày chốt chung: xem và điền tay trong ngăn chi tiết. */
export function OpeningBalancePanel({
	customerId,
	canEdit,
}: {
	customerId: string;
	canEdit: boolean;
}) {
	const response = useServerData<CustomerOpeningBalance>(
		customerOpeningBalanceResource(customerId),
	);
	const balance = response.data;
	const [editing, setEditing] = useState(false);
	const [side, setSide] = useState<Side>("debit");
	const [amount, setAmount] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const amountField = useId();
	const value = parseVnd(amount || "0");

	function startEditing(current: CustomerOpeningBalance) {
		setSide(current.amount < 0 ? "credit" : "debit");
		setAmount(current.amount ? money.format(Math.abs(current.amount)) : "");
		setError("");
		setEditing(true);
	}

	async function save(current: CustomerOpeningBalance) {
		if (!Number.isSafeInteger(value) || saving) return;
		setSaving(true);
		setError("");
		try {
			await saveCustomerOpeningBalance(
				customerId,
				side === "credit" ? -value : value,
				current.amount,
			);
			setEditing(false);
			accountingChanged();
		} catch (reason) {
			setError(
				reason instanceof Error ? reason.message : "Không lưu được số dư.",
			);
		} finally {
			setSaving(false);
		}
	}

	if (response.error)
		return (
			<Notice tone="danger" announce>
				{response.error}
			</Notice>
		);
	if (!balance) return null;
	const label = !balance.amount
		? "Chưa có"
		: `${balance.amount < 0 ? "Dư Có" : "Dư Nợ"} ${money.format(Math.abs(balance.amount))} đ`;

	return (
		<section
			className="panel receivable-opening-balance"
			aria-label="Số dư đầu kỳ"
		>
			<header>
				<Landmark className="icon-size-16" />
				<div>
					<h3>Số dư đầu kỳ</h3>
					<span className="cell-meta">
						{balance.date
							? `Cuối ngày ${formatDateOnly(balance.date)}${
									balance.source === "manual"
										? " · Nhập tay"
										: balance.source === "file"
											? " · Báo cáo MISA"
											: ""
								}`
							: "Chưa có ngày chốt"}
					</span>
				</div>
				{!editing && <strong>{label}</strong>}
				{!editing && canEdit && balance.date && !balance.locked && (
					<button
						className="button secondary"
						type="button"
						onClick={() => startEditing(balance)}
					>
						<PencilLine className="icon-size-16" /> Sửa
					</button>
				)}
			</header>
			{!balance.date && (
				<p className="cell-meta">
					Quản trị cần đặt ngày chốt hoặc nhập báo cáo công nợ 131 ở màn Dữ liệu
					MISA trước khi điền số dư.
				</p>
			)}
			{balance.locked && (
				<p className="cell-meta">
					Đã có khoản thu phân bổ vào số dư này. Hoàn tác phân bổ ở Đối soát
					khoản thu trước khi sửa.
				</p>
			)}
			{editing && (
				<form
					className="receivable-opening-form"
					onSubmit={(event) => {
						event.preventDefault();
						void save(balance);
					}}
				>
					<fieldset className="filter-switch">
						<legend className="visually-hidden">Loại số dư</legend>
						{(
							[
								["debit", "Dư Nợ (khách còn nợ)"],
								["credit", "Dư Có (khách trả thừa)"],
							] as const
						).map(([key, text]) => (
							<button
								key={key}
								type="button"
								aria-pressed={side === key}
								disabled={saving}
								onClick={() => setSide(key)}
							>
								{text}
							</button>
						))}
					</fieldset>
					<label className="ui-field" htmlFor={amountField}>
						<span>Số tiền (đồng) · để trống hoặc 0 là bỏ số dư</span>
						<VndAmountInput
							id={amountField}
							value={amount}
							disabled={saving}
							onValueChange={setAmount}
							aria-invalid={!Number.isSafeInteger(value)}
						/>
					</label>
					{error && (
						<Notice tone="danger" announce>
							{error}
						</Notice>
					)}
					<div className="receivable-opening-actions">
						<button
							className="button secondary"
							type="button"
							disabled={saving}
							onClick={() => setEditing(false)}
						>
							Hủy
						</button>
						<button
							className="button primary"
							type="submit"
							disabled={saving || !Number.isSafeInteger(value)}
						>
							{saving ? "Đang lưu..." : "Lưu số dư"}
						</button>
					</div>
				</form>
			)}
		</section>
	);
}
