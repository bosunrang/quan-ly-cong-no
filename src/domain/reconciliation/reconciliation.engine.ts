import type { Customer } from "../customers/customer.model";
import { normalizeVietnamese } from "../customers/customer.province";
import { currentAssignment } from "../customers/customer.selectors";
import type { MisaDataset, MisaDetailRecord } from "../misa/misa.model";
import {
	isMisaProductMovement,
	isMisaReturnRecord,
	misaNetSalesAmount,
} from "../misa/misa.sales";
import type { Product, ProductCatalog } from "../products/product.model";
import {
	findProductByExternalCode,
	policyRetainedValue,
	resolvePolicy,
} from "../products/product-policy.service";
import type {
	CalculatedReconciliation,
	CalculatedReconciliationRow,
	ReconciliationIssue,
	ReconciliationProductLine,
	ReconciliationProductSummary,
} from "./reconciliation.model";
import { allocateReconciliationReceipts } from "./reconciliation.allocation";

function findProduct(
	catalog: ProductCatalog,
	row: MisaDetailRecord,
): Product | undefined {
	if (row.productCode) {
		const direct = findProductByExternalCode(catalog, row.productCode);
		if (direct) return direct;
	}

	const description = normalizeVietnamese(row.description);
	if (!description) return undefined;
	const candidates = catalog.products.filter((product) => {
		const name = normalizeVietnamese(product.name);
		const code = normalizeVietnamese(product.code);
		return (
			description === name ||
			(name.length >= 8 && description.includes(name)) ||
			(description.length >= 8 && name.includes(description)) ||
			(code.length >= 4 && description.includes(code))
		);
	});
	return candidates.length === 1 ? candidates[0] : undefined;
}

function calculateProductLine(
	row: MisaDetailRecord,
	customer: Customer | undefined,
	catalog: ProductCatalog,
): ReconciliationProductLine {
	const product = findProduct(catalog, row);
	const quantity = row.quantity;
	let issue: ReconciliationIssue | null = null;
	if (!product) issue = "unmatched_product";
	else if (quantity === null || !Number.isFinite(quantity) || quantity === 0)
		issue = "missing_quantity";

	const policy =
		product && customer && row.date
			? resolvePolicy(catalog, product, customer.id, row.date)
			: undefined;
	const individualRetention =
		policy?.policy.recipientAllocations.reduce(
			(sum, allocation) => sum + (allocation.retainedAmount ?? 0),
			0,
		) ?? 0;
	const legacyRetention =
		individualRetention === 0 ? (policy?.policy.retainedAmount ?? 0) : 0;
	const recipients = (policy?.policy.recipientAllocations ?? []).map(
		(allocation, index) => {
			const recipient = customer?.recipients.find(
				(item) => item.id === allocation.recipientId,
			);
			if (!recipient && !issue) issue = "missing_recipient";
			const retainedAmountPerUnit =
				allocation.retainedAmount ?? (index === 0 ? legacyRetention : 0);
			const amountPerUnit = Math.max(
				0,
				allocation.amount - retainedAmountPerUnit,
			);
			return {
				recipientId: allocation.recipientId,
				recipientName:
					recipient?.fullName ?? "Người nhận không còn trong hồ sơ",
				grossAmountPerUnit: allocation.amount,
				retainedAmountPerUnit,
				amountPerUnit,
				grossTotal: quantity ? allocation.amount * quantity : 0,
				retainedTotal: quantity ? retainedAmountPerUnit * quantity : 0,
				totalAmount: quantity ? amountPerUnit * quantity : 0,
			};
		},
	);
	const quantityValue = quantity ?? 0;
	const grossDiscount = policy ? policy.policy.value * quantityValue : 0;
	const retainedCost = policy
		? policyRetainedValue(policy.policy) * quantityValue
		: 0;

	return {
		id: row.id,
		misaRowId: row.id,
		date: row.date ?? "",
		documentNumber: row.documentNumber,
		productId: product?.id ?? null,
		productCode: product?.code ?? row.productCode,
		productName: product?.name ?? row.description,
		unit: row.unit,
		quantity,
		unitPrice: row.unitPrice,
		revenue: misaNetSalesAmount(row),
		policyId: policy?.policy.id ?? null,
		grossDiscount,
		retainedCost,
		discount: policy ? policy.discountPerUnit * quantityValue : 0,
		recipients,
		issue,
		hasPolicy: Boolean(policy),
		isReturn: isMisaReturnRecord(row),
	};
}

