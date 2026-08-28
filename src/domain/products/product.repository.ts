import { readCustomers } from "../customers/customer.repository";
import { currentRecipient } from "../customers/customer.selectors";
import { normalizeDateOnly } from "../../shared/lib/date";
import { getDatabaseBridge } from "../../shared/storage/databaseBridge";
import {
	readVersionedLocalStorage,
	reportStorageIssue,
	writeVersionedLocalStorage,
} from "../../shared/storage/localStorage";
import {
	isLegacyProductPolicyList,
	isProduct,
	isProductCatalog,
	type LegacyProductPolicy,
	type Product,
	type ProductCatalog,
} from "./product.model";
import { seedProductCatalog } from "./product.seed";

const STORAGE_KEY = "mkt-cost.products.v7";
const STORAGE_VERSION = 7;
const CATALOG_LEGACY_KEYS = [
	"mkt-cost.products.v6",
	"mkt-cost.products.v5",
	"mkt-cost.products.v4",
	"mkt-cost.products.v3",
];
const cloneSeed = () => structuredClone(seedProductCatalog);

export interface ProductPageQuery {
	query: string;
	group: string;
	page: number;
	pageSize: number;
	today: string;
	soonDate: string;
	activeCustomerCount: number;
}

export interface ProductPageResult {
	products: Product[];
	coverageByProduct: Record<string, number>;
	groups: string[];
	filteredCount: number;
	totalCount: number;
	page: number;
	pageCount: number;
	firstVisible: number;
	lastVisible: number;
	summary: {
		activeProducts: number;
		currentPolicies: number;
		currentCustomers: number;
		missingAssignments: number;
		expiringSoon: number;
	};
}

function unwrap(value: unknown): unknown {
	return value &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		"data" in value
		? (value as { data: unknown }).data
		: value;
}

function migrateLegacy(value: unknown): ProductCatalog | undefined {
	const source = unwrap(value);
	if (!Array.isArray(source)) return undefined;
	const normalized = source.map((item) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) return item;
		const row = item as Record<string, unknown>;
		return {
			...row,
			effectiveFrom:
				typeof row.effectiveFrom === "string"
					? normalizeDateOnly(row.effectiveFrom)
					: undefined,
		};
	});
	if (!isLegacyProductPolicyList(normalized)) return undefined;
	const now = new Date().toISOString();
	const customers = readCustomers().filter(
		(customer) => customer.status === "active",
	);
	const products = normalized.map((row, index) => ({
		id: `PRD-${row.code.trim() || index + 1}`,
		code: row.code,
		name: row.name,
		group: row.group,
		unit: row.unit,
		status: row.active ? ("active" as const) : ("paused" as const),
		createdAt: now,
		updatedAt: now,
	}));
	const policies = normalized.flatMap(
		(row: LegacyProductPolicy, productIndex) =>
			customers.map((customer, customerIndex) => {
				const recipient = currentRecipient(customer);
				return {
					id: `POL-MIG-${productIndex + 1}-${customerIndex + 1}`,
					productId: products[productIndex].id,
					customerId: customer.id,
					recipientAllocations: recipient
						? [{ recipientId: recipient.id, amount: row.discount }]
						: [],
					calculationType: "fixed" as const,
					value: row.discount,
					effectiveFrom: row.effectiveFrom,
					effectiveTo: null,
					status: row.active ? ("active" as const) : ("paused" as const),
					note: "Chuyển đổi từ chính sách chung trước đây",
					createdAt: now,
					updatedAt: now,
				};
			}),
	);
	const migrated = { products, policies };
	return isProductCatalog(migrated) ? migrated : undefined;
}

