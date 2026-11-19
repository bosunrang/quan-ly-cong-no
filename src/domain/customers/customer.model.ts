import { isIsoDate, isIsoTimestamp } from "../../shared/lib/date";

export type CustomerGroup = "state" | "private" | "unknown";
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
}

export interface CustomerImportDraft {
	misaCode: string;
	name: string;
	group: CustomerGroup;
	province: string;
	address: string;
}

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

export function isCustomer(value: unknown): value is Customer {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.misaCode === "string" &&
		typeof value.name === "string" &&
		(value.group === "state" ||
			value.group === "private" ||
			value.group === "unknown") &&
		typeof value.taxCode === "string" &&
		typeof value.province === "string" &&
		typeof value.address === "string" &&
		(value.status === "active" || value.status === "paused") &&
		Array.isArray(value.assignments) &&
		value.assignments.every(isSalesAssignment) &&
		isIsoTimestamp(value.createdAt) &&
		isIsoTimestamp(value.updatedAt)
	);
}

export function isCustomerList(value: unknown): value is Customer[] {
	return Array.isArray(value) && value.every(isCustomer);
}
