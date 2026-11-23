import type { Customer } from "../../domain/customers/customer.model";
import { customerStatusLabels } from "../../domain/customers/customer.model";
import { currentAssignment } from "../../domain/customers/customer.selectors";

export function exportCustomers(customers: Customer[]) {
	const header = [
		"Mã khách hàng",
		"Tên khách hàng",
		"Địa chỉ",
		"Tỉnh/Thành phố",
		"Mã số thuế",
		"Nhân viên phụ trách",
		"Thời hạn công nợ (ngày)",
		"Trạng thái",
	];
	const rows = customers.map((customer) => [
		customer.misaCode,
		customer.name,
		customer.address,
		customer.province,
		customer.taxCode,
		currentAssignment(customer)?.employeeName ?? "",
		customer.paymentTermDays ?? "",
		customerStatusLabels[customer.status],
	]);
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
