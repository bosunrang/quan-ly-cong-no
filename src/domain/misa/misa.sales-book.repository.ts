import { api } from "../../shared/api/client";
import type {
	Page,
	SalesImportReview,
	SalesMetadata,
} from "../reports/view-types";
import type { MisaSalesLine } from "./misa.sales-book";
import type { MisaSalesImportPreview } from "./sales-import.model";
import type { SalesImportOptions } from "./sales-merge";

export type ImportChoices = Pick<
	SalesImportOptions,
	"applyChanges" | "removeMissing"
>;

function payload(source: MisaSalesImportPreview, choices: ImportChoices) {
	return {
		mode: "import",
		book: source.book,
		duplicateOf: [...source.duplicateOf],
		customerAddresses: [...(source.customerAddresses ?? [])],
		...choices,
	};
}

export function previewSalesImport(
	source: MisaSalesImportPreview,
	choices: ImportChoices,
) {
	return api<SalesImportReview>(
		"POST",
		"sales-imports/preview",
		payload(source, choices),
	);
}
export function confirmSalesImport(token: string) {
	return api<{ book: SalesMetadata | null }>("POST", "sales-imports/confirm", {
		token,
	});
}

/** Một trang "dòng không còn trong tệp" của bản xem trước mà máy chủ đang giữ theo mã. */
export function readMissingSales(token: string, page: number, query: string) {
	const params = new URLSearchParams({ page: String(page), q: query });
	return api<Page<MisaSalesLine>>(
		"POST",
		`sales-imports/missing?${params.toString()}`,
		{ token },
	);
}
