import type { Customer } from "../../domain/customers/customer.model";
import type { ProductCatalog } from "../../domain/products/product.model";
import { netAllocationValue } from "../../domain/products/product-policy.service";
import { formatDateOnly } from "../../shared/lib/date";

function downloadCsv(rows: string[][]) {
	const csv = rows
		.map((row) =>
			row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
		)
		.join("\r\n");
	const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = "san-pham-va-chinh-sach.csv";
	link.click();
	URL.revokeObjectURL(url);
}

export function exportProductCatalog(
	catalog: ProductCatalog,
	customers: Customer[],
) {
	const rows = [
		[
			"Mã sản phẩm",
			"Tên sản phẩm",
			"Nhóm",
			"ĐVT",
			"Mã đơn vị",
			"Tên đơn vị",
			"Người nhận chiết khấu",
			"Mức chính sách người nhận",
			"Giữ lại người nhận",
			"Thực nhận người nhận",
			"Tổng chính sách",
			"Hiệu lực từ",
			"Hiệu lực đến",
			"Trạng thái chính sách",
		],
		...catalog.products.flatMap((product) => {
			const policies = catalog.policies.filter(
				(policy) => policy.productId === product.id,
			);
			if (!policies.length)
				return [
					[
						product.code,
						product.name,
						product.group,
						product.unit,
						"",
						"",
						"",
						"",
						"",
						"",
						"",
						"",
						"",
						"Chưa có chính sách",
					],
				];
			return policies.flatMap((policy) => {
				const customer = customers.find(
					(item) => item.id === policy.customerId,
				);
				const base = [
					product.code,
					product.name,
					product.group,
					product.unit,
					customer?.misaCode ?? "",
					customer?.name ?? "",
				];
				if (!policy.recipientAllocations.length)
					return [
						[
							...base,
							"",
							"",
							"",
							"",
							String(policy.value),
							formatDateOnly(policy.effectiveFrom),
							formatDateOnly(policy.effectiveTo, ""),
							policy.status === "active" ? "Đang áp dụng" : "Tạm dừng",
						],
					];
				return policy.recipientAllocations.map((allocation) => {
					const recipient = customer?.recipients.find(
						(item) => item.id === allocation.recipientId,
					);
					return [
						...base,
						recipient?.fullName ?? "",
						String(allocation.amount),
						String(allocation.retainedAmount ?? 0),
						String(netAllocationValue(allocation)),
						String(policy.value),
						formatDateOnly(policy.effectiveFrom),
						formatDateOnly(policy.effectiveTo, ""),
						policy.status === "active" ? "Đang áp dụng" : "Tạm dừng",
					];
				});
			});
		}),
	];
	downloadCsv(rows);
}
