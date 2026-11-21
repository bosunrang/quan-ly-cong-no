import type { Customer } from "../customers/customer.model";
import type { SalesEmployee } from "../employees/employee.model";
import type { MisaSalesBook } from "../misa/misa.sales-book";
import type { ReceiptLedger } from "../payments/receipt-ledger";
import type { InvoiceDueDate } from "../payments/receivable-aging";
import type { AppSettings } from "./settings.model";

export interface BusinessData {
	customers: Customer[];
	employees: SalesEmployee[];
	salesBook: MisaSalesBook | null;
	ledger: ReceiptLedger | null;
	settings: AppSettings | null;
	invoiceDueDates?: InvoiceDueDate[];
}

export type BusinessGroup = Exclude<
	keyof BusinessData,
	"settings" | "invoiceDueDates"
>;

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
