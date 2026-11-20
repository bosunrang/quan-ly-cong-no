import type { MisaSalesBook, MisaSalesLine } from "../misa/misa.sales-book";
import type { planMisaCustomerSupplement } from "../misa/customer-supplement";
import type {
	planMisaSalesImport,
	SalesImportIssue,
} from "../misa/sales-merge";
import type {
	Receipt,
	ReceiptAllocation,
	ReceiptInvoice,
} from "../payments/receipt-ledger";
import type {
	CustomerReceivables,
	ReceivableDocument,
} from "../payments/receipt-receivables";
import type { buildDashboardSummary } from "./dashboard-summary";

export interface Page<T> {
	items: T[];
	total: number;
	page: number;
	limit: number;
}
export type InvoiceCustomer = {
	id: string;
	customerCode: string;
	name: string;
};
export type InvoiceRow = Omit<ReceivableDocument, "lines">;
export type ReceivableRow = Omit<CustomerReceivables, "documents"> & {
	documentCount: number;
};
export interface ReceivablesView {
	hasBook: boolean;
	fileName: string;
	unmatchedAllocationCount: number;
	missingTotalCount: number;
	filterOptions: {
		employees: [string, string][];
		provinces: string[];
		unmatchedCount: number;
	};
	rows: Page<ReceivableRow>;
}
type Summary = ReturnType<typeof buildDashboardSummary>;
type DashboardCustomer = Omit<Summary["receivables"][number], "documents"> & {
	documentCount: number;
};
export type DashboardRow =
	| DashboardCustomer
	| Summary["periodReceipts"][number];
export type DashboardView = Omit<
	Summary,
	"receivables" | "periodReceipts" | "unallocatedReceipts"
> & {
	rows: Page<DashboardRow>;
	topDebtors: DashboardCustomer[];
	provinceOptions: string[];
	receivablesCount: number;
	periodCount: number;
	unallocatedCount: number;
};
export type SalesMetadata = Omit<MisaSalesBook, "rows">;
export interface SalesPage {
	book: SalesMetadata | null;
	rows: MisaSalesLine[];
	rowCount: number;
	total: number;
	page: number;
	limit: number;
}
type ImportPlan = ReturnType<typeof planMisaSalesImport>;
export type SalesImportReview = Omit<
	ImportPlan,
	"book" | "issues" | "missing"
> & {
	issues: [number, SalesImportIssue][];
	missing: Omit<ImportPlan["missing"], "rows"> & {
		rowCount: number;
		total: number;
	};
	token: string;
};
export type SalesSupplementReview = Omit<
	ReturnType<typeof planMisaCustomerSupplement>,
	"book"
> & { token: string };
export interface ReceiptListRow {
	receipt: Receipt;
	remaining: number;
	state: "open" | "partial" | "closed" | "reversed";
}
export type ReceiptList = Page<ReceiptListRow> & { count: number };
export interface ReceiptDetail {
	receipt: Receipt;
	allocated: number;
	revision: string;
	bookStamp: string | null;
	hasInvoices: boolean;
	allocations: ReceiptAllocation[];
}
export interface AllocationCandidate {
	invoice: ReceiptInvoice;
	remaining: number;
	changed: boolean;
	suggested: boolean;
}
export interface CandidateMatches {
	incomplete: boolean;
	unavailable: boolean;
	matches: AllocationCandidate[][];
}
