import type { Customer } from "../../domain/customers/customer.model";
import {
	customerGroupLabels,
	customerStatusLabels,
} from "../../domain/customers/customer.model";
import { currentAssignment } from "../../domain/customers/customer.selectors";

export function exportCustomers(customers: Customer[]) {
	const header = [
		"Mã MISA",
		"Tên khách hàng",
		"Nhóm",
		"Mã số thuế",
		"Tỉnh/thành",
		"Nhân viên phụ trách",
		"Người nhận chiết khấu",
		"Trạng thái",
	];
	const rows = customers.map((customer) => {
		const assignment = currentAssignment(customer);
		return [
			customer.misaCode,
			customer.name,
			customerGroupLabels[customer.group],
			customer.taxCode,
			customer.province,
			assignment?.employeeName ?? "",
			customer.recipients
				.filter((item) => item.active)
				.map((item) => item.fullName)
				.join("; "),
			customerStatusLabels[customer.status],
		];
	});
	const csv = `\uFEFF${[header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n")}`;
	const url = URL.createObjectURL(
		new Blob([csv], { type: "text/csv;charset=utf-8" }),
	);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = "danh-muc-khach-hang.csv";
	anchor.click();
	URL.revokeObjectURL(url);
}
