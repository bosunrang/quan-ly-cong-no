import { useCallback, useState } from "react";
import type {
	Customer,
	CustomerDraft,
	CustomerImportDraft,
	RecipientDraft,
} from "../../domain/customers/customer.model";
import {
	createCustomerFromDraft,
	createCustomerFromImport,
	saveRecipientToCustomer,
	updateCustomerFromDraft,
} from "../../domain/customers/customer.service";
import {
	readCustomers,
	writeCustomers,
} from "../../domain/customers/customer.repository";
import { readSalesEmployees } from "../../domain/employees/employee.repository";

export function useCustomers() {
	const [customers, setCustomers] = useState<Customer[]>(readCustomers);
	const [salesEmployees] = useState(readSalesEmployees);

	const save = useCallback(
		(draft: CustomerDraft, customerId?: string) => {
			const existing = customerId
				? customers.find((item) => item.id === customerId)
				: undefined;
			const next = existing
				? customers.map((item) =>
						item.id === customerId
							? updateCustomerFromDraft(item, draft)
							: item,
					)
				: [createCustomerFromDraft(draft), ...customers];
			if (!writeCustomers(next)) return false;
			setCustomers(next);
			return true;
		},
		[customers],
	);

	const saveRecipient = useCallback(
		(customerId: string, draft: RecipientDraft, recipientId?: string) => {
			const next = customers.map((customer) =>
				customer.id === customerId
					? saveRecipientToCustomer(customer, draft, recipientId)
					: customer,
			);
			if (!writeCustomers(next)) return false;
			setCustomers(next);
			return true;
		},
		[customers],
	);

	const remove = useCallback(
		(customerId: string) => {
			const next = customers.filter((customer) => customer.id !== customerId);
			if (!writeCustomers(next)) return false;
			setCustomers(next);
			return true;
		},
		[customers],
	);

	const importCustomers = useCallback(
		(drafts: CustomerImportDraft[]) => {
			const existingCodes = new Set(
				customers.map((customer) =>
					customer.misaCode.trim().toLocaleLowerCase("vi-VN"),
				),
			);
			const additions = drafts
				.filter(
					(draft) =>
						!existingCodes.has(
							draft.misaCode.trim().toLocaleLowerCase("vi-VN"),
						),
				)
				.map(createCustomerFromImport);
			const next = [...additions, ...customers];
			if (!writeCustomers(next)) return false;
			setCustomers(next);
			return true;
		},
		[customers],
	);

	return {
		customers,
		salesEmployees,
		saveCustomer: save,
		saveRecipient,
		importCustomers,
		deleteCustomer: remove,
	};
}
