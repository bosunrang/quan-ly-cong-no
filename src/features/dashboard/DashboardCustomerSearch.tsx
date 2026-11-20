import { useEffect, useState } from "react";
import { normalizeVietnamese } from "../../domain/customers/customer.province";
import type { InvoiceCustomer } from "../../domain/reports/view-types";
import {
	resourceWithQuery,
	useServerData,
} from "../../shared/hooks/useServerData";
import { SearchableInput } from "../../shared/ui/SearchableInput";

export function DashboardCustomerSearch({
	from,
	through,
	employee,
	province,
	disabled,
	onSelect,
}: {
	from: string;
	through: string;
	employee?: string;
	province?: string;
	disabled: boolean;
	onSelect: (customer: InvoiceCustomer) => void;
}) {
	const [text, setText] = useState("");
	const [query, setQuery] = useState("");
	const needle = text.trim();
	useEffect(() => {
		if (needle === query || disabled) return;
		const timer = window.setTimeout(() => setQuery(needle), 250);
		return () => window.clearTimeout(timer);
	}, [disabled, needle, query]);

	const response = useServerData<InvoiceCustomer[]>(
		!disabled && needle && needle === query
			? resourceWithQuery("dashboard/customers", {
					from,
					through,
					employee,
					province,
					q: query,
				})
			: undefined,
	);
	const choices = new Map(
		(response.data ?? []).map((customer) => [
			customer.customerCode
				? `${customer.name} · ${customer.customerCode}`
				: customer.name,
			customer,
		]),
	);
	return (
		<div className="ui-field dashboard-quick-customer">
			<label htmlFor="dashboard-quick-customer">Tìm nhanh khách hàng</label>
			<SearchableInput
				id="dashboard-quick-customer"
				label="khách hàng"
				placeholder="Tên hoặc mã MISA"
				value={text}
				options={[...choices.keys()]}
				normalize={normalizeVietnamese}
				disabled={disabled}
				loading={Boolean(needle) && (needle !== query || response.loading)}
				emptyMessage={
					response.error
						? "Không thể tìm khách hàng. Hãy thử lại."
						: needle
							? "Không tìm thấy khách hàng phù hợp."
							: "Nhập tên hoặc mã MISA để tìm."
				}
				onChange={setText}
				onSelect={(label) => {
					const customer = choices.get(label);
					if (!customer) return;
					setText("");
					setQuery("");
					onSelect(customer);
				}}
			/>
		</div>
	);
}
