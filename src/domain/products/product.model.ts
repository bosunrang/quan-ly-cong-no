import { isIsoDate, isIsoTimestamp } from "../../shared/lib/date";

export type ProductStatus = "active" | "paused";
export type PolicyStatus = "active" | "paused";
export type PolicyCalculationType = "fixed" | "percent";

export interface PolicyRecipientAllocation {
	recipientId: string;
	amount: number;
	retainedAmount?: number;
}

export interface Product {
	id: string;
	code: string;
	name: string;
	group: string;
	unit: string;
	status: ProductStatus;
	createdAt: string;
	updatedAt: string;
}

export interface CustomerProductPolicy {
	id: string;
	productId: string;
	customerId: string;
	recipientAllocations: PolicyRecipientAllocation[];
	calculationType: PolicyCalculationType;
	value: number;
	/** Khoản giữ lại cấp chính sách cũ; dữ liệu mới lưu trên từng người nhận. */
	retainedAmount?: number;
	effectiveFrom: string;
	effectiveTo: string | null;
	status: PolicyStatus;
	note: string;
	createdAt: string;
	updatedAt: string;
}

export interface ProductCatalog {
	products: Product[];
	policies: CustomerProductPolicy[];
}

/** Cấu trúc v2, chỉ dùng để chuyển đổi dữ liệu cũ. */
export interface LegacyProductPolicy {
	code: string;
	name: string;
	group: string;
	unit: string;
	price: number;
	discount: number;
	effectiveFrom: string;
	active: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableIsoDate(value: unknown): value is string | null {
	return value === null || isIsoDate(value);
}

export function isLegacyProductPolicyList(
	value: unknown,
): value is LegacyProductPolicy[] {
	return (
		Array.isArray(value) &&
		value.every(
			(item) =>
				isRecord(item) &&
				typeof item.code === "string" &&
				typeof item.name === "string" &&
				typeof item.group === "string" &&
				typeof item.unit === "string" &&
				typeof item.price === "number" &&
				typeof item.discount === "number" &&
				isIsoDate(item.effectiveFrom) &&
				typeof item.active === "boolean",
		)
	);
}

export function isProduct(value: unknown): value is Product {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.code === "string" &&
		typeof value.name === "string" &&
		typeof value.group === "string" &&
		typeof value.unit === "string" &&
		(value.status === "active" || value.status === "paused") &&
		isIsoTimestamp(value.createdAt) &&
		isIsoTimestamp(value.updatedAt)
	);
}

export function isCustomerProductPolicy(
	value: unknown,
): value is CustomerProductPolicy {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.productId === "string" &&
		typeof value.customerId === "string" &&
		Array.isArray(value.recipientAllocations) &&
		value.recipientAllocations.every(
			(allocation) =>
				isRecord(allocation) &&
				typeof allocation.recipientId === "string" &&
				typeof allocation.amount === "number" &&
				allocation.amount > 0 &&
				(allocation.retainedAmount === undefined ||
					(typeof allocation.retainedAmount === "number" &&
						Number.isFinite(allocation.retainedAmount) &&
						allocation.retainedAmount >= 0 &&
						allocation.retainedAmount <= allocation.amount)),
		) &&
		(value.calculationType === "fixed" ||
			value.calculationType === "percent") &&
		typeof value.value === "number" &&
		value.value >= 0 &&
		(value.retainedAmount === undefined ||
			(typeof value.retainedAmount === "number" &&
				Number.isFinite(value.retainedAmount) &&
				value.retainedAmount >= 0 &&
				value.retainedAmount <= value.value)) &&
		isIsoDate(value.effectiveFrom) &&
		isNullableIsoDate(value.effectiveTo) &&
		(value.status === "active" || value.status === "paused") &&
		typeof value.note === "string" &&
		isIsoTimestamp(value.createdAt) &&
		isIsoTimestamp(value.updatedAt)
	);
}

export function isProductCatalog(value: unknown): value is ProductCatalog {
	return (
		isRecord(value) &&
		Array.isArray(value.products) &&
		value.products.every(isProduct) &&
		Array.isArray(value.policies) &&
		value.policies.every(isCustomerProductPolicy)
	);
}
