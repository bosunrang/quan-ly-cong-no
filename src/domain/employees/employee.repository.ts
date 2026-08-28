import { isSalesEmployeeList, type SalesEmployee } from "./employee.model";
import { seedSalesEmployees } from "./employee.seed";
import {
	readVersionedLocalStorage,
	writeVersionedLocalStorage,
} from "../../shared/storage/localStorage";

const STORAGE_KEY = "mkt-cost.sales-employees.v2";
const STORAGE_VERSION = 2;
const LEGACY_STORAGE_KEY = "mkt-cost.sales-employees.v1";

function cloneSeed(): SalesEmployee[] {
	return structuredClone(seedSalesEmployees);
}

export function readSalesEmployees(): SalesEmployee[] {
	return readVersionedLocalStorage({
		key: STORAGE_KEY,
		label: "nhân viên kinh doanh",
		version: STORAGE_VERSION,
		fallback: cloneSeed,
		isValid: isSalesEmployeeList,
		legacy: [
			{
				key: LEGACY_STORAGE_KEY,
				migrate: (value) => (isSalesEmployeeList(value) ? value : undefined),
			},
		],
	});
}

export function writeSalesEmployees(employees: SalesEmployee[]): boolean {
	return writeVersionedLocalStorage(
		STORAGE_KEY,
		STORAGE_VERSION,
		employees,
		"dữ liệu nhân viên",
	);
}
