import { isIsoTimestamp } from "../../shared/lib/date";

export type EmployeeStatus = "active" | "inactive";

export interface SalesEmployee {
	id: string;
	code: string;
	name: string;
	phone: string;
	email: string;
	status: EmployeeStatus;
	createdAt: string;
}

export interface EmployeeDraft {
	code: string;
	name: string;
	phone: string;
	email: string;
	status: EmployeeStatus;
}

export function isSalesEmployee(value: unknown): value is SalesEmployee {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const employee = value as Record<string, unknown>;
	return (
		typeof employee.id === "string" &&
		typeof employee.code === "string" &&
		typeof employee.name === "string" &&
		typeof employee.phone === "string" &&
		typeof employee.email === "string" &&
		(employee.status === "active" || employee.status === "inactive") &&
		isIsoTimestamp(employee.createdAt)
	);
}

export function isSalesEmployeeList(value: unknown): value is SalesEmployee[] {
	return Array.isArray(value) && value.every(isSalesEmployee);
}