function migrateCatalog(value: unknown): ProductCatalog | undefined {
	const source = unwrap(value);
	if (!source || typeof source !== "object" || Array.isArray(source))
		return undefined;
	const data = source as Record<string, unknown>;
	if (!Array.isArray(data.products) || !Array.isArray(data.policies))
		return undefined;
	const now = new Date().toISOString();
	const customers = new Map(
		readCustomers().map((customer) => [customer.id, customer]),
	);
	const rawProducts = new Map<string, Record<string, unknown>>();
	const canonicalIdByRawId = new Map<string, string>();
	const productByCode = new Map<string, Record<string, unknown>>();

	for (const item of data.products) {
		if (!item || typeof item !== "object" || Array.isArray(item)) continue;
		const product = item as Record<string, unknown>;
		if (typeof product.id !== "string" || typeof product.code !== "string")
			continue;
		rawProducts.set(product.id, product);
		const codeKey = product.code.trim().toLocaleUpperCase("vi-VN");
		if (!productByCode.has(codeKey) || product.customerGroup === undefined)
			productByCode.set(codeKey, product);
	}

	const products = [...productByCode.values()].map((product) => {
		const rawId = product.id as string;
		const canonicalId = rawId.replace(/-(STATE|PRIVATE)$/i, "");
		const codeKey = (product.code as string).trim().toLocaleUpperCase("vi-VN");
		for (const [sourceId, sourceProduct] of rawProducts) {
			if (
				typeof sourceProduct.code === "string" &&
				sourceProduct.code.trim().toLocaleUpperCase("vi-VN") === codeKey
			)
				canonicalIdByRawId.set(sourceId, canonicalId);
		}
		return {
			id: canonicalId,
			code: product.code as string,
			name: typeof product.name === "string" ? product.name : "",
			group: typeof product.group === "string" ? product.group : "",
			unit: typeof product.unit === "string" ? product.unit : "",
			status:
				product.status === "paused" ? ("paused" as const) : ("active" as const),
			createdAt:
				typeof product.createdAt === "string" ? product.createdAt : now,
			updatedAt:
				typeof product.updatedAt === "string" ? product.updatedAt : now,
		};
	});

	const policies = data.policies.map((item) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) return item;
		const policy = item as Record<string, unknown>;
		const rawProductId =
			typeof policy.productId === "string" ? policy.productId : "";
		const sourceProduct = rawProducts.get(rawProductId);
		const customer =
			typeof policy.customerId === "string"
				? customers.get(policy.customerId)
				: undefined;
		const legacyReferencePrice =
			typeof policy.referencePrice === "number"
				? policy.referencePrice
				: typeof sourceProduct?.referencePrice === "number"
					? sourceProduct.referencePrice
					: 0;
		const rawValue = typeof policy.value === "number" ? policy.value : 0;
		const amount =
			policy.calculationType === "percent"
				? Math.round((legacyReferencePrice * rawValue) / 100)
				: rawValue;
		const recipientId =
			typeof policy.recipientId === "string"
				? policy.recipientId
				: customer
					? currentRecipient(customer)?.id
					: undefined;
		const existingAllocations = Array.isArray(policy.recipientAllocations)
			? policy.recipientAllocations
			: undefined;
		const {
			referencePrice: _legacyPrice,
			recipientId: _legacyRecipientId,
			...basePolicy
		} = policy;
		return {
			...basePolicy,
			productId:
				canonicalIdByRawId.get(rawProductId) ??
				rawProductId.replace(/-(STATE|PRIVATE)$/i, ""),
			calculationType: "fixed",
			value: amount,
			recipientAllocations:
				existingAllocations ??
				(recipientId && amount > 0 ? [{ recipientId, amount }] : []),
		};
	});
	const migrated = { products, policies };
	return isProductCatalog(migrated) ? migrated : undefined;
}

export function readProductCatalog(): ProductCatalog {
	return readVersionedLocalStorage({
		key: STORAGE_KEY,
		label: "sản phẩm và chính sách theo đơn vị",
		version: STORAGE_VERSION,
		fallback: cloneSeed,
		isValid: isProductCatalog,
		legacy: [
			...CATALOG_LEGACY_KEYS.map((key) => ({ key, migrate: migrateCatalog })),
			{ key: "mkt-cost.products.v2", migrate: migrateLegacy },
			{ key: "mkt-cost.products.v1", migrate: migrateLegacy },
		],
	});
}

export function writeProductCatalog(catalog: ProductCatalog): boolean {
	return writeVersionedLocalStorage(
		STORAGE_KEY,
		STORAGE_VERSION,
		catalog,
		"dữ liệu sản phẩm và chính sách theo đơn vị",
	);
}

function isProductPageResult(value: unknown): value is ProductPageResult {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const row = value as Record<string, unknown>;
	const summary = row.summary;
	return (
		Array.isArray(row.products) &&
		row.products.every(isProduct) &&
		Array.isArray(row.groups) &&
		row.groups.every((item) => typeof item === "string") &&
		Boolean(row.coverageByProduct) &&
		typeof row.coverageByProduct === "object" &&
		[
			"filteredCount",
			"totalCount",
			"page",
			"pageCount",
			"firstVisible",
			"lastVisible",
		].every((key) => typeof row[key] === "number") &&
		Boolean(summary) &&
		typeof summary === "object"
	);
}

