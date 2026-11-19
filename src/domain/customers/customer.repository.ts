import { isCustomerList, type Customer } from "./customer.model";
import {
	readVersionedLocalStorage,
	writeVersionedLocalStorage,
} from "../../shared/storage/localStorage";

export const CUSTOMER_STORAGE_KEY = "cong-no.customers.v2";
const STORAGE_VERSION = 2;

export function readCustomers(): Customer[] {
	return readVersionedLocalStorage({
		key: CUSTOMER_STORAGE_KEY,
		label: "khách hàng",
		version: STORAGE_VERSION,
		// Kho mới bắt đầu trống: dữ liệu mẫu không được lẫn vào sổ công nợ thật.
		fallback: () => [],
		isValid: isCustomerList,
	});
}

export function writeCustomers(customers: Customer[]): boolean {
	return writeVersionedLocalStorage(
		CUSTOMER_STORAGE_KEY,
		STORAGE_VERSION,
		customers,
		"dữ liệu khách hàng",
	);
}
