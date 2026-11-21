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
import type {
	AgingAmounts,
	AgingBucket,
	AgingPortfolio,
	InvoiceAging,
} from "../payments/receivable-aging";
import type {
	buildDashboardSummary,
	CustomerInvoiceTotals,
} from "./dashboard-summary";

export interface Page<T> {
	items: T[];
	total: number;
	page: number;
	limit: number;
}
/** Danh sách chứng từ phân bổ: `later` là số chứng từ còn mở có ngày sau ngày thu. */
export interface CandidatePage extends Page<AllocationCandidate> {
	later: number;
}
export type InvoiceCustomer = {
	id: string;
	customerCode: string;
	name: string;
};
export type InvoiceRow = Omit<ReceivableDocument, "lines"> & {
	aging?: InvoiceAging;
};
export type InvoicePage = Page<InvoiceRow> & { totals?: CustomerInvoiceTotals };
export type ReceivableRow = Omit<CustomerReceivables, "documents"> & {
	documentCount: number;
	earliestDueDate: string | null;
	maxOverdueDays: number | null;
	/** Nợ quá hạn đã trừ giảm trừ chung. */
	overdueAmount: number;
	reductionAmount: number;
	/** Tiền đã thu nhưng chưa phân bổ vào hóa đơn. */
	unallocatedAmount: number;
};
export interface ReceivablesView {
	hasBook: boolean;
	fileName: string;
	unmatchedAllocationCount: number;
	missingTotalCount: number;
	agingAsOf: string;
	agingUnitCounts: Record<AgingBucket | "all" | "overdue", number>;
	agingAmounts: AgingAmounts;
	/** Giảm trừ chung chưa trừ vào hóa đơn (số dương): các nhóm trừ số này bằng tổng còn phải thu. */
	agingReductionAmount: number;
	agingUnallocatedAmount: number;
	/** Tổng nợ quá hạn của các khách, đã trừ giảm trừ chung của từng khách. */
	agingOverdueAmount: number;
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
/** Khách còn nợ quá hạn tại ngày chốt (danh sách quá hạn của Dashboard). */
export type DashboardOverdueCustomer = DashboardCustomer & {
	overdueAmount: number;
	maxOverdueDays: number | null;
};
export type DashboardAging = Omit<
	AgingPortfolio<DashboardCustomer>,
	"overdue"
> & { asOf: string };
export type DashboardRow =
	| DashboardCustomer
	| DashboardOverdueCustomer
	| Summary["periodReceipts"][number];
export type DashboardView = Omit<
	Summary,
	"customerTotals" | "receivables" | "periodReceipts" | "unallocatedReceipts"
> & {
	rows: Page<DashboardRow>;
	topDebtors: DashboardCustomer[];
	topOverdue: DashboardOverdueCustomer[];
	aging: DashboardAging;
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