function queryInMemory(
	catalog: ProductCatalog,
	options: ProductPageQuery,
): ProductPageResult {
	const currentPolicies = catalog.policies.filter(
		(policy) =>
			policy.status === "active" &&
			policy.effectiveFrom <= options.today &&
			(!policy.effectiveTo || policy.effectiveTo >= options.today),
	);
	const coverage = new Map<string, Set<string>>();
	for (const policy of currentPolicies) {
		const customerIds = coverage.get(policy.productId) ?? new Set<string>();
		customerIds.add(policy.customerId);
		coverage.set(policy.productId, customerIds);
	}
	const normalizedQuery = options.query.trim().toLocaleLowerCase("vi-VN");
	const filtered = catalog.products.filter(
		(product) =>
			`${product.code} ${product.name}`
				.toLocaleLowerCase("vi-VN")
				.includes(normalizedQuery) &&
			(options.group === "all" || product.group === options.group),
	);
	const pageCount = Math.max(1, Math.ceil(filtered.length / options.pageSize));
	const page = Math.min(Math.max(1, options.page), pageCount);
	const offset = (page - 1) * options.pageSize;
	const products = filtered.slice(offset, offset + options.pageSize);
	const activeProducts = catalog.products.filter(
		(product) => product.status === "active",
	);
	return {
		products,
		coverageByProduct: Object.fromEntries(
			products.map((product) => [
				product.id,
				coverage.get(product.id)?.size ?? 0,
			]),
		),
		groups: [
			...new Set(
				catalog.products.map((product) => product.group).filter(Boolean),
			),
		].sort((a, b) => a.localeCompare(b, "vi")),
		filteredCount: filtered.length,
		totalCount: catalog.products.length,
		page,
		pageCount,
		firstVisible: filtered.length === 0 ? 0 : offset + 1,
		lastVisible: Math.min(offset + options.pageSize, filtered.length),
		summary: {
			activeProducts: activeProducts.length,
			currentPolicies: currentPolicies.length,
			currentCustomers: new Set(
				currentPolicies.map((policy) => policy.customerId),
			).size,
			missingAssignments: activeProducts.reduce(
				(sum, product) =>
					sum +
					Math.max(
						0,
						options.activeCustomerCount - (coverage.get(product.id)?.size ?? 0),
					),
				0,
			),
			expiringSoon: currentPolicies.filter(
				(policy) =>
					policy.effectiveTo &&
					policy.effectiveTo >= options.today &&
					policy.effectiveTo <= options.soonDate,
			).length,
		},
	};
}

export function queryProductCatalogPage(
	options: ProductPageQuery,
): ProductPageResult {
	const bridge = getDatabaseBridge();
	if (bridge) {
		let response = bridge.queryProducts(options);
		const firstValue =
			response.ok && response.value && typeof response.value === "object"
				? (response.value as Record<string, unknown>)
				: undefined;
		if (firstValue?.initialized === false) {
			readProductCatalog();
			response = bridge.queryProducts(options);
		}
		if (response.ok && isProductPageResult(response.value))
			return response.value;
		reportStorageIssue(
			"Không thể phân trang sản phẩm bằng SQLite. App đang dùng bản dự phòng trên trình duyệt.",
			response.error,
		);
	}
	return queryInMemory(readProductCatalog(), options);
}

export function readProductCatalogDetail(
	productId: string,
): ProductCatalog | undefined {
	const bridge = getDatabaseBridge();
	if (bridge) {
		const response = bridge.readProductDetail(productId);
		if (response.ok && response.value === null) return undefined;
		if (response.ok && isProductCatalog(response.value)) return response.value;
		reportStorageIssue(
			"Không thể đọc chi tiết sản phẩm từ SQLite. App đang dùng bản dự phòng trên trình duyệt.",
			response.error,
		);
	}
	const catalog = readProductCatalog();
	const product = catalog.products.find((item) => item.id === productId);
	return product
		? {
				products: [product],
				policies: catalog.policies.filter(
					(policy) => policy.productId === productId,
				),
			}
		: undefined;
}
