import type { Ref } from "react";
import type { MisaSalesLine } from "../../domain/misa/misa.sales-book";
import { formatDateOnly } from "../../shared/lib/date";
import { StatusPill } from "../../shared/ui/StatusPill";
import { salesColumns, salesHeaders } from "./misa.sales-import";
import type { SalesImportIssue } from "./misa.sales-merge";

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 12 });
const numericColumns = new Set<keyof MisaSalesLine>([
	"quantity",
	"unitPrice",
	"salesAmount",
	"paymentTotal",
]);

export function MisaSalesTable({
	rows,
	issues,
	viewportRef,
	loading,
	emptyMessage,
}: {
	rows: MisaSalesLine[];
	issues?: ReadonlyMap<number, SalesImportIssue>;
	viewportRef?: Ref<HTMLElement>;
	loading?: boolean;
	emptyMessage?: string;
}) {
	return (
		<section
			className="table-scroll misa-sales-table"
			ref={viewportRef}
			aria-busy={loading}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: This makes both axes of the table scrollable by keyboard.
			tabIndex={0}
			aria-label="Vùng cuộn sổ bán hàng"
		>
			<table aria-label="Sổ chi tiết bán hàng">
				<thead>
					<tr>
						{salesColumns.map((key) => (
							<th
								key={key}
								scope="col"
								className={numericColumns.has(key) ? "numeric" : undefined}
							>
								{salesHeaders[key]}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => {
						const issue = issues?.get(row.rowNumber);
						return (
							<tr
								key={row.rowNumber}
								className={issue ? "misa-sales-flagged-row" : undefined}
							>
								{salesColumns.map((key) => {
									const value = row[key];
									return (
										<td
											key={key}
											className={
												numericColumns.has(key) ? "numeric" : undefined
											}
										>
											{key === "date"
												? formatDateOnly(row.date)
												: typeof value === "number"
													? number.format(value)
													: value || "—"}
											{key === "date" && issue && (
												<StatusPill
													tone={issue.kind === "update" ? "info" : "warning"}
													className="misa-sales-issue-label"
												>
													{issue.label}
												</StatusPill>
											)}
										</td>
									);
								})}
							</tr>
						);
					})}
				</tbody>
			</table>
			{emptyMessage && <div className="empty-state">{emptyMessage}</div>}
		</section>
	);
}
