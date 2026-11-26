import { useTransientNotice } from "../../shared/hooks/useTransientNotice";
import { Notice } from "../../shared/ui/Notice";
import {
	Building2,
	Download,
	FileSpreadsheet,
	FileUp,
	LoaderCircle,
	UserPlus,
} from "lucide-react";
import {
	useDeferredValue,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type {
	Customer,
	CustomerDraft,
} from "../../domain/customers/customer.model";
import { currentAssignment } from "../../domain/customers/customer.selectors";
import { CustomerDeleteDialog } from "./CustomerDeleteDialog";
import { CustomerDetailDrawer } from "./CustomerDetailDrawer";
import { CustomerFormDrawer } from "./CustomerFormDrawer";
import { CustomerImportDialog } from "./CustomerImportDialog";
import {
	CustomerDirectoryPanel,
	type StatusFilter,
} from "./components/CustomerDirectoryPanel";
import { exportCustomers } from "./customer.export";
import {
	parseCustomerWorkbook,
	type CustomerImportPreview,
} from "./customer.import";
import { useCustomers } from "./useCustomers";
import { usePagination } from "../../shared/hooks/usePagination";

export function CustomersPage({
	showEmployeeFilter,
}: {
	showEmployeeFilter: boolean;
}) {
	const {
		customers,
		salesEmployees,
		loading,
		error: loadError,
		saveCustomer,
		importCustomers,
		deleteCustomer,
	} = useCustomers();
	const importInputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	// Ô tìm kiếm cập nhật ngay; danh sách lọc lại sau đó để gõ phím không bị khựng.
	const searchQuery = useDeferredValue(query);
	const [status, setStatus] = useState<StatusFilter>("all");
	const [province, setProvince] = useState("all");
	const [selectedEmployee, setEmployee] = useState("all");
	const employee = showEmployeeFilter ? selectedEmployee : "all";
	const [detailCustomerId, setDetailCustomerId] = useState<string>();
	const [formCustomer, setFormCustomer] = useState<Customer | null>();
	const [formOpen, setFormOpen] = useState(false);
	const [deleteCustomerId, setDeleteCustomerId] = useState<string>();
	const [importPreview, setImportPreview] = useState<CustomerImportPreview>();
	const [importLoading, setImportLoading] = useState(false);
	const [exportLoading, setExportLoading] = useState(false);
	const { notice, showNotice, dismissNotice } = useTransientNotice(2600);

	const searchableCustomers = useMemo(
		() =>
			customers.map((customer) => {
				const assignment = currentAssignment(customer);
				return {
					customer,
					employeeId: assignment?.employeeId,
					searchText:
						`${customer.misaCode} ${customer.name} ${customer.taxCode} ${customer.province} ${assignment?.employeeName ?? ""}`.toLowerCase(),
				};
			}),
		[customers],
	);
	const filteredCustomers = useMemo(() => {
		const needle = searchQuery.trim().toLowerCase();
		return searchableCustomers
			.filter(
				({ customer, employeeId, searchText }) =>
					searchText.includes(needle) &&
					(status === "all" || customer.status === status) &&
					(province === "all" || customer.province === province) &&
					(employee === "all" || employeeId === employee),
			)
			.map(({ customer }) => customer);
	}, [searchableCustomers, employee, province, searchQuery, status]);
	const detailCustomer = detailCustomerId
		? customers.find((item) => item.id === detailCustomerId)
		: undefined;
	const customerToDelete = deleteCustomerId
		? customers.find((item) => item.id === deleteCustomerId)
		: undefined;
	const provinceOptions = useMemo(
		() =>
			[...new Set(customers.map((customer) => customer.province))].sort(
				(a, b) => a.localeCompare(b, "vi"),
			),
		[customers],
	);
	const filtersActive = Boolean(
		query || status !== "all" || province !== "all" || employee !== "all",
	);
	const {
		currentPage,
		pageCount,
		pageSize,
		pageItems: pagedCustomers,
		setCurrentPage,
		setPageSize,
		resetPage,
	} = usePagination(filteredCustomers);
	const filterKey = `${employee}|${province}|${searchQuery}|${status}`;

	useLayoutEffect(() => {
		void filterKey;
		resetPage();
	}, [filterKey, resetPage]);

	const resetFilters = () => {
		setQuery("");
		setStatus("all");
		setProvince("all");
		setEmployee("all");
		resetPage();
	};
	const openCreate = () => {
		setFormCustomer(null);
		setFormOpen(true);
	};
	const openEdit = (customer: Customer) => {
		setDetailCustomerId(undefined);
		setFormCustomer(customer);
		setFormOpen(true);
	};
	const handleSave = async (draft: CustomerDraft, customerId?: string) => {
		try {
			const saved = await saveCustomer(
				draft,
				customerId ? (formCustomer ?? undefined) : undefined,
			);
			if (saved)
				showNotice(
					customerId
						? "Đã cập nhật hồ sơ khách hàng."
						: "Đã thêm khách hàng mới.",
				);
			return saved;
		} catch (error) {
			return error instanceof Error
				? error.message
				: "Không thể kiểm tra sổ đối soát trước khi lưu.";
		}
	};
	const handleExport = async () => {
		if (exportLoading || !filteredCustomers.length) return;
		setExportLoading(true);
		try {
			await exportCustomers(filteredCustomers, salesEmployees);
		} catch (error) {
			showNotice(
				error instanceof Error
					? error.message
					: "Không thể xuất danh mục Excel.",
				undefined,
				"danger",
			);
		} finally {
			setExportLoading(false);
		}
	};
	const handleImportFile = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		setImportLoading(true);
		try {
			setImportPreview(
				await parseCustomerWorkbook(file, customers, {
					employees: salesEmployees,
					canImportAssignments: showEmployeeFilter,
				}),
			);
		} catch (error) {
			showNotice(
				error instanceof Error
					? error.message
					: "Không thể đọc file Excel đã chọn.",
				undefined,
				"danger",
			);
		} finally {
			setImportLoading(false);
		}
	};

	if (loadError)
		return (
			<Notice tone="danger" announce>
				{loadError}
			</Notice>
		);
	if (loading)
		return (
			<p className="panel empty-state" role="status">
				Đang tải danh mục…
			</p>
		);

	return (
		<div className="page-stack customers-page">
			{notice && (
				<Notice tone={notice.tone} floating announce onDismiss={dismissNotice}>
					{notice.text}
				</Notice>
			)}
			<section className="section-actions customer-page-head">
				<div className="customer-page-title">
					<div className="data-source-icon" aria-hidden="true">
						<Building2 className="icon-size-22" />
					</div>
					<h2>Danh mục khách hàng</h2>
				</div>
				<div>
					<button
						className="button secondary"
						type="button"
						disabled={exportLoading || filteredCustomers.length === 0}
						title="Xuất danh mục ra Excel (.xlsx)"
						onClick={() => void handleExport()}
					>
						{exportLoading ? (
							<LoaderCircle className="spin icon-size-16" />
						) : (
							<Download className="icon-size-16" />
						)}{" "}
						{exportLoading ? "Đang xuất…" : "Xuất danh mục"}
					</button>
					<button
						className="button secondary"
						type="button"
						disabled={importLoading}
						onClick={() => importInputRef.current?.click()}
					>
						{importLoading ? (
							<LoaderCircle className="spin icon-size-16" />
						) : (
							<FileUp className="icon-size-16" />
						)}{" "}
						{importLoading ? "Đang đọc file..." : "Nhập Excel"}
					</button>
					<input
						ref={importInputRef}
						className="customer-import-input"
						type="file"
						accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
						onChange={handleImportFile}
					/>
					<button className="button primary" type="button" onClick={openCreate}>
						<UserPlus className="icon-size-16" /> Thêm khách hàng
					</button>
				</div>
			</section>
			{customers.length === 0 ? (
				<section className="panel catalog-empty-state">
					<div className="catalog-empty-icon">
						<FileSpreadsheet className="icon-size-27" />
					</div>
					<h2>Chưa có dữ liệu khách hàng</h2>
					<p>
						Thêm khách hàng hoặc nhập danh mục từ Excel để tra cứu theo mã MISA.
					</p>
					<button
						className="button secondary"
						type="button"
						disabled={importLoading}
						onClick={() => importInputRef.current?.click()}
					>
						{importLoading ? (
							<LoaderCircle className="spin icon-size-16" />
						) : (
							<FileUp className="icon-size-16" />
						)}{" "}
						{importLoading ? "Đang đọc file..." : "Chọn file Excel"}
					</button>
				</section>
			) : (
				<CustomerDirectoryPanel
					customers={pagedCustomers}
					filteredCount={filteredCustomers.length}
					totalCount={customers.length}
					currentPage={currentPage}
					pageCount={pageCount}
					pageSize={pageSize}
					showEmployeeFilter={showEmployeeFilter}
					employees={salesEmployees}
					provinces={provinceOptions}
					query={query}
					province={province}
					employee={employee}
					status={status}
					filtersActive={filtersActive}
					filterKey={filterKey}
					onQueryChange={setQuery}
					onProvinceChange={setProvince}
					onEmployeeChange={setEmployee}
					onStatusChange={setStatus}
					onReset={resetFilters}
					onOpen={setDetailCustomerId}
					onPageChange={setCurrentPage}
					onPageSizeChange={setPageSize}
				/>
			)}

			{detailCustomer && (
				<CustomerDetailDrawer
					customer={detailCustomer}
					onClose={() => setDetailCustomerId(undefined)}
					onEdit={() => openEdit(detailCustomer)}
					onDelete={() => setDeleteCustomerId(detailCustomer.id)}
				/>
			)}
			{formOpen && (
				<CustomerFormDrawer
					key={formCustomer?.id ?? "new"}
					customer={formCustomer ?? undefined}
					customers={customers}
					onClose={() => setFormOpen(false)}
					onSave={handleSave}
				/>
			)}
			{importPreview && (
				<CustomerImportDialog
					preview={importPreview}
					busy={importLoading}
					onClose={() => setImportPreview(undefined)}
					onConfirm={async () => {
						if (importLoading) return;
						const importableRows = importPreview.rows.filter(
							(row) => row.status === "ready",
						);
						setImportLoading(true);
						try {
							await importCustomers(importableRows.map((row) => row.draft));
							setImportPreview(undefined);
							showNotice(`Đã thêm ${importPreview.readyCount} khách hàng.`);
						} catch (reason) {
							showNotice(
								reason instanceof Error
									? reason.message
									: "Không thể nhập khách hàng.",
								6000,
								"danger",
							);
						} finally {
							setImportLoading(false);
						}
					}}
				/>
			)}
			{customerToDelete && (
				<CustomerDeleteDialog
					customer={customerToDelete}
					onClose={() => setDeleteCustomerId(undefined)}
					onConfirm={async () => {
						const removedName = customerToDelete.name;
						try {
							if (await deleteCustomer(customerToDelete)) {
								setDeleteCustomerId(undefined);
								setDetailCustomerId(undefined);
								showNotice(`Đã xóa khách hàng ${removedName}.`);
							}
						} catch (error) {
							setDeleteCustomerId(undefined);
							showNotice(
								error instanceof Error
									? error.message
									: "Không thể xóa khách hàng.",
								6000,
								"danger",
							);
						}
					}}
				/>
			)}
		</div>
	);
}
