import { Download, History, Search } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { normalizeVietnamese } from "../../domain/customers/customer.province";
import { usePagination } from "../../shared/hooks/usePagination";
import { formatTimestamp, localDateToIso } from "../../shared/lib/date";
import {
	activityCategories,
	type ActivityEntry,
	readActivities,
	subscribeActivities,
} from "../../shared/storage/activityLog";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { Notice } from "../../shared/ui/Notice";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";

const time = new Intl.DateTimeFormat("vi-VN", {
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hourCycle: "h23",
});

function entryTime(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? "—"
		: `${formatTimestamp(value)} ${time.format(date)}`;
}

function csvCell(value: string) {
	const safe = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(value)
		? `'${value}`
		: value;
	return `"${safe.replaceAll('"', '""')}"`;
}

function exportActivity(rows: ActivityEntry[]) {
	const values = [
		["Thời điểm", "Người thực hiện", "Nhóm thao tác", "Thao tác", "Chi tiết"],
		...rows.map((row) => [
			entryTime(row.time),
			row.actorName,
			activityCategories[row.category] ?? row.category,
			row.action,
			row.detail,
		]),
	];
	const csv = `\uFEFF${values.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
	const url = URL.createObjectURL(
		new Blob([csv], { type: "text/csv;charset=utf-8" }),
	);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = "nhat-ky-su-dung.csv";
	anchor.click();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ActivityPage() {
	const [entries, setEntries] = useState<ActivityEntry[]>();
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	// Ô tìm kiếm cập nhật ngay; danh sách lọc lại sau đó để gõ phím không bị khựng.
	const searchQuery = useDeferredValue(query);
	const [actor, setActor] = useState("");
	const [category, setCategory] = useState("");
	const [from, setFrom] = useState("");
	const [through, setThrough] = useState("");
	const refresh = useRef<() => void>(() => undefined);

	useEffect(() => {
		let request = 0;
		const read = () => {
			const pending = ++request;
			void readActivities()
				.then((result) => {
					if (request !== pending) return;
					setEntries(result);
					setError("");
				})
				.catch((reason: unknown) => {
					if (request === pending)
						setError(
							reason instanceof Error
								? reason.message
								: "Không thể đọc nhật ký.",
						);
				});
		};
		refresh.current = read;
		const unsubscribe = subscribeActivities(read);
		read();
		return () => {
			request += 1;
			unsubscribe();
		};
	}, []);

	const actors = new Map<string, string>();
	for (const row of entries ?? []) {
		if (!actors.has(row.actorId)) actors.set(row.actorId, row.actorName);
	}
	const invalidDates = Boolean(from && through && through < from);
	const needle = normalizeVietnamese(searchQuery);
	const filtered = invalidDates
		? []
		: (entries ?? []).filter((row) => {
				const date = localDateToIso(new Date(row.time));
				return (
					(!actor || row.actorId === actor) &&
					(!category || row.category === category) &&
					(!from || date >= from) &&
					(!through || date <= through) &&
					normalizeVietnamese(
						`${row.actorName} ${row.action} ${row.detail}`,
					).includes(needle)
				);
			});
	const pagination = usePagination(filtered);

	return (
		<div className="page-stack">
			<section
				className="panel data-source-card"
				aria-labelledby="activity-heading"
			>
				<div className="data-source-icon" aria-hidden="true">
					<History className="icon-size-22" />
				</div>
				<div className="data-source-copy">
					<h2 id="activity-heading">Lịch sử thao tác</h2>
				</div>
				<button
					className="button secondary"
					type="button"
					disabled={Boolean(error) || !filtered.length}
					onClick={() => exportActivity(filtered)}
				>
					<Download className="icon-size-16" aria-hidden="true" /> Xuất CSV
				</button>
			</section>
			<section className="panel data-panel" aria-label="Nhật ký sử dụng">
				<div className="data-toolbar activity-filters">
					<label className="table-search">
						<Search className="icon-size-16" aria-hidden="true" />
						<input
							type="search"
							aria-label="Tìm thao tác hoặc chi tiết"
							placeholder="Tìm thao tác hoặc chi tiết"
							value={query}
							onChange={(event) => {
								setQuery(event.target.value);
								pagination.resetPage();
							}}
						/>
					</label>
					<select
						aria-label="Người thực hiện"
						value={actor}
						onChange={(event) => {
							setActor(event.target.value);
							pagination.resetPage();
						}}
					>
						<option value="">Tất cả người dùng</option>
						{[...actors]
							.sort((a, b) => a[1].localeCompare(b[1], "vi"))
							.map(([id, name]) => (
								<option key={id} value={id}>
									{name}
								</option>
							))}
					</select>
					<select
						aria-label="Nhóm thao tác"
						value={category}
						onChange={(event) => {
							setCategory(event.target.value);
							pagination.resetPage();
						}}
					>
						<option value="">Tất cả thao tác</option>
						{Object.entries(activityCategories).map(([key, label]) => (
							<option key={key} value={key}>
								{label}
							</option>
						))}
					</select>
					<div className="ui-field activity-date">
						<label htmlFor="activity-from">Từ ngày</label>
						<DateInput
							id="activity-from"
							ariaLabel="Từ ngày"
							value={from}
							onChange={(date) => {
								setFrom(date);
								pagination.resetPage();
							}}
						/>
					</div>
					<div className="ui-field activity-date">
						<label htmlFor="activity-through">Đến ngày</label>
						<DateInput
							id="activity-through"
							ariaLabel="Đến ngày"
							value={through}
							onChange={(date) => {
								setThrough(date);
								pagination.resetPage();
							}}
						/>
					</div>
				</div>
				{error ? (
					<div className="activity-message">
						<Notice tone="danger" announce>
							{error}
						</Notice>
						<button
							className="button secondary"
							type="button"
							onClick={() => refresh.current()}
						>
							Thử lại
						</button>
					</div>
				) : invalidDates ? (
					<div className="activity-message">
						<Notice tone="warning" announce>
							Từ ngày phải bằng hoặc trước Đến ngày.
						</Notice>
					</div>
				) : entries === undefined ? (
					<p className="empty-state" role="status">
						Đang đọc nhật ký…
					</p>
				) : (
					<>
						<div className="table-scroll table-scroll-auto-gutter access-table activity-table">
							<table>
								<thead>
									<tr>
										<th scope="col">Thời điểm</th>
										<th scope="col">Người thực hiện</th>
										<th scope="col">Nhóm</th>
										<th scope="col">Thao tác</th>
										<th scope="col">Chi tiết</th>
									</tr>
								</thead>
								<tbody>
									{pagination.pageItems.map((row) => (
										<tr key={row.id}>
											<td>{entryTime(row.time)}</td>
											<td>{row.actorName}</td>
											<td>
												{activityCategories[row.category] ?? row.category}
											</td>
											<td>
												<strong>{row.action}</strong>
											</td>
											<td>{row.detail || "—"}</td>
										</tr>
									))}
									{!filtered.length && (
										<tr>
											<td className="empty-state" colSpan={5}>
												Không có thao tác phù hợp.
											</td>
										</tr>
									)}
								</tbody>
							</table>
						</div>
						<footer className="access-table-footer">
							<span>
								{pagination.firstVisible}–{pagination.lastVisible} /{" "}
								{filtered.length} thao tác
							</span>
							<PaginationControls
								currentPage={pagination.currentPage}
								pageCount={pagination.pageCount}
								onPageChange={pagination.setCurrentPage}
								previousLabel="Trang nhật ký trước"
								nextLabel="Trang nhật ký sau"
							/>
						</footer>
					</>
				)}
			</section>
		</div>
	);
}
