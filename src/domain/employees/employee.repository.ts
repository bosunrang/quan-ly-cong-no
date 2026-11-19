import { isSalesEmployeeList, type SalesEmployee } from "./employee.model";
import { readAccounts } from "../access/accounts.repository";
import {
	readVersionedLocalStorage,
	reportStorageIssue,
	writeVersionedLocalStorage,
} from "../../shared/storage/localStorage";
import { getDatabaseBridge } from "../../shared/storage/databaseBridge";
import { lanEndpoint } from "../../shared/storage/lanStorage";

export const EMPLOYEE_STORAGE_KEY = "cong-no.sales-employees.v2";
const STORAGE_VERSION = 2;

export function readSalesEmployees(): SalesEmployee[] {
	return readVersionedLocalStorage({
		key: EMPLOYEE_STORAGE_KEY,
		label: "nhân viên",
		version: STORAGE_VERSION,
		fallback: () => [],
		isValid: isSalesEmployeeList,
	});
}

export function writeSalesEmployees(employees: SalesEmployee[]): boolean {
	if (!lanEndpoint() && !getDatabaseBridge()) {
		const links = employees
			.map((employee) => employee.linkedAccountId)
			.filter((id) => id !== undefined);
		if (links.length) {
			let accountIds: Set<string>;
			try {
				accountIds = new Set(readAccounts().map(({ id }) => id));
			} catch (error) {
				reportStorageIssue("Không thể kiểm tra tài khoản liên kết.", error);
				return false;
			}
			if (links.some((id) => !accountIds.has(id))) {
				reportStorageIssue("Tài khoản liên kết không còn tồn tại.");
				return false;
			}
			if (new Set(links).size !== links.length) {
				reportStorageIssue("Tài khoản này đã liên kết với nhân viên khác.");
				return false;
			}
		}
	}
	return writeVersionedLocalStorage(
		EMPLOYEE_STORAGE_KEY,
		STORAGE_VERSION,
		employees,
		"dữ liệu nhân viên",
	);
}
