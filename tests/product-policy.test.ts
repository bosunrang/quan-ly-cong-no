import { describe, expect, it } from "vitest";
import {
	addPolicies,
	rangesOverlap,
	removePolicy,
	removeProduct,
	replacePolicyVersion,
	resolvePolicy,
	togglePolicy,
	validatePolicyDraft,
	type PolicyDraft,
} from "../src/domain/products/product-policy.service";
import type { ProductCatalog } from "../src/domain/products/product.model";
import { seedProductCatalog } from "../src/domain/products/product.seed";
import { seedCustomers } from "../src/domain/customers/customer.seed";
import { parsePolicyRows } from "../src/features/products/policy.import";

const catalog = (): ProductCatalog => structuredClone(seedProductCatalog);

describe("customer product policy", () => {
	it("xác định chính xác khoảng ngày giao nhau", () => {
		expect(rangesOverlap("2026-01-01", "2026-01-31", "2026-02-01", null)).toBe(
			false,
		);
		expect(rangesOverlap("2026-01-01", null, "2026-02-01", "2026-02-28")).toBe(
			true,
		);
		expect(
			rangesOverlap("2026-01-01", "2026-01-31", "2026-01-31", "2026-02-28"),
		).toBe(true);
	});

	it("chặn chính sách trùng sản phẩm, đơn vị và thời gian", () => {
		const draft: PolicyDraft = {
			productId: "PRD-B",
			customerIds: ["CUS-001"],
			calculationType: "fixed",
			value: 11_000,
			effectiveFrom: "2026-02-01",
			effectiveTo: null,
			note: "",
		};
		expect(validatePolicyDraft(catalog(), draft)).toContain("bị trùng");
		expect(() => addPolicies(catalog(), draft)).toThrow("bị trùng");
	});

	it("thêm hàng loạt và tính đúng số tiền trực tiếp", () => {
		const draft: PolicyDraft = {
			productId: "PRD-E",
			customerIds: ["CUS-001", "CUS-002"],
			calculationType: "fixed",
			value: 20_000,
			effectiveFrom: "2026-05-01",
			effectiveTo: null,
			note: "Hợp đồng mới",
		};
		const next = addPolicies(catalog(), draft);
		const product = next.products.find((item) => item.id === "PRD-E");
		expect(next.policies).toHaveLength(seedProductCatalog.policies.length + 2);
		expect(product).toBeDefined();
		if (product)
			expect(
				resolvePolicy(next, product, "CUS-001", "2026-06-01")?.discountPerUnit,
			).toBe(20_000);
	});

	it("cộng trực tiếp mức tiền của nhiều người nhận", () => {
		const next = addPolicies(catalog(), {
			productId: "PRD-E",
			customerIds: ["CUS-001"],
			calculationType: "fixed",
			value: 0,
			recipientAllocationsByCustomer: {
				"CUS-001": [
					{ recipientId: "RCP-001", amount: 10_000 },
					{ recipientId: "RCP-ALT", amount: 5_000 },
				],
			},
			effectiveFrom: "2027-01-01",
			effectiveTo: null,
			note: "",
		});
		const policy = next.policies.at(-1);
		expect(policy?.value).toBe(15_000);
		expect(policy?.recipientAllocations).toHaveLength(2);
	});

	it("khấu trừ chi phí giữ lại để tính số thực nhận", () => {
		const next = addPolicies(catalog(), {
			productId: "PRD-E",
			customerIds: ["CUS-001"],
			calculationType: "fixed",
			value: 0,
			recipientAllocationsByCustomer: {
				"CUS-001": [
					{ recipientId: "RCP-001", amount: 8_000, retainedAmount: 2_000 },
				],
			},
			effectiveFrom: "2027-01-01",
			effectiveTo: null,
			note: "",
		});
		const product = next.products.find((item) => item.id === "PRD-E");
		const policy = next.policies.at(-1);
		expect(policy).toMatchObject({
			value: 8_000,
			recipientAllocations: [{ amount: 8_000, retainedAmount: 2_000 }],
		});
		if (product)
			expect(
				resolvePolicy(next, product, "CUS-001", "2027-01-01")?.discountPerUnit,
			).toBe(6_000);
	});

	it("chặn chi phí giữ lại lớn hơn tổng chính sách", () => {
		expect(
			validatePolicyDraft(catalog(), {
				productId: "PRD-E",
				customerIds: ["CUS-001"],
				calculationType: "fixed",
				value: 0,
				recipientAllocationsByCustomer: {
					"CUS-001": [
						{ recipientId: "RCP-001", amount: 8_000, retainedAmount: 9_000 },
					],
				},
				effectiveFrom: "2027-01-01",
				effectiveTo: null,
				note: "",
			}),
		).toContain("mỗi người");
	});

	it("tạo phiên bản mới và khép khoảng hiệu lực của bản cũ", () => {
		const draft: PolicyDraft = {
			productId: "PRD-B",
			customerIds: ["CUS-001"],
			calculationType: "fixed",
			value: 15_000,
			effectiveFrom: "2026-03-01",
			effectiveTo: null,
			note: "Điều chỉnh quý II",
		};
		const next = replacePolicyVersion(catalog(), "POL-B-001", draft);
		expect(
			next.policies.find((item) => item.id === "POL-B-001")?.effectiveTo,
		).toBe("2026-02-28");
		expect(
			resolvePolicy(next, next.products[0], "CUS-001", "2026-02-15")
				?.discountPerUnit,
		).toBe(10_000);
		expect(
			resolvePolicy(next, next.products[0], "CUS-001", "2026-03-01")
				?.discountPerUnit,
		).toBe(15_000);
	});

	it("không bật lại chính sách nếu gây xung đột", () => {
		const source = catalog();
		const paused = togglePolicy(source, "POL-B-001");
		const withReplacement = addPolicies(paused, {
			productId: "PRD-B",
			customerIds: ["CUS-001"],
			calculationType: "fixed",
			value: 20_000,
			effectiveFrom: "2026-01-01",
			effectiveTo: null,
			note: "",
		});
		expect(() => togglePolicy(withReplacement, "POL-B-001")).toThrow(
			"Không thể bật lại",
		);
	});

	it("xem trước file nhập và chặn dòng trùng hiệu lực", () => {
		const preview = parsePolicyRows(
			"chinh-sach.xlsx",
			[
				[
					"Mã sản phẩm",
					"Mã đơn vị",
					"Cách tính",
					"Mức chiết khấu",
					"Hiệu lực từ",
					"Hiệu lực đến",
					"Ghi chú",
				],
				["SP-E", "KH-TH-001", "Số tiền", 12_500, "01/01/2027", "", "Năm 2027"],
				["SP-E", "KH-TH-001", "Số tiền", 15_000, "01/02/2027", "", "Bị trùng"],
				["SP-X", "KH-TH-001", "Số tiền", 10_000, "01/01/2027", "", "Sai mã"],
			],
			catalog(),
			seedCustomers,
		);
		expect(preview.readyCount).toBe(1);
		expect(preview.invalidCount).toBe(2);
		expect(preview.rows[0].draft?.effectiveFrom).toBe("2027-01-01");
		expect(preview.rows[1].message).toContain("bị trùng");
	});

	it("dùng một danh mục sản phẩm chung cho mọi khách hàng", () => {
		const preview = parsePolicyRows(
			"chinh-sach.xlsx",
			[
				[
					"Mã sản phẩm",
					"Mã đơn vị",
					"Cách tính",
					"Mức chiết khấu",
					"Hiệu lực từ",
				],
				["SP-B", "KH-NB-006", "Số tiền", 9_000, "01/01/2027"],
			],
			catalog(),
			seedCustomers,
		);
		expect(preview.rows[0].draft?.productId).toBe("PRD-B");
	});

	it("xóa sản phẩm chưa có lịch sử chính sách", () => {
		const next = removeProduct(catalog(), "PRD-E");
		expect(next.products.some((product) => product.id === "PRD-E")).toBe(false);
		expect(next.policies).toHaveLength(seedProductCatalog.policies.length);
	});

	it("chỉ xóa đúng một phiên bản chính sách được chọn", () => {
		const source = catalog();
		const removed = source.policies.find((policy) => policy.id === "POL-B-001");
		const next = removePolicy(source, "POL-B-001");
		expect(removed).toBeDefined();
		expect(next.policies).toHaveLength(source.policies.length - 1);
		expect(next.policies.some((policy) => policy.id === "POL-B-001")).toBe(
			false,
		);
		expect(next.products).toEqual(source.products);
	});

	it("xóa sản phẩm kèm toàn bộ lịch sử chính sách", () => {
		const next = removeProduct(catalog(), "PRD-B");
		expect(next.products.some((product) => product.id === "PRD-B")).toBe(false);
		expect(next.policies.some((policy) => policy.productId === "PRD-B")).toBe(
			false,
		);
		expect(next.policies).toHaveLength(seedProductCatalog.policies.length - 3);
	});
});
