import { useCallback, useMemo, useState } from "react";
import { readCustomers } from "../../domain/customers/customer.repository";
import {
	addPolicies,
	removePolicy,
	removeProduct,
	replacePolicyVersion,
	togglePolicy,
	type PolicyDraft,
} from "../../domain/products/product-policy.service";
import type {
	Product,
	ProductCatalog,
} from "../../domain/products/product.model";
import {
	readProductCatalog,
	readProductCatalogDetail,
	writeProductCatalog,
} from "../../domain/products/product.repository";
import { createId } from "../../shared/lib/identity";
import { getDatabaseBridge } from "../../shared/storage/databaseBridge";
import type { ProductImportDraft } from "./product.import";

export interface ProductDraft {
	code: string;
	name: string;
	group: string;
	unit: string;
	status: Product["status"];
}

export function useProductCatalog() {
	const sqliteMode = Boolean(getDatabaseBridge());
	const [catalog, setCatalog] = useState<ProductCatalog>(() =>
		sqliteMode ? { products: [], policies: [] } : readProductCatalog(),
	);
	const [revision, setRevision] = useState(0);
	const customers = useMemo(() => readCustomers(), []);
	const currentCatalog = useCallback(
		() => (sqliteMode ? readProductCatalog() : catalog),
		[catalog, sqliteMode],
	);

	const commit = (next: ProductCatalog) => {
		if (!writeProductCatalog(next)) return;
		if (!sqliteMode) setCatalog(next);
		setRevision((value) => value + 1);
	};

	const saveProduct = (draft: ProductDraft, productId?: string) => {
		const source = currentCatalog();
		const code = draft.code.trim().toLocaleUpperCase("vi-VN");
		if (!code || !draft.name.trim())
			throw new Error("Mã và tên sản phẩm là bắt buộc.");
		if (
			source.products.some(
				(item) =>
					item.id !== productId &&
					item.code.toLocaleUpperCase("vi-VN") === code,
			)
		) {
			throw new Error("Mã sản phẩm đã tồn tại.");
		}
		const now = new Date().toISOString();
		const existing = productId
			? source.products.find((item) => item.id === productId)
			: undefined;
		if (productId && !existing)
			throw new Error("Không tìm thấy sản phẩm cần cập nhật.");
		const nextProduct: Product = existing
			? {
					...existing,
					...draft,
					code,
					name: draft.name.trim(),
					group: draft.group.trim(),
					unit: draft.unit.trim(),
					updatedAt: now,
				}
			: {
					id: createId("PRD"),
					...draft,
					code,
					name: draft.name.trim(),
					group: draft.group.trim(),
					unit: draft.unit.trim(),
					createdAt: now,
					updatedAt: now,
				};
		const products = productId
			? source.products.map((item) =>
					item.id === productId ? nextProduct : item,
				)
			: [...source.products, nextProduct];
		commit({ ...source, products });
		return nextProduct.id;
	};

	const savePolicies = (draft: PolicyDraft) => {
		const next = addPolicies(currentCatalog(), draft);
		commit(next);
	};

	const changePolicy = (policyId: string, draft: PolicyDraft) =>
		commit(replacePolicyVersion(currentCatalog(), policyId, draft));

	const importProducts = (drafts: ProductImportDraft[]) => {
		const source = currentCatalog();
		const now = new Date().toISOString();
		const byCode = new Map(
			source.products.map((product) => [
				product.code.toLocaleUpperCase("vi-VN"),
				product,
			]),
		);
		for (const draft of drafts) {
			const existing = byCode.get(draft.code);
			const next: Product = existing
				? {
						...existing,
						name: draft.name.trim(),
						unit: draft.unit.trim(),
						group: draft.group.trim(),
						updatedAt: now,
					}
				: {
						id: createId("PRD"),
						code: draft.code,
						name: draft.name.trim(),
						unit: draft.unit.trim(),
						group: draft.group.trim(),
						status: "active",
						createdAt: now,
						updatedAt: now,
					};
			byCode.set(draft.code, next);
		}
		commit({ ...source, products: [...byCode.values()] });
	};

	const changePolicyStatus = (policyId: string) =>
		commit(togglePolicy(currentCatalog(), policyId));

	const deleteProduct = (productId: string) =>
		commit(removeProduct(currentCatalog(), productId));
	const deletePolicy = (policyId: string) =>
		commit(removePolicy(currentCatalog(), policyId));

	return {
		catalog,
		revision,
		customers,
		loadCatalog: currentCatalog,
		loadProductDetail: readProductCatalogDetail,
		saveProduct,
		savePolicies,
		importProducts,
		changePolicy,
		changePolicyStatus,
		deletePolicy,
		deleteProduct,
	};
}
