import { Download, Printer } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeVietnamese } from "../../domain/customers/customer.province";
import { readCustomers } from "../../domain/customers/customer.repository";
import { readMisaSalesBook } from "../../domain/misa/misa.sales-book.repository";
import {
	readReceiptLedger,
	subscribeReceiptLedger,
} from "../../domain/payments/receipt-ledger.repository";
import type { AppSettings } from "../../domain/settings/settings.model";
import { useTransientNotice } from "../../shared/hooks/useTransientNotice";
import { isIsoDate, todayLocal } from "../../shared/lib/date";
import { sameJson } from "../../shared/lib/sameJson";
import {
	captureActivity,
	recordActivity,
} from "../../shared/storage/activityLog";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { Notice } from "../../shared/ui/Notice";
import { SearchableInput } from "../../shared/ui/SearchableInput";
import { downloadStatementWorkbook } from "./report.export";
import { buildReceivableStatement, statementSeller } from "./report.model";
import { StatementDocument } from "./StatementDocument";

type ReportData = {
	book: Awaited<ReturnType<typeof readMisaSalesBook>>;
	ledger: Awaited<ReturnType<typeof readReceiptLedger>>;
	customers: Awaited<ReturnType<typeof readCustomers>>;
};

export function ReportsPage({
	settings,
	onOpenMisa,
}: {
	settings: AppSettings;
	onOpenMisa?: () => void;
}) {
	const [data, setData] = useState<ReportData>();
	const [error, setError] = useState("");
	const [exporting, setExporting] = useState(false);
	const [selectedCustomer, setSelectedCustomer] = useState("");
	const [from, setFrom] = useState(() => `${todayLocal().slice(0, 7)}-01`);
	const [through, setThrough] = useState(todayLocal);
	const request = useRef(0);
	const { notice, showNotice, dismissNotice } = useTransientNotice(4500);
	const issuedOn = todayLocal();

	const refresh = useCallback(() => {
		const pending = ++request.current;
		void Promise.all([
			readMisaSalesBook(),
			readReceiptLedger(),
			readCustomers(),
		])
			.then(([book, ledger, customers]) => {
				if (pending !== request.current) return;
				// Sổ chưa đổi thì giữ nguyên dữ liệu cũ để không tính lại khi chọn lại cửa sổ.
				setData((previous) =>
					previous?.book === book &&
					previous.ledger === ledger &&
					sameJson(previous.customers, customers)
						? previous
						: { book, ledger, customers },
				);
				setError("");
			})
			.catch((reason: unknown) => {
				if (pending !== request.current) return;
				setError(
					reason instanceof Error
						? reason.message
						: "Không thể tải dữ liệu báo cáo.",
				);
			});
	}, []);

	useEffect(() => {
		const unsubscribe = subscribeReceiptLedger(refresh);
		window.addEventListener("focus", refresh);
		refresh();
		return () => {
			request.current += 1;
			unsubscribe();
			window.removeEventListener("focus", refresh);
		};
	}, [refresh]);

	const { customersByLabel, options } = useMemo(() => {
		const byLabel = new Map<string, ReportData["customers"][number] | null>();
		for (const customer of data?.customers ?? []) {
			const label = [customer.misaCode, customer.name, customer.taxCode]
				.filter(Boolean)
				.join(" · ");
			if (label) byLabel.set(label, byLabel.has(label) ? null : customer);
		}
		return {
			customersByLabel: byLabel,
			options: [...byLabel.keys()]
				.filter((label) => byLabel.get(label))
				.sort((a, b) => a.localeCompare(b, "vi")),
		};
	}, [data?.customers]);
	const customer = customersByLabel.get(selectedCustomer);
	const validDates = isIsoDate(from) && isIsoDate(through) && from <= through;
	const statement = useMemo(
		() =>
			data?.book && customer && validDates
				? buildReceivableStatement(
						data.book,
						data.ledger,
						data.customers,
						customer,
						from,
						through,
					)
				: null,
		[customer, data, from, through, validDates],
	);
	const seller = statementSeller(settings);
	const canIssue = Boolean(statement && seller.name);

	async function exportExcel() {
		if (!statement || !canIssue || exporting) return;
		const log = captureActivity();
		setExporting(true);
		dismissNotice();
		try {
			await downloadStatementWorkbook(statement, seller, issuedOn);
			void log(
				"reports",
				"Xuất Excel biên bản đối chiếu",
				`${statement.customer.name} · ${statement.from} – ${statement.through}`,
			);
		} catch (reason) {
			showNotice(
				reason instanceof Error
					? reason.message
					: "Không thể xuất báo cáo Excel.",
				undefined,
				"danger",
			);
		} finally {
			setExporting(false);
		}
	}

	if (error)
		return (
			<div className="page-stack">
				<Notice tone="danger" title="Không thể mở báo cáo" announce>
					{error}
				</Notice>
				<div>
					<button type="button" className="button secondary" onClick={refresh}>
						Thử lại
					</button>
				</div>
			</div>
		);
	if (!data)
		return (
			<p className="panel empty-state" role="status">
				Đang đọc sổ công nợ…
			</p>
		);

	return (
		<div className="page-stack reports-page">
			{notice && (
				<Notice tone={notice.tone} announce onDismiss={dismissNotice}>
					{notice.text}
				</Notice>
			)}
			<section className="panel report-controls" aria-label="Thông tin báo cáo">
				<div className="ui-field report-customer-field">
					<label htmlFor="report-customer">Khách hàng</label>
					<SearchableInput
						id="report-customer"
						label="Khách hàng"
						placeholder="Tìm tên, mã MISA hoặc MST"
						value={selectedCustomer}
						onChange={setSelectedCustomer}
						options={options}
						normalize={normalizeVietnamese}
					/>
				</div>
				<div className="ui-field report-date-field">
					<label htmlFor="report-from">Từ ngày</label>
					<DateInput
						id="report-from"
						ariaLabel="Từ ngày"
						value={from}
						onChange={setFrom}
					/>
				</div>
				<div className="ui-field report-date-field">
					<label htmlFor="report-through">Đến ngày</label>
					<DateInput
						id="report-through"
						ariaLabel="Đến ngày"
						value={through}
						onChange={setThrough}
					/>
				</div>
				<div className="report-actions">
					<button
						type="button"
						className="button secondary"
						disabled={!canIssue}
						onClick={() => {
							if (!statement || !canIssue) return;
							void recordActivity(
								"reports",
								"Mở hộp thoại in biên bản",
								`${statement.customer.name} · ${statement.from} – ${statement.through}`,
							);
							window.print();
						}}
					>
						<Printer className="icon-size-16" aria-hidden="true" /> In / Lưu PDF
					</button>
					<button
						type="button"
						className="button primary"
						disabled={!canIssue || exporting}
						onClick={() => void exportExcel()}
					>
						<Download className="icon-size-16" aria-hidden="true" />{" "}
						{exporting ? "Đang xuất…" : "Xuất Excel"}
					</button>
				</div>
			</section>

			{!data.book ? (
				<div className="panel empty-state report-empty">
					<p>Chưa có sổ bán hàng MISA để lập biên bản.</p>
					{onOpenMisa && (
						<button
							className="button secondary"
							type="button"
							onClick={onOpenMisa}
						>
							Mở Dữ liệu MISA
						</button>
					)}
				</div>
			) : !validDates ? (
				<Notice tone="warning" announce>
					Chọn khoảng thời gian hợp lệ. Từ ngày phải bằng hoặc trước Đến ngày.
				</Notice>
			) : statement ? (
				<>
					{!seller.name && (
						<Notice tone="warning" title="Chưa có thông tin bên bán" announce>
							Nhập tên và địa chỉ công ty trong Cài đặt trước khi in hoặc xuất
							biên bản đối chiếu.
						</Notice>
					)}
					<StatementDocument
						statement={statement}
						seller={seller}
						issuedOn={issuedOn}
					/>
				</>
			) : (
				<p className="panel empty-state">
					Chọn khách hàng để xem biên bản đối chiếu công nợ.
				</p>
			)}
		</div>
	);
}
