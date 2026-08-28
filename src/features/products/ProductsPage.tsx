import {
	AlertTriangle,
	Download,
	FileSpreadsheet,
	PackagePlus,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { formatDateOnly, todayLocal } from "../../shared/lib/date";
import { PolicyDeleteDialog } from "../../shared/ui/PolicyDeleteDialog";
import { queryProductCatalogPage } from "../../domain/products/product.repository";
import { ProductCatalogTable } from "./components/ProductCatalogTable";
import { PolicyFormDialog } from "./PolicyFormDialog";
import { ProductFormDialog } from "./ProductFormDialog";
import { ProductDeleteDialog } from "./ProductDeleteDialog";
import { ProductImportDialog } from "./ProductImportDialog";
import { ProductPolicyDrawer } from "./ProductPolicyDrawer";
import { useProductCatalog } from "./useProductCatalog";
import { exportProductCatalog } from "./product.export";
import {
	parseProductWorkbook,
	type ProductImportPreview,
} from "./product.import";

export function ProductsPage() {
	const {
		revision,
		customers,
		loadCatalog,
		loadProductDetail,
		saveProduct,
		savePolicies,
		importProducts,
		changePolicy,
		changePolicyStatus,
		deletePolicy,
		deleteProduct,
	} = useProductCatalog();
	const importInput = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);
	const [group, setGroup] = useState("all");
	const [currentPage, setCurrentPage] = useState(1);
	const [pageSize, setPageSize] = useState(25);
	const [selectedId, setSelectedId] = useState<string>();
	const [formProductId, setFormProductId] = useState<string | null>();
	const [policyProductId, setPolicyProductId] = useState<string>();
	const [editingPolicyId, setEditingPolicyId] = useState<string>();
	const [importPreview, setImportPreview] = useState<ProductImportPreview>();
	const [importError, setImportError] = useState("");
	const [deleteProductId, setDeleteProductId] = useState<string>();
	const [deletePolicyId, setDeletePolicyId] = useState<string>();
	const today = todayLocal();
	const activeCustomers = customers.filter((item) => item.status === "active");
	const soonDate = useMemo(
		() => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
		[],
	);
	const productPage = useMemo(() => {
		void revision;
		return queryProductCatalogPage({
			query: deferredQuery,
			group,
			page: currentPage,
			pageSize,
			today,
			soonDate,
			activeCustomerCount: activeCustomers.length,
		});
	}, [
		activeCustomers.length,
		currentPage,
		deferredQuery,
		group,
		pageSize,
		revision,
		soonDate,
		today,
	]);
	const customerCoverage = useMemo(
		() => new Map(Object.entries(productPage.coverageByProduct)),
		[productPage.coverageByProduct],
	);
	const { summary } = productPage;
	const filterKey = `${group}|${query}`;
	const filtersActive = Boolean(query || group !== "all");

	useEffect(() => {
		void filterKey;
		setCurrentPage(1);
	}, [filterKey]);

	useEffect(() => {
		if (currentPage !== productPage.page) setCurrentPage(productPage.page);
	}, [currentPage, productPage.page]);

	const selectedCatalog = useMemo(() => {
		void revision;
		return selectedId ? loadProductDetail(selectedId) : undefined;
	}, [loadProductDetail, revision, selectedId]);
	const selected = selectedCatalog?.products[0];
	const formProduct = formProductId
		? formProductId === selectedId
			? selected
			: loadProductDetail(formProductId)?.products[0]
		: undefined;
	const policyCatalog = policyProductId
		? policyProductId === selectedId
			? selectedCatalog
			: loadProductDetail(policyProductId)
		: undefined;
	const policyProduct = policyCatalog?.products[0];
	const editingPolicy = policyCatalog?.policies.find(
		(item) => item.id === editingPolicyId,
	);
	const productToDelete = deleteProductId
		? deleteProductId === selectedId
			? selected
			: loadProductDetail(deleteProductId)?.products[0]
		: undefined;
	const policyToDelete = deletePolicyId
		? selectedCatalog?.policies.find((item) => item.id === deletePolicyId)
		: undefined;
	const customerForPolicyDelete = policyToDelete
		? customers.find((item) => item.id === policyToDelete.customerId)
		: undefined;
	const chooseImportFile = async (file?: File) => {
		if (!file) return;
		setImportError("");
		try {
			setImportPreview(
				await parseProductWorkbook(file, loadCatalog().products),
			);
		} catch (cause) {
			setImportError(
				cause instanceof Error
					? cause.message
					: "Không thể đọc danh sách sản phẩm.",
			);
		} finally {
			if (importInput.current) importInput.current.value = "";
		}
	};

	return (
		<div className="page-stack products-page">
			<section className="section-actions product-page-head">
				<div>
					<h2>Danh mục sản phẩm và chính sách</h2>
					<p>
						Một danh mục sản phẩm dùng chung; đơn giá bán được lấy trực tiếp từ
						dữ liệu đơn hàng MISA.
					</p>
				</div>
				<div>
					<input
						ref={importInput}
						className="product-import-input"
						type="file"
						accept=".xlsx,.xls"
						onChange={(event) => void chooseImportFile(event.target.files?.[0])}
					/>
					<button
						className="button secondary"
						type="button"
						onClick={() => importInput.current?.click()}
					>
						<FileSpreadsheet size={16} /> Nhập Excel
					</button>
					<button
						className="button secondary"
						type="button"
						onClick={() => exportProductCatalog(loadCatalog(), customers)}
					>
						<Download size={16} /> Xuất danh mục
					</button>
					<button
						className="button primary"
						type="button"
						onClick={() => setFormProductId(null)}
					>
						<PackagePlus size={16} /> Thêm sản phẩm
					</button>
				</div>
			</section>
			<section className="product-stat-grid">
				<article>
					<span>Sản phẩm hoạt động</span>
					<strong>{summary.activeProducts}</strong>
					<small>trên {productPage.totalCount} sản phẩm</small>
				</article>
				<article>
					<span>Chính sách đang hiệu lực</span>
					<strong>{summary.currentPolicies}</strong>
					<small>{summary.currentCustomers} đơn vị được áp dụng</small>
				</article>
				<article
					className={summary.missingAssignments > 0 ? "needs-attention" : ""}
				>
					<span>Đơn vị còn thiếu chính sách</span>
					<strong>{summary.missingAssignments}</strong>
					<small>chỉ tính sản phẩm hoạt động</small>
				</article>
				<article className={summary.expiringSoon > 0 ? "needs-attention" : ""}>
					<span>Sắp hết hiệu lực</span>
					<strong>{summary.expiringSoon}</strong>
					<small>trong 30 ngày tới</small>
				</article>
			</section>
			{importError && (
				<section className="form-alert product-import-error">
					<AlertTriangle size={16} /> {importError}
					<button type="button" onClick={() => setImportError("")}>
						Đóng
					</button>
				</section>
			)}
			<ProductCatalogTable
				products={productPage.products}
				filteredCount={productPage.filteredCount}
				totalCount={productPage.totalCount}
				activeCustomerCount={activeCustomers.length}
				customerCoverage={customerCoverage}
				groups={productPage.groups}
				query={query}
				group={group}
				currentPage={productPage.page}
				pageCount={productPage.pageCount}
				pageSize={pageSize}
				firstVisible={productPage.firstVisible}
				lastVisible={productPage.lastVisible}
				filtersActive={filtersActive}
				onQueryChange={setQuery}
				onGroupChange={setGroup}
				onOpen={setSelectedId}
				onPageChange={setCurrentPage}
				onPageSizeChange={setPageSize}
			/>
			{selected && selectedCatalog && (
				<ProductPolicyDrawer
					product={selected}
					catalog={selectedCatalog}
					customers={customers}
					onClose={() => setSelectedId(undefined)}
					onAddPolicy={() => setPolicyProductId(selected.id)}
					onEditProduct={() => setFormProductId(selected.id)}
					onDeleteProduct={() => setDeleteProductId(selected.id)}
					onTogglePolicy={changePolicyStatus}
					onChangePolicy={(policyId) => {
						setEditingPolicyId(policyId);
						setPolicyProductId(selected.id);
					}}
					onDeletePolicy={setDeletePolicyId}
				/>
			)}
			{formProductId !== undefined && (
				<ProductFormDialog
					product={formProduct}
					onClose={() => setFormProductId(undefined)}
					onSave={(draft, id) => {
						const savedId = saveProduct(draft, id);
						setSelectedId(savedId);
					}}
				/>
			)}
			{policyProduct && (
				<PolicyFormDialog
					product={policyProduct}
					customers={customers}
					policy={editingPolicy}
					onClose={() => {
						setPolicyProductId(undefined);
						setEditingPolicyId(undefined);
					}}
					onSave={(draft) =>
						editingPolicy
							? changePolicy(editingPolicy.id, draft)
							: savePolicies(draft)
					}
				/>
			)}
			{importPreview && (
				<ProductImportDialog
					preview={importPreview}
					onClose={() => setImportPreview(undefined)}
					onConfirm={() => {
						importProducts(
							importPreview.rows
								.filter(
									(row) => row.status === "ready" || row.status === "update",
								)
								.map((row) => row.draft),
						);
						setImportPreview(undefined);
					}}
				/>
			)}
			{productToDelete && (
				<ProductDeleteDialog
					product={productToDelete}
					policyCount={
						(selectedCatalog?.policies ?? []).filter(
							(policy) => policy.productId === productToDelete.id,
						).length
					}
					onClose={() => setDeleteProductId(undefined)}
					onConfirm={() => {
						deleteProduct(productToDelete.id);
						setDeleteProductId(undefined);
						setSelectedId(undefined);
					}}
				/>
			)}
			{policyToDelete && selected && (
				<PolicyDeleteDialog
					policyName={selected.name}
					context={`${customerForPolicyDelete?.misaCode ?? ""} · ${customerForPolicyDelete?.name ?? "Khách hàng không còn trong danh mục"}`}
					details={`Hiệu lực ${formatDateOnly(policyToDelete.effectiveFrom)} – ${formatDateOnly(policyToDelete.effectiveTo, "không thời hạn")}`}
					onClose={() => setDeletePolicyId(undefined)}
					onConfirm={() => {
						deletePolicy(policyToDelete.id);
						setDeletePolicyId(undefined);
					}}
				/>
			)}
		</div>
	);
}
