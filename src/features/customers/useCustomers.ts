import { useState } from "react";
import type {
	Customer,
	CustomerDraft,
	CustomerImportDraft,
} from "../../domain/customers/customer.model";
import {
	readCustomers,
	writeCustomers,
} from "../../domain/customers/customer.repository";
import {
	createCustomerFromDraft,
	createCustomerFromImport,
	updateCustomerFromDraft,
} from "../../domain/customers/customer.service";
import { readSalesEmployees } from "../../domain/employees/employee.repository";
import { customerLedgerLock } from "../../domain/payments/receipt-ledger";
import { readReceiptLedger } from "../../domain/payments/receipt-ledger.repository";
import { recordActivity } from "../../shared/storage/activityLog";

export function useCustomers() {
	const [customers, setCustomers] = useState<Customer[]>(readCustomers);
	const [salesEmployees] = useState(readSalesEmployees);

	const persist = (next: Customer[]) => {
		if (!writeCustomers(next)) return false;
		setCustomers(next);
		return true;
	};
	// Khoản thu và phân bổ gắn với id và mã MISA của khách hàng, nên không được
	// xóa hoặc đổi mã khi sổ đối soát đã có chứng từ thu của khách hàng đó.
	const ledgerLock = async (customerId: string) =>
		customerLedgerLock(await readReceiptLedger(), customerId);

	return {
		customers,
		salesEmployees,
		async saveCustomer(draft: CustomerDraft, customerId?: string) {
			const current = customers.find((customer) => customer.id === customerId);
			if (
				current &&
				current.misaCode.trim().normalize("NFC").toUpperCase() !==
					draft.misaCode.trim().normalize("NFC").toUpperCase()
			) {
				const lock = await ledgerLock(current.id);
				if (lock)
					throw new Error(
						`${lock} Không thể đổi mã MISA vì khoản thu đang gắn với mã ${current.misaCode}.`,
					);
			}
			const saved = persist(
				customerId
					? customers.map((customer) =>
							customer.id === customerId
								? updateCustomerFromDraft(customer, draft)
								: customer,
						)
					: [createCustomerFromDraft(draft), ...customers],
			);
			if (saved)
				void recordActivity(
					"data",
					customerId ? "Cập nhật khách hàng" : "Thêm khách hàng",
					`${draft.misaCode} · ${draft.name}`,
				);
			return saved;
		},
		importCustomers(drafts: CustomerImportDraft[]) {
			const additions = drafts.map(createCustomerFromImport);
			const saved = persist([...additions, ...customers]);
			if (saved)
				void recordActivity(
					"data",
					"Nhập danh mục khách hàng",
					`${additions.length} khách hàng`,
				);
			return saved;
		},
		async deleteCustomer(customerId: string) {
			const target = customers.find((customer) => customer.id === customerId);
			if (!target) return false;
			const lock = await ledgerLock(target.id);
			if (lock)
				throw new Error(
					`${lock} Không thể xóa; hãy chuyển khách hàng sang trạng thái tạm dừng.`,
				);
			const saved = persist(
				customers.filter((customer) => customer.id !== customerId),
			);
			if (saved)
				void recordActivity(
					"data",
					"Xóa khách hàng",
					`${target.misaCode} · ${target.name}`,
				);
			return saved;
		},
	};
}