function summarizeProductLines(
	lines: ReconciliationProductLine[],
): ReconciliationProductSummary[] {
	const summaries = new Map<string, ReconciliationProductSummary>();
	for (const line of lines) {
		const identity = line.productId || line.productCode || line.productName;
		const key = `${identity}::${line.unit}::${line.unitPrice ?? "none"}`;
		const current = summaries.get(key) ?? {
			id: key,
			productId: line.productId,
			productCode: line.productCode,
			productName: line.productName,
			unit: line.unit,
			unitPrice: line.unitPrice,
			soldQuantity: 0,
			returnedQuantity: 0,
			netQuantity: 0,
			netRevenue: 0,
		};
		const quantity = line.quantity ?? 0;
		if (quantity > 0) current.soldQuantity += quantity;
		if (quantity < 0) current.returnedQuantity += Math.abs(quantity);
		current.netQuantity += quantity;
		current.netRevenue += line.revenue;
		summaries.set(key, current);
	}
	return [...summaries.values()].sort((left, right) =>
		left.productName.localeCompare(right.productName, "vi-VN", {
			sensitivity: "base",
		}),
	);
}

export function calculateReconciliation(
	dateFrom: string,
	dateTo: string,
	details: MisaDetailRecord[],
	dataset: MisaDataset,
	customers: Customer[],
	catalog: ProductCatalog,
	paymentCutoff = dateTo,
): CalculatedReconciliation {
	const unitSummaryById = new Map(dataset.units.map((unit) => [unit.id, unit]));
	const customerById = new Map(
		customers.map((customer) => [customer.id, customer]),
	);
	const rowsByUnit = new Map<string, MisaDetailRecord[]>();
	for (const detail of details) {
		const rows = rowsByUnit.get(detail.unitId) ?? [];
		rows.push(detail);
		rowsByUnit.set(detail.unitId, rows);
	}

	const rows: CalculatedReconciliationRow[] = [...rowsByUnit].flatMap(
		([unitId, unitRows]) => {
			const summary = unitSummaryById.get(unitId);
			const customer = summary?.customerId
				? customerById.get(summary.customerId)
				: undefined;
			const periodRows = unitRows.filter(
				(row) => row.date && row.date >= dateFrom && row.date <= dateTo,
			);
			const salesRows = periodRows.filter(isMisaProductMovement);
			if (!salesRows.length) return [];
			const productLines = salesRows.map((row) =>
				calculateProductLine(row, customer, catalog),
			);
			const productSummaries = summarizeProductLines(productLines);
			const revenue = productLines.reduce((sum, line) => sum + line.revenue, 0);
			const allocation = allocateReconciliationReceipts(
				unitRows,
				dateFrom,
				dateTo,
				paymentCutoff,
				summary?.openingBalance ?? null,
			);
			const collected = Math.min(
				Math.max(0, revenue),
				allocation.allocatedToSales,
			);
			const remainingReceivable = Math.max(0, revenue - collected);
			const issues = [
				...new Set([
					...(!customer ? (["unmatched_customer"] as const) : []),
					...(!allocation.openingBalanceKnown
						? (["missing_opening_balance"] as const)
						: []),
					...productLines.flatMap((line) => (line.issue ? [line.issue] : [])),
				]),
			];
			const warnings = productLines
				.filter((line) => line.productId && !line.hasPolicy)
				.map(
					(line) =>
						`${line.productCode || line.productName}: không có chính sách trong ngày bán`,
				);
			const status = issues.length
				? ("review" as const)
				: revenue > 0 && remainingReceivable < 0.5
					? ("eligible" as const)
					: ("pending" as const);
			const assignment = customer ? currentAssignment(customer) : undefined;

			return [
				{
					id: unitId,
					unitId,
					customerId: customer?.id ?? null,
					customerCode: customer?.misaCode ?? summary?.customerCode ?? "",
					customer: customer?.name ?? summary?.name ?? unitId,
					region: customer?.province ?? "Chưa xác định",
					salesperson: assignment?.employeeName ?? "Chưa phân công",
					revenue,
					collected,
					rawCollected: allocation.rawReceipts,
					priorDebtSettled: allocation.allocatedToPriorDebt,
					adjustmentSettled: allocation.allocatedToAdjustments,
					unallocatedCollected: allocation.unallocatedReceipt,
					remainingReceivable,
					difference: collected - revenue,
					collectionRate: revenue > 0 ? (collected / revenue) * 100 : 0,
					expectedDiscount: productLines.reduce(
						(sum, line) => sum + line.discount,
						0,
					),
					status,
					issues,
					warnings,
					productLines,
					productSummaries,
					openingBalanceKnown: allocation.openingBalanceKnown,
				},
			];
		},
	);

	rows.sort((left, right) =>
		left.customer.localeCompare(right.customer, "vi-VN", {
			sensitivity: "base",
		}),
	);
	return {
		dateFrom,
		dateTo,
		paymentCutoff,
		rows,
		totals: {
			revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
			collected: rows.reduce((sum, row) => sum + row.collected, 0),
			eligibleCustomers: rows.filter((row) => row.status === "eligible").length,
			eligibleDiscount: rows
				.filter((row) => row.status === "eligible")
				.reduce((sum, row) => sum + row.expectedDiscount, 0),
			reviewCustomers: rows.filter((row) => row.status === "review").length,
		},
	};
}
