import type {
	Customer,
	DiscountRecipient,
	SalesAssignment,
} from "./customer.model";

export function currentAssignment(
	customer: Customer,
): SalesAssignment | undefined {
	return customer.assignments.find((assignment) => !assignment.effectiveTo);
}

export function currentRecipient(
	customer: Customer,
): DiscountRecipient | undefined {
	return (
		customer.recipients.find(
			(recipient) =>
				recipient.active && recipient.isPrimary && !recipient.effectiveTo,
		) ??
		customer.recipients.find(
			(recipient) => recipient.active && !recipient.effectiveTo,
		)
	);
}
