import type { Customer } from "../customers/customer.model";
import type { MisaSalesBook } from "../misa/misa.sales-book";
import {
	buildSalesReceivables,
	salesRowsThrough,
} from "../misa/misa.sales-receivables";
import {
	type ReceiptLedger,
	receiptLedgerAt,
} from "../payments/receipt-ledger";
import { projectReceiptReceivables } from "../payments/receipt-receivables";
import type { AppSettings } from "../settings/settings.model";
import { formatDateOnly, previousDay } from "../../shared/lib/date";

export const statementTitle = "BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ";
export const statementColumns = [
	"Ngày",
	"Số hóa đơn",
	"Số phát sinh",
	"Số thanh toán",
	"Ghi chú",
];
export const statementSignatures = ["ĐẠI DIỆN KHÁCH HÀNG", "ĐẠI DIỆN BÊN BÁN"];
export const statementConfirmation =
	"Nếu đồng ý với số liệu trên, xin vui lòng ký xác nhận, đóng dấu và gửi lại 01 bản.";
export const statementBasis =
	"Số dư đầu kỳ gồm công nợ trước kỳ từ sổ MISA đã nhập và số dư nhập tay có ngày chốt trước kỳ, sau khi trừ khoản thu đã phân bổ. Số thanh toán là chênh lệch phân bổ có hiệu lực trong kỳ. Tiền đã thu chưa phân bổ được trình bày riêng và trừ vào công nợ thuần.";

export function statementSeller(settings: AppSettings) {
	// Không tự điền tên công ty khác khi Cài đặt còn trống: mỗi kho LAN là một
	// pháp nhân riêng, in nhầm bên bán và tài khoản ngân hàng là sai chứng từ.
	return {
		name: settings.companyName.trim(),
		address: settings.companyAddress.trim(),
		accounts: settings.bankAccounts.map((item) => item.trim()).filter(Boolean),
		contact: settings.accountingContact.trim(),
		signatory: settings.signatoryName.trim(),
		signatoryTitle: settings.signatoryTitle.trim(),
	};
}

export interface StatementLine {
	id: string;
	date: string;
	invoiceNumber: string;
	increase: number;
	payment: number;
	note: string;
}

