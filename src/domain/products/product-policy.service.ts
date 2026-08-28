import { createId } from "../../shared/lib/identity";
import { previousDay } from "../../shared/lib/date";
import type {
	CustomerProductPolicy,
	PolicyCalculationType,
	PolicyRecipientAllocation,
	Product,
	ProductCatalog,
} from "./product.model";

export interface PolicyDraft {
	productId: string;
	customerIds: string[];
	recipientAllocationsByCustomer?: Record<string, PolicyRecipientAllocation[]>;
	calculationType: PolicyCalculationType;
	value: number;
	effectiveFrom: string;
	effectiveTo: string | null;
	note: string;
}

export interface PolicyResolution {
	policy: CustomerProductPolicy;
	discountPerUnit: number;
}

function endOfRange(value: string | null): string {
	return value ?? "9999-12-31";
}

export function rangesOverlap(
	fromA: string,
	toA: string | null,
	fromB: string,
	toB: string | null,
): boolean {
	return fromA <= endOfRange(toB) && fromB <= endOfRange(toA);
}

export function validatePolicyDraft(
	catalog: ProductCatalog,
	draft: PolicyDraft,
	excludedPolicyId?: string,
): string | undefined {
	if (!draft.productId) return "Vui lòng chọn sản phẩm.";
	if (draft.customerIds.length === 0)
		return "Vui lòng chọn ít nhất một đơn vị.";
	if (!Number.isFinite(draft.value) || draft.value < 0)
		return "Mức chiết khấu không hợp lệ.";
	if (draft.calculationType === "percent" && draft.value > 100)
		return "Tỷ lệ chiết khấu không được vượt quá 100%.";
	if (draft.recipientAllocationsByCustomer) {
		for (const customerId of draft.customerIds) {
			const allocations =
				draft.recipientAllocationsByCustomer[customerId] ?? [];
			if (allocations.length === 0)
				return "Mỗi đơn vị cần ít nhất một người nhận chiết khấu.";
			if (
				allocations.some(
					(allocation) =>
						!Number.isFinite(allocation.amount) || allocation.amount <= 0,
				)
			)
				return "Số tiền của người nhận phải lớn hơn 0.";
			if (
				allocations.some((allocation) => {
					const retained = allocation.retainedAmount ?? 0;
					return (
						!Number.isFinite(retained) ||
						retained < 0 ||
						retained > allocation.amount
					);
				})
			)
				return "Chi phí giữ lại của mỗi người không được lớn hơn mức chính sách của người đó.";
			if (
				new Set(allocations.map((allocation) => allocation.recipientId))
					.size !== allocations.length
			)
				return "Người nhận chiết khấu bị trùng.";
		}
	}
	if (draft.effectiveTo && draft.effectiveTo < draft.effectiveFrom)
		return "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.";

	const conflict = catalog.policies.find(
		(policy) =>
			policy.id !== excludedPolicyId &&
			policy.status === "active" &&
			draft.customerIds.includes(policy.customerId) &&
			policy.productId === draft.productId &&
			rangesOverlap(
				policy.effectiveFrom,
				policy.effectiveTo,
				draft.effectiveFrom,
				draft.effectiveTo,
			),
	);
	if (conflict)
		return "Khoảng hiệu lực bị trùng với một chính sách đang áp dụng của đơn vị đã chọn.";
	return undefined;
}

export function addPolicies(
	catalog: ProductCatalog,
	draft: PolicyDraft,
): ProductCatalog {
	const error = validatePolicyDraft(catalog, draft);
	if (error) throw new Error(error);
	const now = new Date().toISOString();
	const additions = draft.customerIds.map((customerId) => {
		const recipientAllocations =
			draft.recipientAllocationsByCustomer?.[customerId] ?? [];
		const directValue = recipientAllocations.length
			? recipientAllocations.reduce(
					(sum, allocation) => sum + allocation.amount,
					0,
				)
			: draft.value;
		return {
			id: createId("POL"),
			productId: draft.productId,
			customerId,
			recipientAllocations,
			calculationType: recipientAllocations.length
				? ("fixed" as const)
				: draft.calculationType,
			value: directValue,
			effectiveFrom: draft.effectiveFrom,
			effectiveTo: draft.effectiveTo,
			status: "active" as const,
			note: draft.note.trim(),
			createdAt: now,
			updatedAt: now,
		};
	});
	return { ...catalog, policies: [...catalog.policies, ...additions] };
}

