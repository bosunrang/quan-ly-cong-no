import { normalizeDateOnly } from "../../shared/lib/date";

export * from "../../domain/reports/statement";

export function statementIssueDate(issuedOn: string): string {
	const iso = normalizeDateOnly(issuedOn);
	if (!iso) return "—";
	const [year, month, day] = iso.split("-");
	return `Ngày ${day} tháng ${month} năm ${year}`;
}
