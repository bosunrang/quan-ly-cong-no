import type {
	Customer,
	CustomerDraft,
	CustomerImportDraft,
} from "./customer.model";
import { createId } from "../../shared/lib/identity";

export function customerToDraft(customer?: Customer): CustomerDraft {
	return {
		misaCode: customer?.misaCode ?? "",
		name: customer?.name ?? "",
		group: customer?.group ?? "unknown",
		taxCode: customer?.taxCode ?? "",
		province: customer?.province ?? "",
		address: customer?.address ?? "",
		status: customer?.status ?? "active",
	};
}

export function createCustomerFromDraft(draft: CustomerDraft): Customer {
	const now = new Date().toISOString();
	return {
		id: createId("CUS"),
		misaCode: draft.misaCode.trim(),
		name: draft.name.trim(),
		group: draft.group,
		taxCode: draft.taxCode.trim(),
		province: draft.province,
		address: draft.address.trim(),
		status: draft.status,
		assignments: [],
		createdAt: now,
		updatedAt: now,
	};
}

export function createCustomerFromImport(draft: CustomerImportDraft): Customer {
	const now = new Date().toISOString();
	return {
		id: createId("CUS"),
		misaCode: draft.misaCode.trim(),
		name: draft.name.trim(),
		group: draft.group,
		taxCode: "",
		province: draft.province.trim(),
		address: draft.address.trim(),
		status: "active",
		assignments: [],
		createdAt: now,
		updatedAt: now,
	};
}

export function updateCustomerFromDraft(
	customer: Customer,
	draft: CustomerDraft,
): Customer {
	return {
		...customer,
		misaCode: draft.misaCode.trim(),
		name: draft.name.trim(),
		group: draft.group,
		taxCode: draft.taxCode.trim(),
		province: draft.province,
		address: draft.address.trim(),
		status: draft.status,
		assignments: customer.assignments,
		updatedAt: new Date().toISOString(),
	};
}

export function customerImportFields(
	draft: CustomerImportDraft,
): CustomerDraft {
	return { ...draft, taxCode: "", status: "active" };
}