export function togglePolicy(
	catalog: ProductCatalog,
	policyId: string,
): ProductCatalog {
	const now = new Date().toISOString();
	const current = catalog.policies.find((policy) => policy.id === policyId);
	if (!current) throw new Error("Không tìm thấy chính sách.");
	if (current.status === "paused") {
		const error = validatePolicyDraft(
			catalog,
			{
				productId: current.productId,
				customerIds: [current.customerId],
				calculationType: current.calculationType,
				recipientAllocationsByCustomer: {
					[current.customerId]: current.recipientAllocations,
				},
				value: current.value,
				effectiveFrom: current.effectiveFrom,
				effectiveTo: current.effectiveTo,
				note: current.note,
			},
			current.id,
		);
		if (error) throw new Error(`Không thể bật lại. ${error}`);
	}
	return {
		...catalog,
		policies: catalog.policies.map((policy) =>
			policy.id === policyId
				? {
						...policy,
						status: policy.status === "active" ? "paused" : "active",
						updatedAt: now,
					}
				: policy,
		),
	};
}

export function replacePolicyVersion(
	catalog: ProductCatalog,
	policyId: string,
	draft: PolicyDraft,
): ProductCatalog {
	const previous = catalog.policies.find((policy) => policy.id === policyId);
	if (!previous) throw new Error("Không tìm thấy chính sách cần thay đổi.");
	if (
		draft.customerIds.length !== 1 ||
		draft.customerIds[0] !== previous.customerId ||
		draft.productId !== previous.productId
	) {
		throw new Error(
			"Phiên bản mới phải thuộc đúng sản phẩm và đơn vị của chính sách cũ.",
		);
	}
	const now = new Date().toISOString();
	const closedPolicies = catalog.policies.map((policy) => {
		if (policy.id !== policyId) return policy;
		if (draft.effectiveFrom <= policy.effectiveFrom)
			return { ...policy, status: "paused" as const, updatedAt: now };
		return {
			...policy,
			effectiveTo: previousDay(draft.effectiveFrom),
			updatedAt: now,
		};
	});
	const closedCatalog = { ...catalog, policies: closedPolicies };
	const error = validatePolicyDraft(closedCatalog, draft);
	if (error) throw new Error(error);
	return addPolicies(closedCatalog, draft);
}

export function resolvePolicy(
	catalog: ProductCatalog,
	product: Product,
	customerId: string,
	date: string,
): PolicyResolution | undefined {
	const policy = catalog.policies
		.filter(
			(item) =>
				item.productId === product.id &&
				item.customerId === customerId &&
				item.status === "active" &&
				item.effectiveFrom <= date &&
				(!item.effectiveTo || item.effectiveTo >= date),
		)
		.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
	if (!policy) return undefined;
	return { policy, discountPerUnit: netPolicyValue(policy) };
}

export function netPolicyValue(policy: CustomerProductPolicy): number {
	return Math.max(0, policy.value - policyRetainedValue(policy));
}

export function policyRetainedValue(policy: CustomerProductPolicy): number {
	const individualTotal = policy.recipientAllocations.reduce(
		(sum, allocation) => sum + (allocation.retainedAmount ?? 0),
		0,
	);
	return individualTotal || policy.retainedAmount || 0;
}

export function netAllocationValue(
	allocation: PolicyRecipientAllocation,
): number {
	return Math.max(0, allocation.amount - (allocation.retainedAmount ?? 0));
}

export function findProductByExternalCode(
	catalog: ProductCatalog,
	externalCode: string,
): Product | undefined {
	const normalized = externalCode.trim().toLocaleUpperCase("vi-VN");
	return catalog.products.find((product) => {
		const code = product.code.toLocaleUpperCase("vi-VN");
		return code === normalized || code.replace(/^SP-/, "") === normalized;
	});
}

export function removeProduct(
	catalog: ProductCatalog,
	productId: string,
): ProductCatalog {
	const product = catalog.products.find((item) => item.id === productId);
	if (!product) throw new Error("Không tìm thấy sản phẩm cần xóa.");
	return {
		...catalog,
		products: catalog.products.filter((item) => item.id !== productId),
		policies: catalog.policies.filter(
			(policy) => policy.productId !== productId,
		),
	};
}

export function removePolicy(
	catalog: ProductCatalog,
	policyId: string,
): ProductCatalog {
	if (!catalog.policies.some((policy) => policy.id === policyId))
		throw new Error("Không tìm thấy chính sách cần xóa.");
	return {
		...catalog,
		policies: catalog.policies.filter((policy) => policy.id !== policyId),
	};
}
