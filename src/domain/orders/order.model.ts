import type { Customer } from "../customers/customer.model";
import { isIsoDate } from "../../shared/lib/date";

export interface OrderPolicySnapshot {
	policyId: string;
	productId: string;
	customerId: string;
	calculationType: "fixed" | "percent";
	value: number;
	retainedAmount?: number;
	discountPerUnit: number;
	recipientAllocations?: Array<{
		recipientId: string;
		amount: number;
		retainedAmount?: number;
	}>;
	capturedAt: string;
}

export interface OrderRecord {
	id: string;
	date: string;
	orderNo: string;
	customerCode: string;
	customerName: string;
	product: string;
	quantity: number;
	unitPrice: number;
	discountPerUnit: number;
	policySnapshot: OrderPolicySnapshot | null;
}

export interface OrderLine extends Omit<OrderRecord, "customerName"> {
	customer: string;
}

export function isOrderRecordList(value: unknown): value is OrderRecord[] {
	return (
		Array.isArray(value) &&
		value.every((item) => {
			if (!item || typeof item !== "object" || Array.isArray(item))
				return false;
			const row = item as Record<string, unknown>;
			return (
				typeof row.id === "string" &&
				isIsoDate(row.date) &&
				typeof row.orderNo === "string" &&
				typeof row.customerCode === "string" &&
				typeof row.customerName === "string" &&
				typeof row.product === "string" &&
				typeof row.quantity === "number" &&
				typeof row.unitPrice === "number" &&
				typeof row.discountPerUnit === "number" &&
				(row.policySnapshot === null ||
					isOrderPolicySnapshot(row.policySnapshot))
			);
		})
	);
}

function isOrderPolicySnapshot(value: unknown): value is OrderPolicySnapshot {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const snapshot = value as Record<string, unknown>;
	return (
		typeof snapshot.policyId === "string" &&
		typeof snapshot.productId === "string" &&
		typeof snapshot.customerId === "string" &&
		(snapshot.calculationType === "fixed" ||
			snapshot.calculationType === "percent") &&
		typeof snapshot.value === "number" &&
		(snapshot.retainedAmount === undefined ||
			(typeof snapshot.retainedAmount === "number" &&
				snapshot.retainedAmount >= 0)) &&
		typeof snapshot.discountPerUnit === "number" &&
		(snapshot.recipientAllocations === undefined ||
			(Array.isArray(snapshot.recipientAllocations) &&
				snapshot.recipientAllocations.every(
					(allocation) =>
						Boolean(allocation) &&
						typeof allocation === "object" &&
						!Array.isArray(allocation) &&
						typeof (allocation as Record<string, unknown>).recipientId ===
							"string" &&
						typeof (allocation as Record<string, unknown>).amount ===
							"number" &&
						((allocation as Record<string, unknown>).retainedAmount ===
							undefined ||
							typeof (allocation as Record<string, unknown>).retainedAmount ===
								"number"),
				))) &&
		typeof snapshot.capturedAt === "string" &&
		!Number.isNaN(new Date(snapshot.capturedAt).getTime())
	);
}

export function selectOrderLines(
	records: OrderRecord[],
	customers: Customer[],
): OrderLine[] {
	const customerNames = new Map(
		customers.map((customer) => [
			customer.misaCode.toLocaleLowerCase("vi-VN"),
			customer.name,
		]),
	);
	return records.map(({ customerName, ...record }) => ({
		...record,
		customer:
			customerNames.get(record.customerCode.toLocaleLowerCase("vi-VN")) ??
			customerName,
	}));
}
