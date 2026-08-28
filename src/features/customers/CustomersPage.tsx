import { Download, FileUp, LoaderCircle, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
	Customer,
	CustomerDraft,
	DiscountRecipient,
	RecipientDraft,
} from "../../domain/customers/customer.model";
import { currentAssignment } from "../../domain/customers/customer.selectors";
import { CustomerDeleteDialog } from "./CustomerDeleteDialog";
import { CustomerDetailDrawer } from "./CustomerDetailDrawer";
import { CustomerFormDrawer } from "./CustomerFormDrawer";
import { CustomerImportDialog } from "./CustomerImportDialog";
import { CustomerPolicyDialog } from "./CustomerPolicyDialog";
import { RecipientFormDialog } from "./RecipientFormDialog";
import { CustomerStats } from "./components/CustomerStats";
import {
	CustomerDirectoryPanel,
	type GroupFilter,
	type StatusFilter,
} from "./components/CustomerDirectoryPanel";
import { exportCustomers } from "./customer.export";
import {
	parseCustomerWorkbook,
	type CustomerImportPreview,
} from "./customer.import";
import { useCustomers } from "./useCustomers";
import { useCustomerPolicies } from "./useCustomerPolicies";
import { usePagination } from "../../shared/hooks/usePagination";
import { formatDateOnly } from "../../shared/lib/date";
import { PolicyDeleteDialog } from "../../shared/ui/PolicyDeleteDialog";

