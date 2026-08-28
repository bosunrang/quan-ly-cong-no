import { isIsoDate, isIsoTimestamp } from "../../shared/lib/date";

export type CustomerGroup = "state" | "private";
export type CustomerStatus = "active" | "paused";

export interface SalesAssignment {
	id: string;
	employeeId: string;
	employeeName: string;
	province: string;
	source: "direct";
	effectiveFrom: string;
	effectiveTo: string | null;
}

export interface DiscountRecipient {
	id: string;
	fullName: string;
	position: string;
	phone: string;
	effectiveFrom: string;
	effectiveTo: string | null;
	isPrimary: boolean;
	active: boolean;
}

export interface Customer {
	id: string;
	misaCode: string;
	name: string;
	group: CustomerGroup;
	taxCode: string;
	province: string;
	address: string;
	status: CustomerStatus;
	assignments: SalesAssignment[];
	recipients: DiscountRecipient[];
	createdAt: string;
	updatedAt: string;
}

export interface CustomerDraft {
	misaCode: string;
	name: string;
	group: CustomerGroup;
	taxCode: string;
	province: string;
	address: string;
	status: CustomerStatus;
	recipientName: string;
	recipientPosition: string;
	recipientPhone: string;
	recipientFrom: string;
}

export interface RecipientDraft {
	fullName: string;
	position: string;
	phone: string;
	effectiveFrom: string;
	isPrimary: boolean;
}

export interface CustomerImportDraft {
	misaCode: string;
	name: string;
	group: CustomerGroup;
	province: string;
	address: string;
}

export const customerGroupLabels: Record<CustomerGroup, string> = {
	state: "Nhà nước",
	private: "Tư nhân",
};

export const customerStatusLabels: Record<CustomerStatus, string> = {
	active: "Đang hoạt động",
	paused: "Tạm ngưng",
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
	return isIsoDate(value) || value === null;
}

function isSalesAssignment(value: unknown): value is SalesAssignment {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.employeeId === "string" &&
		typeof value.employeeName === "string" &&
		typeof value.province === "string" &&
		value.source === "direct" &&
		isIsoDate(value.effectiveFrom) &&
		isNullableString(value.effectiveTo)
	);
}

function isDiscountRecipient(value: unknown): value is DiscountRecipient {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.fullName === "string" &&
		typeof value.position === "string" &&
		typeof value.phone === "string" &&
		isIsoDate(value.effectiveFrom) &&
		isNullableString(value.effectiveTo) &&
		typeof value.isPrimary === "boolean" &&
		typeof value.active === "boolean"
	);
}

export function isCustomer(value: unknown): value is Customer {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.misaCode === "string" &&
		typeof value.name === "string" &&
		(value.group === "state" || value.group === "private") &&
		typeof value.taxCode === "string" &&
		typeof value.province === "string" &&
		typeof value.address === "string" &&
		(value.status === "active" || value.status === "paused") &&
		Array.isArray(value.assignments) &&
		value.assignments.every(isSalesAssignment) &&
		Array.isArray(value.recipients) &&
		value.recipients.every(isDiscountRecipient) &&
		isIsoTimestamp(value.createdAt) &&
		isIsoTimestamp(value.updatedAt)
	);
}

export function isCustomerList(value: unknown): value is Customer[] {
	return Array.isArray(value) && value.every(isCustomer);
}
