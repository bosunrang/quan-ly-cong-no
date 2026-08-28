import { readCustomers } from "../customers/customer.repository";
import {
	findProductByExternalCode,
	policyRetainedValue,
	resolvePolicy,
} from "../products/product-policy.service";
import { readProductCatalog } from "../products/product.repository";
import { normalizeDateOnly } from "../../shared/lib/date";
import {
	readVersionedLocalStorage,
	writeVersionedLocalStorage,
} from "../../shared/storage/localStorage";
import { isOrderRecordList, type OrderRecord } from "./order.model";
import { seedOrderRecords } from "./order.seed";

const STORAGE_KEY = "mkt-cost.orders.v3";
const LEGACY_STORAGE_KEY_V2 = "mkt-cost.orders.v2";
const LEGACY_STORAGE_KEY_V1 = "mkt-cost.orders.v1";
const STORAGE_VERSION = 3;

const cloneSeed = () => structuredClone(seedOrderRecords);

function unwrap(value: unknown): unknown {
	return value &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		"data" in value
		? (value as { data: unknown }).data
		: value;
}

function migrateOrders(value: unknown): OrderRecord[] | undefined {
	const source = unwrap(value);
	if (!Array.isArray(source)) return undefined;
	const catalog = readProductCatalog();
	const customers = readCustomers();
	const capturedAt = new Date().toISOString();
	const migrated = source.map((item) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) return item;
		const row = item as Record<string, unknown>;
		const date =
			typeof row.date === "string" ? normalizeDateOnly(row.date) : undefined;
		const customer =
			typeof row.customerCode === "string"
				? customers.find(
						(entry) =>
							entry.misaCode.toLocaleLowerCase("vi-VN") ===
							row.customerCode?.toString().toLocaleLowerCase("vi-VN"),
					)
				: undefined;
		const product =
			typeof row.product === "string"
				? findProductByExternalCode(catalog, row.product)
				: undefined;
		const resolution =
			product && customer && date
				? resolvePolicy(catalog, product, customer.id, date)
				: undefined;
		return {
			...row,
			date,
			policySnapshot: resolution
				? {
						policyId: resolution.policy.id,
						productId: resolution.policy.productId,
						customerId: resolution.policy.customerId,
						calculationType: resolution.policy.calculationType,
						value: resolution.policy.value,
						retainedAmount: policyRetainedValue(resolution.policy),
						discountPerUnit: resolution.discountPerUnit,
						recipientAllocations: structuredClone(
							resolution.policy.recipientAllocations,
						),
						capturedAt,
					}
				: null,
		};
	});
	return isOrderRecordList(migrated) ? migrated : undefined;
}

export function readOrderRecords(): OrderRecord[] {
	return readVersionedLocalStorage({
		key: STORAGE_KEY,
		label: "đơn hàng",
		version: STORAGE_VERSION,
		fallback: cloneSeed,
		isValid: isOrderRecordList,
		legacy: [
			{ key: LEGACY_STORAGE_KEY_V2, migrate: migrateOrders },
			{ key: LEGACY_STORAGE_KEY_V1, migrate: migrateOrders },
		],
	});
}

export function writeOrderRecords(records: OrderRecord[]): boolean {
	return writeVersionedLocalStorage(
		STORAGE_KEY,
		STORAGE_VERSION,
		records,
		"dữ liệu đơn hàng",
	);
}
