import { Landmark } from "lucide-react";
import { useId } from "react";
import {
	type CustomerOpeningBalance,
	customerOpeningBalanceResource,
} from "../../domain/misa/opening-balances.repository";
import { useServerData } from "../../shared/hooks/useServerData";
import { formatDateOnly } from "../../shared/lib/date";
import { Notice } from "../../shared/ui/Notice";
import { RowActionButton } from "../../shared/ui/RowActionButton";
import { StatusPill } from "../../shared/ui/StatusPill";

const money = new Intl.NumberFormat("vi-VN");

/** Số dư đầu kỳ của khách theo ngày chốt chung. */
export function OpeningBalancePanel({
	customerId,
	canEdit,
	onEdit,
}: {
	customerId: string;
	canEdit: boolean;
	onEdit: (balance: CustomerOpeningBalance) => void;
}) {
	const response = useServerData<CustomerOpeningBalance>(
		customerOpeningBalanceResource(customerId),
	);
	const balance = response.data;
	const heading = useId();

	if (response.error)
		return (
			<Notice tone="danger" announce>
				{response.error}
			</Notice>
		);
	if (!balance) return null;
	return (
		<section
			className="panel receivable-opening-balance"
			aria-labelledby={heading}
		>
			<header className="receivable-opening-head">
				<span className="data-source-icon" aria-hidden="true">
					<Landmark className="icon-size-18" />
				</span>
				<div className="receivable-opening-title">
					<h3 id={heading}>Số dư đầu kỳ</h3>
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
				<div className="receivable-opening-current">
					{balance.amount !== 0 && (
						<StatusPill tone="info">
							{balance.amount > 0 ? "Dư Nợ" : "Dư Có"}
						</StatusPill>
					)}
					<div className="receivable-opening-value">
						{balance.amount !== 0 ? (
							<strong>{money.format(Math.abs(balance.amount))} đ</strong>
						) : (
							<StatusPill tone="neutral">Chưa có số dư</StatusPill>
						)}
						{canEdit && balance.date && !balance.locked && (
							<RowActionButton
								action="edit"
								className="receivable-opening-edit"
								aria-haspopup="dialog"
								label={
									balance.amount ? "Sửa số dư đầu kỳ" : "Nhập số dư đầu kỳ"
								}
								onClick={() => onEdit(balance)}
							/>
						)}
					</div>
				</div>
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
		</section>
	);
}
