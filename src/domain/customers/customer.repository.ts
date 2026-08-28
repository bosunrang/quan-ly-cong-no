import { isCustomerList, type Customer } from "./customer.model";
import { seedCustomers } from "./customer.seed";
import {
	readVersionedLocalStorage,
	writeVersionedLocalStorage,
} from "../../shared/storage/localStorage";

const STORAGE_KEY = "mkt-cost.customers.v2";
const STORAGE_VERSION = 2;
const LEGACY_STORAGE_KEY = "mkt-cost.customers.v1";

function cloneSeed(): Customer[] {
	return structuredClone(seedCustomers);
}

export function readCustomers(): Customer[] {
	return readVersionedLocalStorage({
		key: STORAGE_KEY,
		label: "khách hàng",
		version: STORAGE_VERSION,
		fallback: cloneSeed,
		isValid: isCustomerList,
		legacy: [
			{
				key: LEGACY_STORAGE_KEY,
				migrate: (value) => (isCustomerList(value) ? value : undefined),
			},
		],
	});
}

export function writeCustomers(customers: Customer[]): boolean {
	return writeVersionedLocalStorage(
		STORAGE_KEY,
		STORAGE_VERSION,
		customers,
		"dữ liệu khách hàng",
	);
}
