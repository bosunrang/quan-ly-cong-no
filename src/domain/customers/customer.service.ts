import type {
	Customer,
	CustomerDraft,
	CustomerImportDraft,
	RecipientDraft,
} from "./customer.model";
import { currentRecipient } from "./customer.selectors";
import { previousDay, todayLocal } from "../../shared/lib/date";
import { createId } from "../../shared/lib/identity";

export function customerToDraft(customer?: Customer): CustomerDraft {
	const recipient = customer ? currentRecipient(customer) : undefined;
	const today = todayLocal();
	return {
		misaCode: customer?.misaCode ?? "",
		name: customer?.name ?? "",
		group: customer?.group ?? "state",
		taxCode: customer?.taxCode ?? "",
		province: customer?.province ?? "",
		address: customer?.address ?? "",
		status: customer?.status ?? "active",
		recipientName: recipient?.fullName ?? "",
		recipientPosition: recipient?.position ?? "",
		recipientPhone: recipient?.phone ?? "",
		recipientFrom: recipient?.effectiveFrom ?? today,
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
		recipients: draft.recipientName.trim()
			? [
					{
						id: createId("RCP"),
						fullName: draft.recipientName.trim(),
						position: draft.recipientPosition.trim(),
						phone: draft.recipientPhone.trim(),
						effectiveFrom: draft.recipientFrom,
						effectiveTo: null,
						isPrimary: true,
						active: true,
					},
				]
			: [],
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
		recipients: [],
		createdAt: now,
		updatedAt: now,
	};
}

export function recipientTransitionError(
	customer: Customer,
	draft: CustomerDraft,
): string | undefined {
	const activeRecipient = currentRecipient(customer);
	if (!activeRecipient) return undefined;
	const recipientChanged =
		activeRecipient.fullName !== draft.recipientName.trim() ||
		activeRecipient.position !== draft.recipientPosition.trim() ||
		activeRecipient.phone !== draft.recipientPhone.trim();
	if (recipientChanged && draft.recipientFrom <= activeRecipient.effectiveFrom)
		return `Ngày hiệu lực người nhận mới phải sau ngày ${activeRecipient.effectiveFrom}, là ngày người nhận hiện tại bắt đầu.`;
	return undefined;
}

export function updateCustomerFromDraft(
	customer: Customer,
	draft: CustomerDraft,
): Customer {
	const recipients = [...customer.recipients];
	const activeRecipient = currentRecipient(customer);
	const recipientChanged =
		(activeRecipient?.fullName ?? "") !== draft.recipientName.trim() ||
		(activeRecipient?.position ?? "") !== draft.recipientPosition.trim() ||
		(activeRecipient?.phone ?? "") !== draft.recipientPhone.trim();
	const canTransitionRecipient =
		!activeRecipient || draft.recipientFrom > activeRecipient.effectiveFrom;
	if (recipientChanged && canTransitionRecipient) {
		const recipientIndex = recipients.findIndex(
			(item) => item.id === activeRecipient?.id,
		);
		if (recipientIndex >= 0)
			recipients[recipientIndex] = {
				...recipients[recipientIndex],
				active: false,
				effectiveTo: previousDay(draft.recipientFrom),
			};
		if (draft.recipientName.trim())
			recipients.push({
				id: createId("RCP"),
				fullName: draft.recipientName.trim(),
				position: draft.recipientPosition.trim(),
				phone: draft.recipientPhone.trim(),
				effectiveFrom: draft.recipientFrom,
				effectiveTo: null,
				isPrimary: true,
				active: true,
			});
	}

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
		recipients,
		updatedAt: new Date().toISOString(),
	};
}

export function saveRecipientToCustomer(
	customer: Customer,
	draft: RecipientDraft,
	recipientId?: string,
): Customer {
	const activeRecipients = customer.recipients.filter((item) => item.active);
	const shouldBePrimary = draft.isPrimary || activeRecipients.length === 0;
	let recipients = customer.recipients.map((item) =>
		shouldBePrimary ? { ...item, isPrimary: false } : item,
	);
	const existing = recipientId
		? recipients.find((item) => item.id === recipientId)
		: undefined;

	if (existing) {
		recipients = recipients.map((item) =>
			item.id === recipientId
				? {
						...item,
						fullName: draft.fullName.trim(),
						position: draft.position.trim(),
						phone: draft.phone.trim(),
						effectiveFrom: draft.effectiveFrom,
						isPrimary: shouldBePrimary,
						active: true,
						effectiveTo: null,
					}
				: item,
		);
	} else {
		recipients.push({
			id: createId("RCP"),
			fullName: draft.fullName.trim(),
			position: draft.position.trim(),
			phone: draft.phone.trim(),
			effectiveFrom: draft.effectiveFrom,
			effectiveTo: null,
			isPrimary: shouldBePrimary,
			active: true,
		});
	}

	if (!recipients.some((item) => item.active && item.isPrimary)) {
		const fallbackIndex = recipients.findIndex((item) => item.active);
		if (fallbackIndex >= 0)
			recipients[fallbackIndex] = {
				...recipients[fallbackIndex],
				isPrimary: true,
			};
	}

	return { ...customer, recipients, updatedAt: new Date().toISOString() };
}
