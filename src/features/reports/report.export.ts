import type { Cell, Row } from "exceljs";
import { formatDateOnly, isIsoDate } from "../../shared/lib/date";
import {
	type ReceivableStatement,
	statementColumns,
	statementConfirmation,
	statementBalanceInWords,
	statementCoverage,
	type statementSeller,
	statementSignatures,
	statementTitle,
} from "./report.model";

const moneyFormat = '#,##0;[Red](#,##0);"-"';
const grid = { style: "thin", color: { argb: "FFCBD5DB" } } as const;

export async function makeStatementWorkbook(
	statement: ReceivableStatement,
	seller: ReturnType<typeof statementSeller>,
	issuedOn: string,
) {
	const { Workbook } = await import("exceljs");
	const workbook = new Workbook();
	const sheet = workbook.addWorksheet("Đối chiếu công nợ", {
		views: [{ showGridLines: false }],
		pageSetup: {
			paperSize: 9,
			orientation: "portrait",
			fitToPage: true,
			fitToWidth: 1,
			fitToHeight: 0,
			margins: {
				left: 0.47,
				right: 0.47,
				top: 0.47,
				bottom: 0.47,
				header: 0.23,
				footer: 0.23,
			},
		},
	});
	sheet.columns = [14, 18, 18, 18, 36].map((width) => ({ width }));

	function mergeText(text: string) {
		const row = sheet.addRow([text]);
		sheet.mergeCells(row.number, 1, row.number, 5);
		row.getCell(1).alignment = { vertical: "middle", wrapText: true };
		row.height = Math.max(17, Math.ceil(text.length / 95) * 15);
		return row.getCell(1);
	}

	const title = mergeText(statementTitle);
	title.font = { name: "Arial", bold: true, size: 17 };
	title.alignment = { horizontal: "center", vertical: "middle" };
	sheet.getRow(1).height = 32;
	const period = mergeText(
		`Từ ngày ${formatDateOnly(statement.from)} đến ngày ${formatDateOnly(statement.through)}`,
	);
	period.alignment = { horizontal: "center", vertical: "middle" };
	sheet.addRow([]);
	mergeText(`Bên A · ${seller.name}`).font = { name: "Arial", bold: true };
	if (seller.address) mergeText(`Địa chỉ · ${seller.address}`);
	for (const account of seller.accounts) mergeText(`Tài khoản · ${account}`);
	mergeText(`Bên B · ${statement.customer.name}`).font = {
		name: "Arial",
		bold: true,
	};
	if (statement.customer.address)
		mergeText(`Địa chỉ · ${statement.customer.address}`);
	if (statement.customer.misaCode)
		mergeText(`Mã khách hàng · ${statement.customer.misaCode}`);
	mergeText("Đơn vị tính · VND");

	function gridRow(row: Row, bold = false) {
		for (let i = 1; i <= 5; i += 1) {
			const cell: Cell = row.getCell(i);
			cell.border = { top: grid, left: grid, bottom: grid, right: grid };
			cell.alignment = {
				vertical: "middle",
				horizontal: i === 5 ? "left" : i > 2 ? "right" : "center",
				wrapText: true,
			};
			if (i === 3 || i === 4) cell.numFmt = moneyFormat;
			if (bold) cell.font = { name: "Arial", bold: true };
		}
	}

	const header = sheet.addRow(statementColumns);
	gridRow(header, true);
	header.height = 26;
	header.eachCell((cell) => {
		cell.fill = {
			type: "pattern",
			pattern: "solid",
			fgColor: { argb: "FFEEF2F4" },
		};
		cell.alignment = {
			vertical: "middle",
			horizontal: "center",
			wrapText: true,
		};
	});
	sheet.pageSetup.printTitlesRow = `${header.number}:${header.number}`;

	function totalRow(label: string, increase: number, payment?: number) {
		const row = sheet.addRow([label, null, increase, payment ?? null]);
		sheet.mergeCells(row.number, 1, row.number, 2);
		gridRow(row, true);
		row.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
		row.height = 22;
	}

	totalRow("Số dư đầu kỳ", statement.opening);
	for (const entry of statement.rows) {
		const row = sheet.addRow([
			isIsoDate(entry.date) ? new Date(`${entry.date}T00:00:00.000Z`) : null,
			entry.invoiceNumber,
			entry.increase || null,
			entry.payment || null,
			entry.note,
		]);
		gridRow(row);
		row.getCell(1).numFmt = "dd/mm/yyyy";
		row.height = Math.max(19, Math.ceil(entry.note.length / 36) * 15);
	}
	if (!statement.rows.length)
		mergeText("Không có phát sinh hoặc thanh toán trong kỳ.");
	totalRow("Cộng trong kỳ", statement.increase, statement.payment);
	totalRow("Số dư cuối kỳ", statement.closing);
	if (statement.unallocated !== 0) {
		totalRow("Tiền đã thu chưa phân bổ", 0, statement.unallocated);
		totalRow("Công nợ thuần cuối kỳ", statement.net);
	}
	mergeText(`Bằng chữ · ${statementBalanceInWords(statement)}`);
	mergeText(statementCoverage(statement));
	if (seller.contact) mergeText(seller.contact);
	mergeText(statementConfirmation);
	sheet.addRow([]);
	mergeText(`Ngày lập biên bản ${formatDateOnly(issuedOn)}`).alignment = {
		horizontal: "right",
	};
	const signatures = sheet.addRow([
		statementSignatures[0],
		null,
		null,
		statementSignatures[1],
	]);
	sheet.mergeCells(signatures.number, 1, signatures.number, 2);
	sheet.mergeCells(signatures.number, 4, signatures.number, 5);
	signatures.eachCell((cell) => {
		cell.alignment = { horizontal: "center" };
		cell.font = { name: "Arial", bold: true };
	});
	if (seller.signatoryTitle) {
		const role = sheet.addRow([
			null,
			null,
			null,
			seller.signatoryTitle.toLocaleUpperCase("vi-VN"),
		]);
		sheet.mergeCells(role.number, 4, role.number, 5);
		role.getCell(4).alignment = { horizontal: "center" };
	}
	sheet.addRow([]).height = 42;
	const signatory = sheet.addRow([null, null, null, seller.signatory]);
	sheet.mergeCells(signatory.number, 4, signatory.number, 5);
	signatory.getCell(4).alignment = { horizontal: "center" };
	sheet.pageSetup.printArea = `A1:E${sheet.rowCount}`;
	return workbook.xlsx.writeBuffer();
}

export async function downloadStatementWorkbook(
	statement: ReceivableStatement,
	seller: ReturnType<typeof statementSeller>,
	issuedOn: string,
) {
	const buffer = await makeStatementWorkbook(statement, seller, issuedOn);
	const url = URL.createObjectURL(
		new Blob([new Uint8Array(buffer)], {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		}),
	);
	const anchor = document.createElement("a");
	anchor.href = url;
	const customerCode =
		statement.customer.misaCode.replace(/[^a-z0-9_-]/gi, "") || "khach-hang";
	anchor.download = `doi-chieu-cong-no-${customerCode}-${statement.from}-${statement.through}.xlsx`;
	anchor.click();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
