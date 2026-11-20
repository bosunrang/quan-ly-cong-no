import { formatDateOnly } from "../../shared/lib/date";
import {
	type ReceivableStatement,
	statementBalanceInWords,
	statementColumns,
	statementConfirmation,
	statementCoverage,
	statementIssueDate,
	type statementSeller,
	statementSignatures,
	statementTitle,
} from "./report.model";

const money = new Intl.NumberFormat("vi-VN");

export function StatementDocument({
	statement,
	seller,
	issuedOn,
}: {
	statement: ReceivableStatement;
	seller: ReturnType<typeof statementSeller>;
	issuedOn: string;
}) {
	return (
		<article
			className="panel report-document"
			aria-labelledby="statement-title"
		>
			<header className="report-heading">
				<h2 id="statement-title">{statementTitle}</h2>
				<p>
					Từ ngày {formatDateOnly(statement.from)} đến ngày{" "}
					{formatDateOnly(statement.through)}
				</p>
			</header>
			<div className="report-parties">
				<div>
					<h3>
						Bên A <span>{seller.name || "Chưa nhập tên công ty"}</span>
					</h3>
					{seller.address && <p>Địa chỉ · {seller.address}</p>}
					{seller.accounts.map((account) => (
						<p key={account}>Tài khoản · {account}</p>
					))}
				</div>
				<div>
					<h3>
						Bên B <span>{statement.customer.name}</span>
					</h3>
					{statement.customer.address && (
						<p>Địa chỉ · {statement.customer.address}</p>
					)}
					{statement.customer.misaCode && (
						<p>Mã khách hàng · {statement.customer.misaCode}</p>
					)}
				</div>
			</div>
			<p className="report-unit">Đơn vị tính · VND</p>
			<table className="report-table" aria-label="Chi tiết đối chiếu công nợ">
				<colgroup>
					<col />
					<col />
					<col />
					<col />
					<col />
				</colgroup>
				<thead>
					<tr>
						{statementColumns.map((column) => (
							<th key={column} scope="col">
								{column}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					<tr className="report-opening">
						<th scope="row" colSpan={2}>
							Số dư đầu kỳ
						</th>
						<td>{money.format(statement.opening)}</td>
						<td />
						<td />
					</tr>
					{statement.rows.map((row) => (
						<tr key={row.id}>
							<td>{formatDateOnly(row.date)}</td>
							<td>{row.invoiceNumber || "—"}</td>
							<td>{row.increase ? money.format(row.increase) : "—"}</td>
							<td>{row.payment ? money.format(row.payment) : "—"}</td>
							<td>{row.note}</td>
						</tr>
					))}
					{statement.rows.length === 0 && (
						<tr>
							<td colSpan={5}>Không có phát sinh hoặc thanh toán trong kỳ.</td>
						</tr>
					)}
				</tbody>
				<tbody className="report-totals">
					<tr>
						<th scope="row" colSpan={2}>
							Cộng trong kỳ
						</th>
						<td>{money.format(statement.increase)}</td>
						<td>{money.format(statement.payment)}</td>
						<td />
					</tr>
					<tr>
						<th scope="row" colSpan={2}>
							Số dư cuối kỳ
						</th>
						<td>{money.format(statement.closing)}</td>
						<td />
						<td />
					</tr>
					{statement.unallocated !== 0 && (
						<>
							<tr>
								<th scope="row" colSpan={2}>
									Tiền đã thu chưa phân bổ
								</th>
								<td />
								<td>{money.format(statement.unallocated)}</td>
								<td>Đến ngày {formatDateOnly(statement.through)}</td>
							</tr>
							<tr>
								<th scope="row" colSpan={2}>
									Công nợ thuần cuối kỳ
								</th>
								<td>{money.format(statement.net)}</td>
								<td />
								<td>{statement.net < 0 ? "Khách hàng dư có" : ""}</td>
							</tr>
						</>
					)}
				</tbody>
			</table>
			<div className="report-notes">
				<p>
					<strong>Bằng chữ</strong> · {statementBalanceInWords(statement)}
				</p>
				<p>{statementCoverage(statement)}</p>
				{seller.contact && <p>{seller.contact}</p>}
				<p>{statementConfirmation}</p>
			</div>
			<footer className="report-signatures">
				<p className="report-issue-date">{statementIssueDate(issuedOn)}</p>
				<div>
					<strong>{statementSignatures[0]}</strong>
					<p>Ký, ghi rõ họ tên và đóng dấu</p>
				</div>
				<div>
					<strong>{statementSignatures[1]}</strong>
					<p>{seller.signatoryTitle || "Ký, ghi rõ họ tên và đóng dấu"}</p>
					{seller.signatory && (
						<strong className="report-signatory-name">
							{seller.signatory}
						</strong>
					)}
				</div>
			</footer>
		</article>
	);
}
