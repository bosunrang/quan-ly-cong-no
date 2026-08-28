import type { MisaDetailRecord } from "../misa/misa.model";
import {
	isMisaProductMovement,
	isMisaReturnRecord,
	misaNetSalesAmount,
} from "../misa/misa.sales";
import { normalizeVietnamese } from "../customers/customer.province";

type LotKind = "prior" | "sale" | "adjustment";

interface ReceivableLot {
	id: string;
	kind: LotKind;
	productKey: string;
	principal: number;
	cashAllocated: number;
	nonCashAllocated: number;
	remaining: number;
}

export interface ReconciliationAllocation {
	priorBalance: number;
	rawReceipts: number;
	allocatedToSales: number;
	allocatedToPriorDebt: number;
	allocatedToAdjustments: number;
	unallocatedReceipt: number;
	remainingSales: number;
	openingBalanceKnown: boolean;
}

function finite(value: number | null): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function productKey(row: MisaDetailRecord): string {
	return [
		normalizeVietnamese(row.productCode || row.description),
		normalizeVietnamese(row.unit),
		row.unitPrice ?? "none",
	].join("::");
}

function receivableDelta(row: MisaDetailRecord): number {
	if (isMisaProductMovement(row)) return misaNetSalesAmount(row);
	if (row.documentKind === "receipt") return -Math.abs(finite(row.credit));
	return finite(row.debit) - finite(row.credit);
}

export function allocateReconciliationReceipts(
	rows: MisaDetailRecord[],
	dateFrom: string,
	salesDateTo: string,
	paymentCutoff: string,
	openingBalance: number | null,
): ReconciliationAllocation {
	const historyDateTo =
		paymentCutoff > salesDateTo ? paymentCutoff : salesDateTo;
	const orderedRows = rows
		.filter((row) => row.date && row.date <= historyDateTo)
		.sort(
			(left, right) =>
				(left.date ?? "").localeCompare(right.date ?? "") ||
				left.rowNumber - right.rowNumber,
		);
	let priorBalance = openingBalance ?? 0;
	for (const row of orderedRows) {
		if (!row.date || row.date >= dateFrom) break;
		priorBalance += receivableDelta(row);
	}

	const lots: ReceivableLot[] = [];
	let cashPool = Math.max(0, -priorBalance);
	let nonCashPool = 0;
	let rawReceipts = 0;
	if (priorBalance > 0) {
		lots.push({
			id: "prior-balance",
			kind: "prior",
			productKey: "",
			principal: priorBalance,
			cashAllocated: 0,
			nonCashAllocated: 0,
			remaining: priorBalance,
		});
	}

	function allocatePool(pool: "cash" | "nonCash") {
		let available = pool === "cash" ? cashPool : nonCashPool;
		if (available <= 0) return;
		for (const lot of lots) {
			if (lot.remaining <= 0 || available <= 0) continue;
			const amount = Math.min(lot.remaining, available);
			if (pool === "cash") lot.cashAllocated += amount;
			else lot.nonCashAllocated += amount;
			lot.remaining -= amount;
			available -= amount;
		}
		if (pool === "cash") cashPool = available;
		else nonCashPool = available;
	}

	function addLot(id: string, kind: LotKind, principal: number, key = "") {
		if (principal <= 0) return;
		lots.push({
			id,
			kind,
			productKey: key,
			principal,
			cashAllocated: 0,
			nonCashAllocated: 0,
			remaining: principal,
		});
		allocatePool("nonCash");
		allocatePool("cash");
	}

	function reduceSaleLots(amount: number, key: string) {
		let remainingReturn = amount;
		const matching = [...lots]
			.reverse()
			.filter((lot) => lot.kind === "sale" && lot.productKey === key);
		const fallback = [...lots]
			.reverse()
			.filter((lot) => lot.kind === "sale" && lot.productKey !== key);
		for (const lot of [...matching, ...fallback]) {
			if (remainingReturn <= 0 || lot.principal <= 0) continue;
			const reduction = Math.min(lot.principal, remainingReturn);
			lot.principal -= reduction;
			remainingReturn -= reduction;

			let overAllocated = Math.max(
				0,
				lot.cashAllocated + lot.nonCashAllocated - lot.principal,
			);
			const releasedCash = Math.min(lot.cashAllocated, overAllocated);
			lot.cashAllocated -= releasedCash;
			cashPool += releasedCash;
			overAllocated -= releasedCash;
			const releasedNonCash = Math.min(lot.nonCashAllocated, overAllocated);
			lot.nonCashAllocated -= releasedNonCash;
			nonCashPool += releasedNonCash;
			lot.remaining = Math.max(
				0,
				lot.principal - lot.cashAllocated - lot.nonCashAllocated,
			);
		}
		if (remainingReturn > 0) nonCashPool += remainingReturn;
		allocatePool("nonCash");
		allocatePool("cash");
	}

	for (const row of orderedRows) {
		if (!row.date || row.date < dateFrom) continue;
		if (isMisaProductMovement(row)) {
			if (row.date > salesDateTo) continue;
			const amount = misaNetSalesAmount(row);
			if (amount > 0) addLot(row.id, "sale", amount, productKey(row));
			else if (amount < 0 || isMisaReturnRecord(row))
				reduceSaleLots(Math.abs(amount), productKey(row));
			continue;
		}
		if (row.documentKind === "receipt") {
			if (row.date > paymentCutoff) continue;
			const receipt = Math.abs(finite(row.credit));
			rawReceipts += receipt;
			cashPool += receipt;
			allocatePool("cash");
			continue;
		}
		if (row.date > salesDateTo) continue;
		const adjustment = finite(row.debit) - finite(row.credit);
		if (adjustment > 0) addLot(row.id, "adjustment", adjustment);
		else if (adjustment < 0) {
			nonCashPool += Math.abs(adjustment);
			allocatePool("nonCash");
		}
	}

	const totalFor = (kind: LotKind, field: "cashAllocated" | "remaining") =>
		lots
			.filter((lot) => lot.kind === kind)
			.reduce((sum, lot) => sum + lot[field], 0);

	return {
		priorBalance,
		rawReceipts,
		allocatedToSales: totalFor("sale", "cashAllocated"),
		allocatedToPriorDebt: totalFor("prior", "cashAllocated"),
		allocatedToAdjustments: totalFor("adjustment", "cashAllocated"),
		unallocatedReceipt: cashPool,
		remainingSales: totalFor("sale", "remaining"),
		openingBalanceKnown: openingBalance !== null,
	};
}
