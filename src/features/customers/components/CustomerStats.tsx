import { UsersRound } from "lucide-react";
import type { Customer } from "../../../domain/customers/customer.model";
import { currentRecipient } from "../../../domain/customers/customer.selectors";

export function CustomerStats({ customers }: { customers: Customer[] }) {
	const stateCount = customers.filter(
		(customer) => customer.group === "state",
	).length;
	const privateCount = customers.filter(
		(customer) => customer.group === "private",
	).length;
	const missingRecipientCount = customers.filter(
		(customer) => !currentRecipient(customer),
	).length;

	return (
		<section className="customer-stat-grid">
			<article>
				<div className="customer-stat-icon total">
					<UsersRound size={19} />
				</div>
				<div>
					<span>Tổng khách hàng</span>
					<strong>{customers.length}</strong>
					<small>
						{customers.filter((item) => item.status === "active").length} đang
						hoạt động
					</small>
				</div>
			</article>
			<article>
				<div className="customer-stat-icon state">
					<span>NN</span>
				</div>
				<div>
					<span>Khách hàng nhà nước</span>
					<strong>{stateCount}</strong>
					<small>
						{Math.round((stateCount / Math.max(customers.length, 1)) * 100)}%
						danh mục
					</small>
				</div>
			</article>
			<article>
				<div className="customer-stat-icon private">
					<span>TN</span>
				</div>
				<div>
					<span>Khách hàng tư nhân</span>
					<strong>{privateCount}</strong>
					<small>
						{Math.round((privateCount / Math.max(customers.length, 1)) * 100)}%
						danh mục
					</small>
				</div>
			</article>
			<article className={missingRecipientCount ? "needs-attention" : ""}>
				<div className="customer-stat-icon warning">
					<span>!</span>
				</div>
				<div>
					<span>Thiếu người nhận CK</span>
					<strong>{missingRecipientCount}</strong>
					<small>Cần hoàn thiện hồ sơ</small>
				</div>
			</article>
		</section>
	);
}
