import type { Customer } from "../customers/customer.model";
import type { SalesEmployee } from "../employees/employee.model";
import type { MisaSalesBook } from "../misa/misa.sales-book";
import type { ReceiptLedger } from "../payments/receipt-ledger";
import type { AppSettings } from "./settings.model";

export interface BusinessData {
	customers: Customer[];
	employees: SalesEmployee[];
	salesBook: MisaSalesBook | null;
	ledger: ReceiptLedger | null;
	settings: AppSettings | null;
}

export type BusinessGroup = Exclude<keyof BusinessData, "settings">;

export interface BusinessBackup {
	format: "cong-no-backup";
	version: 1;
	companyId: string | null;
	createdAt: string;
	data: BusinessData;
}

export type BusinessChange =
	| { type: "restore"; backup: BusinessBackup }
	| { type: "delete"; groups: BusinessGroup[] };