export function CustomersPage() {
	const {
		customers,
		salesEmployees,
		saveCustomer,
		saveRecipient,
		importCustomers,
		deleteCustomer,
	} = useCustomers();
	const {
		catalog: productCatalog,
		savePolicy,
		changePolicyStatus,
		deletePolicy,
	} = useCustomerPolicies();
	const importInputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [group, setGroup] = useState<GroupFilter>("all");
	const [status, setStatus] = useState<StatusFilter>("all");
	const [province, setProvince] = useState("all");
	const [employee, setEmployee] = useState("all");
	const [detailCustomerId, setDetailCustomerId] = useState<string>();
	const [formCustomer, setFormCustomer] = useState<Customer | null>();
	const [formOpen, setFormOpen] = useState(false);
	const [recipientEditor, setRecipientEditor] = useState<{
		customerId: string;
		recipient?: DiscountRecipient;
	}>();
	const [policyEditor, setPolicyEditor] = useState<{
		customerId: string;
		policyId?: string;
	}>();
	const [deleteCustomerId, setDeleteCustomerId] = useState<string>();
	const [deletePolicyId, setDeletePolicyId] = useState<string>();
	const [importPreview, setImportPreview] = useState<CustomerImportPreview>();
	const [importLoading, setImportLoading] = useState(false);
	const [notice, setNotice] = useState("");

	const filteredCustomers = useMemo(
		() =>
			customers.filter((customer) => {
				const assignment = currentAssignment(customer);
				const searchable =
					`${customer.misaCode} ${customer.name} ${customer.taxCode} ${customer.province} ${assignment?.employeeName ?? ""} ${customer.recipients.map((item) => item.fullName).join(" ")}`.toLowerCase();
				return (
					searchable.includes(query.trim().toLowerCase()) &&
					(group === "all" || customer.group === group) &&
					(status === "all" || customer.status === status) &&
					(province === "all" || customer.province === province) &&
					(employee === "all" || assignment?.employeeId === employee)
				);
			}),
		[customers, employee, group, province, query, status],
	);
	const detailCustomer = detailCustomerId
		? customers.find((item) => item.id === detailCustomerId)
		: undefined;
	const customerToDelete = deleteCustomerId
		? customers.find((item) => item.id === deleteCustomerId)
		: undefined;
	const policyEditorCustomer = policyEditor
		? customers.find((item) => item.id === policyEditor.customerId)
		: undefined;
	const policyToEdit = policyEditor?.policyId
		? productCatalog.policies.find((item) => item.id === policyEditor.policyId)
		: undefined;
	const policyToDelete = deletePolicyId
		? productCatalog.policies.find((item) => item.id === deletePolicyId)
		: undefined;
	const productForPolicyDelete = policyToDelete
		? productCatalog.products.find(
				(item) => item.id === policyToDelete.productId,
			)
		: undefined;
	const provinceOptions = useMemo(
		() =>
			[...new Set(customers.map((customer) => customer.province))].sort(
				(a, b) => a.localeCompare(b, "vi"),
			),
		[customers],
	);
	const filtersActive = Boolean(
		query ||
			group !== "all" ||
			status !== "all" ||
			province !== "all" ||
			employee !== "all",
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
	const filterKey = `${employee}|${group}|${province}|${query}|${status}`;

	useEffect(() => {
		void filterKey;
		resetPage();
	}, [filterKey, resetPage]);

	const showNotice = (message: string) => {
		setNotice(message);
		window.setTimeout(() => setNotice(""), 2600);
	};
	const resetFilters = () => {
		setQuery("");
		setGroup("all");
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
	const handleSave = (draft: CustomerDraft, customerId?: string) => {
		const saved = saveCustomer(draft, customerId);
		if (saved)
			showNotice(
				customerId
					? "Đã cập nhật hồ sơ khách hàng."
					: "Đã thêm khách hàng mới.",
			);
		return saved;
	};
	const handleRecipientSave = (draft: RecipientDraft, recipientId?: string) => {
		if (!recipientEditor) return false;
		const saved = saveRecipient(recipientEditor.customerId, draft, recipientId);
		if (saved)
			showNotice(
				recipientId
					? "Đã cập nhật người nhận chiết khấu."
					: "Đã thêm người nhận chiết khấu.",
			);
		return saved;
	};
	const handleImportFile = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		setImportLoading(true);
		try {
			setImportPreview(await parseCustomerWorkbook(file, customers));
		} catch (error) {
			showNotice(
				error instanceof Error
					? error.message
					: "Không thể đọc file Excel đã chọn.",
			);
		} finally {
			setImportLoading(false);
		}
	};

	return (
		<div className="page-stack customers-page">
			{notice && (
				<div className="settings-toast" role="status">
					{notice}
				</div>
			)}
			<section className="section-actions customer-page-head">
				<div>
					<h2>Danh mục khách hàng</h2>
					<p>
						Quản lý khoa học theo nhóm, tỉnh/thành, nhân viên phụ trách và người
						nhận chiết khấu.
					</p>
				</div>
				<div>
					<button
						className="button secondary"
						type="button"
						onClick={() => exportCustomers(filteredCustomers)}
					>
						<Download size={16} /> Xuất danh mục
					</button>
					<button
						className="button secondary"
						type="button"
						disabled={importLoading}
						onClick={() => importInputRef.current?.click()}
					>
						{importLoading ? (
							<LoaderCircle className="spin" size={16} />
						) : (
							<FileUp size={16} />
						)}{" "}
						{importLoading ? "Đang đọc file..." : "Nhập Excel"}
					</button>
					<input
						ref={importInputRef}
						className="customer-import-input"
						type="file"
						accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
						onChange={handleImportFile}
					/>
					<button className="button primary" type="button" onClick={openCreate}>
						<UserPlus size={16} /> Thêm khách hàng
					</button>
				</div>
			</section>
			<CustomerStats customers={customers} />
			<CustomerDirectoryPanel
				customers={pagedCustomers}
				filteredCount={filteredCustomers.length}
				totalCount={customers.length}
				currentPage={currentPage}
				pageCount={pageCount}
				pageSize={pageSize}
				employees={salesEmployees}
				provinces={provinceOptions}
				query={query}
				group={group}
				province={province}
				employee={employee}
				status={status}
				filtersActive={filtersActive}
				onQueryChange={setQuery}
				onGroupChange={setGroup}
				onProvinceChange={setProvince}
				onEmployeeChange={setEmployee}
				onStatusChange={setStatus}
				onReset={resetFilters}
				onOpen={setDetailCustomerId}
				onPageChange={setCurrentPage}
				onPageSizeChange={setPageSize}
			/>

			{detailCustomer && (
				<CustomerDetailDrawer
					customer={detailCustomer}
					onClose={() => setDetailCustomerId(undefined)}
					onEdit={() => openEdit(detailCustomer)}
					onDelete={() => setDeleteCustomerId(detailCustomer.id)}
					onAddRecipient={() =>
						setRecipientEditor({ customerId: detailCustomer.id })
					}
					onEditRecipient={(recipientId) =>
						setRecipientEditor({
							customerId: detailCustomer.id,
							recipient: detailCustomer.recipients.find(
								(item) => item.id === recipientId,
							),
						})
					}
					productCatalog={productCatalog}
					onAddPolicy={() => setPolicyEditor({ customerId: detailCustomer.id })}
					onChangePolicy={(policyId) =>
						setPolicyEditor({ customerId: detailCustomer.id, policyId })
					}
					onTogglePolicy={(policyId) => {
						try {
							changePolicyStatus(policyId);
							showNotice("Đã cập nhật trạng thái chính sách.");
						} catch (error) {
							showNotice(
								error instanceof Error
									? error.message
									: "Không thể cập nhật chính sách.",
							);
						}
					}}
					onDeletePolicy={setDeletePolicyId}
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
			{recipientEditor && (
				<RecipientFormDialog
					key={recipientEditor.recipient?.id ?? "new-recipient"}
					recipient={recipientEditor.recipient}
					hasActiveRecipients={Boolean(
						customers
							.find((item) => item.id === recipientEditor.customerId)
							?.recipients.some((item) => item.active),
					)}
					onClose={() => setRecipientEditor(undefined)}
					onSave={handleRecipientSave}
				/>
			)}
			{policyEditorCustomer && (
				<CustomerPolicyDialog
					key={policyToEdit?.id ?? `new-policy-${policyEditorCustomer.id}`}
					customer={policyEditorCustomer}
					products={productCatalog.products}
					policy={policyToEdit}
					onClose={() => setPolicyEditor(undefined)}
					onSave={(draft) => {
						savePolicy(draft, policyToEdit?.id);
						showNotice(
							policyToEdit
								? "Đã tạo phiên bản chính sách mới."
								: "Đã thêm chính sách cho mặt hàng.",
						);
					}}
				/>
			)}
			{importPreview && (
				<CustomerImportDialog
					preview={importPreview}
					onClose={() => setImportPreview(undefined)}
					onConfirm={() => {
						const readyRows = importPreview.rows.filter(
							(row) => row.status === "ready",
						);
						if (importCustomers(readyRows.map((row) => row.draft))) {
							setImportPreview(undefined);
							showNotice(`Đã nhập ${readyRows.length} khách hàng từ Excel.`);
						}
					}}
				/>
			)}
			{customerToDelete && (
				<CustomerDeleteDialog
					customer={customerToDelete}
					onClose={() => setDeleteCustomerId(undefined)}
					onConfirm={() => {
						const removedName = customerToDelete.name;
						if (deleteCustomer(customerToDelete.id)) {
							setDeleteCustomerId(undefined);
							setDetailCustomerId(undefined);
							showNotice(`Đã xóa khách hàng ${removedName}.`);
						}
					}}
				/>
			)}
			{policyToDelete && (
				<PolicyDeleteDialog
					policyName={
						productForPolicyDelete?.name ?? "Mặt hàng không còn trong danh mục"
					}
					context={`${detailCustomer?.misaCode ?? ""} · ${detailCustomer?.name ?? "Khách hàng"}`}
					details={`Hiệu lực ${formatDateOnly(policyToDelete.effectiveFrom)} – ${formatDateOnly(policyToDelete.effectiveTo, "không thời hạn")}`}
					onClose={() => setDeletePolicyId(undefined)}
					onConfirm={() => {
						deletePolicy(policyToDelete.id);
						setDeletePolicyId(undefined);
						showNotice("Đã xóa chính sách chiết khấu.");
					}}
				/>
			)}
		</div>
	);
}