export function buildReceivableStatement(
	book: MisaSalesBook | null,
	ledger: ReceiptLedger,
	customers: readonly Customer[],
	customer: Customer,
	from: string,
	through: string,
) {
	const receipts = ledger.receipts.filter(
		({ customerId }) => customerId === customer.id,
	);
	const receiptIds = new Set(receipts.map(({ id }) => id));
	const customerLedger = {
		...ledger,
		receipts,
		allocations: ledger.allocations.filter(({ receiptId }) =>
			receiptIds.has(receiptId),
		),
	};
	const at = (date: string) => {
		const rows = salesRowsThrough(book?.rows ?? [], date);
		const groups = buildSalesReceivables(rows, customers, [], {
			through: date,
		}).filter(({ customerId }) => customerId === customer.id);
		return projectReceiptReceivables(
			groups,
			book?.fileName ?? "",
			receiptLedgerAt(customerLedger, date),
		);
	};
	const before = at(previousDay(from));
	const after = at(through);
	const openingDocuments = new Map(
		before.customers.flatMap(({ documents }) =>
			documents.map((doc) => [doc.id, doc] as const),
		),
	);
	const rows: StatementLine[] = [];
	let opening = 0;
	let omitted = 0;
	for (const document of after.customers.flatMap(
		({ documents }) => documents,
	)) {
		const previous = openingDocuments.get(document.id);
		openingDocuments.delete(document.id);
		const current = document.balance;
		if (!current || (previous && !previous.balance)) {
			omitted += 1;
			continue;
		}

		const prior = previous?.balance;
		opening += prior?.remaining ?? 0;
		const increase =
			current.remaining +
			current.received -
			((prior?.remaining ?? 0) + (prior?.received ?? 0));
		const payment = current.received - (prior?.received ?? 0);
		if (!increase && !payment) continue;

		const previousIds = new Set(prior?.allocations.map(({ id }) => id));
		const currentIds = new Set(current.allocations.map(({ id }) => id));
		const receiptsInPeriod = [
			...new Set(
				current.allocations
					.filter(({ id }) => !previousIds.has(id))
					.map(({ receiptDate }) => receiptDate)
					.filter(Boolean),
			),
		].sort();
		const note = [
			document.openingBalance
				? "Số dư đầu kỳ nhập tay"
				: !document.invoiceNumber &&
					`CT ${document.documentNumbers.join(", ")}`,
			!document.openingBalance && previous && !increase && "Hóa đơn trước kỳ",
			receiptsInPeriod.length > 0 &&
				`Thu ngày ${receiptsInPeriod.map((date) => formatDateOnly(date)).join(", ")}`,
			[...previousIds].some((id) => !currentIds.has(id)) &&
				"Có hoàn tác phân bổ trong kỳ",
		]
			.filter(Boolean)
			.join(" · ");
		rows.push({
			id: document.id,
			date: document.invoiceDate || document.firstDate,
			invoiceNumber: document.invoiceNumber,
			increase,
			payment,
			note,
		});
	}

	rows.sort(
		(a, b) =>
			a.date.localeCompare(b.date) ||
			a.invoiceNumber.localeCompare(b.invoiceNumber, "vi", { numeric: true }),
	);
	const increase = rows.reduce((sum, row) => sum + row.increase, 0);
	const payment = rows.reduce((sum, row) => sum + row.payment, 0);
	const closing = opening + increase - payment;
	// Tiền khách đã trả đến cuối kỳ nhưng chưa phân bổ vào hóa đơn nào.
	const atClose = receiptLedgerAt(customerLedger, through);
	const unallocated =
		atClose.receipts.reduce((sum, receipt) => sum + receipt.amount, 0) -
		atClose.allocations.reduce(
			(sum, allocation) =>
				sum + allocation.lines.reduce((total, line) => total + line.amount, 0),
			0,
		);
	return {
		customer,
		from,
		through,
		rows,
		opening,
		increase,
		payment,
		closing,
		unallocated,
		/** Công nợ thuần: âm nghĩa là khách hàng đang dư có. */
		net: closing - unallocated,
		omitted: omitted + openingDocuments.size,
		hasUnmatchedAllocations:
			before.unmatchedCount > 0 || after.unmatchedCount > 0,
	};
}

export type ReceivableStatement = ReturnType<typeof buildReceivableStatement>;

export function statementCoverage(statement: ReceivableStatement) {
	return [
		statementBasis,
		statement.omitted > 0 &&
			`Có ${statement.omitted} chứng từ chưa đủ điều kiện tính vào báo cáo.`,
		statement.hasUnmatchedAllocations && "Có phân bổ chưa khớp sổ MISA.",
	]
		.filter(Boolean)
		.join(" ");
}

const digits = [
	"không",
	"một",
	"hai",
	"ba",
	"bốn",
	"năm",
	"sáu",
	"bảy",
	"tám",
	"chín",
];
const scales = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];

/** Dòng chữ cho số dư khách cần xác nhận, kể cả khi khách hàng dư có. */
export function statementBalanceInWords(statement: ReceivableStatement) {
	const words = amountInWords(Math.abs(statement.net));
	return statement.net < 0
		? `Khách hàng dư có ${words.charAt(0).toLocaleLowerCase("vi-VN")}${words.slice(1)}`
		: words;
}

export function amountInWords(amount: number) {
	if (amount === 0) return "Không đồng chẵn.";
	const groups: string[] = [];
	for (let value = amount, scale = 0; value > 0; scale += 1) {
		const block = value % 1000;
		value = Math.floor(value / 1000);
		if (!block) continue;
		const hundreds = Math.floor(block / 100);
		const tens = Math.floor(block / 10) % 10;
		const units = block % 10;
		const words = [];
		if (hundreds || value > 0) words.push(digits[hundreds], "trăm");
		if (tens > 1) words.push(digits[tens], "mươi");
		if (tens === 1) words.push("mười");
		if (!tens && units && words.length) words.push("lẻ");
		if (units)
			words.push(
				units === 1 && tens > 1
					? "mốt"
					: units === 5 && tens > 0
						? "lăm"
						: digits[units],
			);
		if (scales[scale]) words.push(scales[scale]);
		groups.unshift(words.join(" "));
	}
	const phrase = groups.join(" ");
	return `${phrase.charAt(0).toLocaleUpperCase("vi-VN")}${phrase.slice(1)} đồng chẵn.`;
}
