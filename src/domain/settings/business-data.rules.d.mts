import type { BusinessBackup, BusinessData, BusinessGroup } from "./business-data.types";

export const businessGroups: readonly BusinessGroup[];
export function makeBusinessBackup(data: BusinessData, companyId: string | null): BusinessBackup;
export function validateBusinessBackup(backup: unknown): BusinessBackup;
export function restoreBusinessData(
	backup: unknown,
	current: BusinessData,
	companyId: string | null,
	accountIds: ReadonlySet<string>,
): BusinessData;
export function isValidCustomerList(value: unknown): boolean;
export function isValidEmployeeList(value: unknown): boolean;
export function isValidSalesBook(value: unknown): boolean;
export function isValidSettings(value: unknown): boolean;
export function isValidReceiptLedger(value: unknown): boolean;
export function deleteBusinessGroups(current: BusinessData, groups: readonly BusinessGroup[]): BusinessData;
