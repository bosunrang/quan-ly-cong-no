import { customerImportFields } from "../../domain/customers/customer.service";
import type {
	Customer,
	CustomerDraft,
	CustomerImportDraft,
} from "../../domain/customers/customer.model";
import {
	addCustomer,
	importCustomerRecords,
	removeCustomer,
	updateCustomer,
} from "../../domain/customers/customer.repository";
import { readDirectory } from "../../domain/customers/directory.repository";
import { useAsyncData } from "../../shared/hooks/useAsyncData";
import { recordActivity } from "../../shared/storage/activityLog";

const empty = { customers: [], employees: [] };

export function useCustomers() {
	const { data, setData, loading, error } = useAsyncData(readDirectory);
	const { customers, employees: salesEmployees } = data ?? empty;

	function updateList(update: (current: Customer[]) => Customer[]) {
		setData(
			(current) =>
				current && { ...current, customers: update(current.customers) },
		);
	}
	return {
		customers,
		salesEmployees,
		loading,
		error,
		async saveCustomer(draft: CustomerDraft, current?: Customer) {
			const saved = current
				? await updateCustomer(current, draft)
				: await addCustomer(draft);
			updateList((list) =>
				current
					? list.map((item) => (item.id === saved.id ? saved : item))
					: [saved, ...list],
			);
			void recordActivity(
				"data",
				current ? "Cập nhật khách hàng" : "Thêm khách hàng",
				`${saved.misaCode} · ${saved.name}`,
			);
			return true;
		},
		async importCustomers(drafts: CustomerImportDraft[]) {
			const records = await importCustomerRecords(
				drafts.map(customerImportFields),
				"imports",
			);
			updateList((list) => [...records, ...list]);
			void recordActivity(
				"data",
				"Nhập danh mục khách hàng",
				`${records.length} khách hàng`,
			);
		},
		async deleteCustomer(target: Customer) {
			await removeCustomer(target);
			updateList((list) => list.filter((item) => item.id !== target.id));
			void recordActivity(
				"data",
				"Xóa khách hàng",
				`${target.misaCode} · ${target.name}`,
			);
			return true;
		},
	};
}
