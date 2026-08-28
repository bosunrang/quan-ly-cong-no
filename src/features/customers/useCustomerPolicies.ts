import { useState } from "react";
import {
	addPolicies,
	removePolicy,
	replacePolicyVersion,
	togglePolicy,
	type PolicyDraft,
} from "../../domain/products/product-policy.service";
import type { ProductCatalog } from "../../domain/products/product.model";
import {
	readProductCatalog,
	writeProductCatalog,
} from "../../domain/products/product.repository";

export function useCustomerPolicies() {
	const [catalog, setCatalog] = useState<ProductCatalog>(readProductCatalog);

	const commit = (next: ProductCatalog) => {
		if (!writeProductCatalog(next))
			throw new Error("Không thể lưu chính sách chiết khấu.");
		setCatalog(next);
	};

	const savePolicy = (draft: PolicyDraft, policyId?: string) => {
		const source = readProductCatalog();
		commit(
			policyId
				? replacePolicyVersion(source, policyId, draft)
				: addPolicies(source, draft),
		);
	};

	const changePolicyStatus = (policyId: string) => {
		commit(togglePolicy(readProductCatalog(), policyId));
	};

	const deletePolicy = (policyId: string) => {
		commit(removePolicy(readProductCatalog(), policyId));
	};

	return { catalog, savePolicy, changePolicyStatus, deletePolicy };
}
