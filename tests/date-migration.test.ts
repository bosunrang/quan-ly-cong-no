import { beforeEach, describe, expect, it } from "vitest";
import { readOrderRecords } from "../src/domain/orders/order.repository";
import { readProductCatalog } from "../src/domain/products/product.repository";
import { seedProductCatalog } from "../src/domain/products/product.seed";
import { readReconciliationData } from "../src/domain/reconciliation/reconciliation.repository";

describe("date-only storage migrations", () => {
	beforeEach(() => window.localStorage.clear());

	it("migrate ngày đơn hàng từ v1 sang ISO date-only", () => {
		window.localStorage.setItem(
			"mkt-cost.orders.v1",
			JSON.stringify({
				version: 1,
				data: [
					{
						id: "O-1",
						date: "15/01/2026",
						orderNo: "BH-1",
						customerCode: "KH-1",
						customerName: "A",
						product: "B",
						quantity: 1,
						unitPrice: 100,
						discountPerUnit: 10,
					},
				],
			}),
		);

		expect(readOrderRecords()[0].date).toBe("2026-01-15");
		expect(
			JSON.parse(window.localStorage.getItem("mkt-cost.orders.v3") ?? "")
				.data[0].date,
		).toBe("2026-01-15");
	});

	it("migrate ngày hiệu lực sản phẩm từ v1 sang ISO date-only", () => {
		window.localStorage.setItem(
			"mkt-cost.products.v1",
			JSON.stringify({
				version: 1,
				data: [
					{
						code: "SP-1",
						name: "Sản phẩm",
						group: "Nhóm",
						unit: "Hộp",
						price: 100,
						discount: 10,
						effectiveFrom: "01/04/2026",
						active: true,
					},
				],
			}),
		);

		expect(readProductCatalog().policies[0].effectiveFrom).toBe("2026-04-01");
		expect(
			JSON.parse(window.localStorage.getItem("mkt-cost.products.v7") ?? "").data
				.policies[0].effectiveFrom,
		).toBe("2026-04-01");
	});

	it("chuyển người nhận đơn thành danh sách mức tiền khi nâng từ v4", () => {
		const policies = seedProductCatalog.policies.map(
			({ recipientAllocations, ...policy }) => ({
				...policy,
				recipientId: recipientAllocations[0]?.recipientId ?? null,
			}),
		);
		window.localStorage.setItem(
			"mkt-cost.products.v4",
			JSON.stringify({
				version: 4,
				data: { products: seedProductCatalog.products, policies },
			}),
		);

		expect(
			readProductCatalog().policies.find(
				(policy) => policy.customerId === "CUS-001",
			)?.recipientAllocations[0],
		).toEqual({ recipientId: "RCP-001", amount: 10_000 });
		expect(
			JSON.parse(window.localStorage.getItem("mkt-cost.products.v7") ?? "").data
				.policies[0].recipientAllocations[0].recipientId,
		).toBe("RCP-001");
	});

	it("gộp hai nhánh sản phẩm v6 về một danh mục dùng chung", () => {
		const [base] = seedProductCatalog.products;
		const [policy] = seedProductCatalog.policies;
		window.localStorage.setItem(
			"mkt-cost.products.v6",
			JSON.stringify({
				version: 6,
				data: {
					products: [
						{ ...base, id: "PRD-B-STATE", customerGroup: "state" },
						{ ...base, id: "PRD-B-PRIVATE", customerGroup: "private" },
					],
					policies: [
						{ ...policy, productId: "PRD-B-STATE" },
						{
							...policy,
							id: "POL-B-PRIVATE",
							productId: "PRD-B-PRIVATE",
							customerId: "CUS-003",
						},
					],
				},
			}),
		);

		const migrated = readProductCatalog();
		expect(migrated.products).toHaveLength(1);
		expect(migrated.products[0].id).toBe("PRD-B");
		expect(migrated.policies.every((item) => item.productId === "PRD-B")).toBe(
			true,
		);
	});

	it("migrate ngày cập nhật đối soát từ v1 sang ISO date-only", () => {
		window.localStorage.setItem(
			"mkt-cost.reconciliation.v1",
			JSON.stringify({
				version: 1,
				data: {
					periodLabel: "Quý II/2026",
					updatedThrough: "25/08/2026",
					entries: [],
					monthlySeries: [],
				},
			}),
		);

		expect(readReconciliationData().updatedThrough).toBe("2026-08-25");
		expect(
			JSON.parse(
				window.localStorage.getItem("mkt-cost.reconciliation.v2") ?? "",
			).data.updatedThrough,
		).toBe("2026-08-25");
	});
});
