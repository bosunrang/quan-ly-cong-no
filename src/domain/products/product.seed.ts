import type {
	CustomerProductPolicy,
	Product,
	ProductCatalog,
} from "./product.model";

const createdAt = "2026-01-01T08:00:00.000Z";

export const seedProducts: Product[] = [
	{
		id: "PRD-B",
		code: "SP-B",
		name: "Mặt hàng B",
		group: "Hóa chất",
		unit: "Hộp",
		status: "active",
		createdAt,
		updatedAt: createdAt,
	},
	{
		id: "PRD-C",
		code: "SP-C",
		name: "Mặt hàng C",
		group: "Hóa chất",
		unit: "Hộp",
		status: "active",
		createdAt,
		updatedAt: createdAt,
	},
	{
		id: "PRD-D",
		code: "SP-D",
		name: "Mặt hàng D",
		group: "Vật tư",
		unit: "Bộ",
		status: "active",
		createdAt,
		updatedAt: createdAt,
	},
	{
		id: "PRD-E",
		code: "SP-E",
		name: "Mặt hàng E",
		group: "Vật tư",
		unit: "Bộ",
		status: "paused",
		createdAt,
		updatedAt: "2026-04-01T08:00:00.000Z",
	},
];

function policy(
	id: string,
	productId: string,
	customerId: string,
	recipientId: string | null,
	value: number,
	effectiveFrom = "2026-01-01",
): CustomerProductPolicy {
	return {
		id,
		productId,
		customerId,
		recipientAllocations: recipientId ? [{ recipientId, amount: value }] : [],
		calculationType: "fixed",
		value,
		effectiveFrom,
		effectiveTo: null,
		status: "active",
		note: "",
		createdAt,
		updatedAt: createdAt,
	};
}

export const seedCustomerProductPolicies: CustomerProductPolicy[] = [
	policy("POL-B-001", "PRD-B", "CUS-001", "RCP-001", 10_000),
	policy("POL-B-002", "PRD-B", "CUS-002", "RCP-002", 12_000),
	policy("POL-B-003", "PRD-B", "CUS-003", "RCP-003", 8_000),
	policy("POL-C-001", "PRD-C", "CUS-001", "RCP-001", 50_000),
	policy("POL-C-002", "PRD-C", "CUS-002", "RCP-002", 45_000),
	policy("POL-D-001", "PRD-D", "CUS-001", "RCP-001", 30_000),
	policy("POL-D-004", "PRD-D", "CUS-004", null, 25_000),
];

export const seedProductCatalog: ProductCatalog = {
	products: seedProducts,
	policies: seedCustomerProductPolicies,
};
