import { Download, History, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { pageControls, useServerData } from "../../shared/hooks/useServerData";
import { formatTimestamp } from "../../shared/lib/date";
import {
	type ActivityEntry,
	type ActivityPage as ActivityPageData,
	activityCategories,
	activityResource,
	readActivitiesForExport,
	subscribeActivities,
} from "../../shared/storage/activityLog";
import { Notice } from "../../shared/ui/Notice";
import { PaginationControls } from "../../shared/ui/Pagination/PaginationControls";

const searchDelay = 250;
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
	const [query, setQuery] = useState("");
	const [filters, setFilters] = useState({
		q: "",
		actor: "",
		category: "",
		page: 1,
	});
	const [exporting, setExporting] = useState(false);
	const [exportError, setExportError] = useState("");
	const search = query.trim();
	// Gõ tìm kiếm cập nhật ngay trong ô; máy chủ chỉ được hỏi khi người dùng ngừng gõ.
	useEffect(() => {
		if (search === filters.q) return;
		const timer = window.setTimeout(
			() => setFilters((current) => ({ ...current, q: search, page: 1 })),
			searchDelay,
		);
		return () => window.clearTimeout(timer);
	}, [search, filters.q]);
	const response = useServerData<ActivityPageData>(activityResource(filters));
	const { refresh } = response;
	useEffect(() => subscribeActivities(refresh), [refresh]);
	const data = response.data ?? response.previous;
	const error = response.error ?? "";
	const rows = data?.items ?? [];
	const total = data?.total ?? 0;
	const currentPage = data?.page ?? filters.page;
	const pagination = pageControls(currentPage, data?.limit ?? 25, total);
	const { actor, category } = filters;
	const setFilter = (change: Partial<typeof filters>) =>
		setFilters((current) => ({ ...current, ...change, page: 1 }));

	async function exportFiltered() {
		setExporting(true);
		setExportError("");
		try {
			exportActivity(
				await readActivitiesForExport({ q: filters.q, actor, category }),
			);
		} catch (reason) {
			setExportError(
				reason instanceof Error ? reason.message : "Không thể xuất nhật ký.",
			);
		} finally {
			setExporting(false);
		}
	}

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
					disabled={Boolean(error) || !total || exporting}
					onClick={() => void exportFiltered()}
				>
					<Download className="icon-size-16" aria-hidden="true" /> Xuất CSV
				</button>
			</section>
			{exportError && (
				<Notice tone="danger" announce>
					{exportError}
				</Notice>
			)}
			<section className="panel data-panel" aria-label="Nhật ký sử dụng">
				<div className="data-toolbar activity-filters">
					<label className="table-search">
						<Search className="icon-size-16" aria-hidden="true" />
						<input
							type="search"
							aria-label="Tìm thao tác hoặc chi tiết"
							placeholder="Tìm thao tác hoặc chi tiết"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
						/>
					</label>
					<select
						aria-label="Người thực hiện"
						value={actor}
						onChange={(event) => setFilter({ actor: event.target.value })}
					>
						<option value="">Tất cả người dùng</option>
						{(data?.actors ?? []).map(([id, name]) => (
							<option key={id} value={id}>
								{name}
							</option>
						))}
					</select>
					<select
						aria-label="Nhóm thao tác"
						value={category}
						onChange={(event) => setFilter({ category: event.target.value })}
					>
						<option value="">Tất cả thao tác</option>
						{Object.entries(activityCategories).map(([key, label]) => (
							<option key={key} value={key}>
								{label}
							</option>
						))}
					</select>
				</div>
				{error ? (
					<div className="activity-message">
						<Notice tone="danger" announce>
							{error}
						</Notice>
						<button
							className="button secondary"
							type="button"
							onClick={refresh}
						>
							Thử lại
						</button>
					</div>
				) : data === undefined ? (
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
									{rows.map((row) => (
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
									{!rows.length && (
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
								{total} thao tác
							</span>
							<PaginationControls
								currentPage={currentPage}
								pageCount={pagination.pageCount}
								onPageChange={(page) =>
									setFilters((current) => ({ ...current, page }))
								}
								disabled={response.loading}
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
