import { describe, expect, it } from "vitest";
import type { Customer } from "../src/domain/customers/customer.model";
import type {
	MisaDataset,
	MisaDetailRecord,
} from "../src/domain/misa/misa.model";
import type { ProductCatalog } from "../src/domain/products/product.model";
import { calculateReconciliation } from "../src/domain/reconciliation/reconciliation.engine";

const customer: Customer = {
	id: "CUS-1",
	misaCode: "KH-001",
	name: "Bệnh viện A",
	group: "state",
	taxCode: "",
	province: "Hà Nội",
	address: "",
	status: "active",
	assignments: [
		{
			id: "ASN-1",
			employeeId: "EMP-1",
			employeeName: "Nguyễn An",
			province: "Hà Nội",
			source: "direct",
			effectiveFrom: "2026-01-01",
			effectiveTo: null,
		},
	],
	recipients: [
		{
			id: "RCP-A",
			fullName: "Người A",
			position: "",
			phone: "",
			effectiveFrom: "2026-01-01",
			effectiveTo: null,
			isPrimary: true,
			active: true,
		},
		{
			id: "RCP-B",
			fullName: "Người B",
			position: "",
			phone: "",
			effectiveFrom: "2026-01-01",
			effectiveTo: null,
			isPrimary: false,
			active: true,
		},
	],
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

const catalog: ProductCatalog = {
	products: [
		{
			id: "PRD-1",
			code: "SP-001",
			name: "Hóa chất A",
			group: "Hóa chất",
			unit: "Hộp",
			status: "active",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
	],
	policies: [
		{
			id: "POL-1",
			productId: "PRD-1",
			customerId: "CUS-1",
			recipientAllocations: [
				{ recipientId: "RCP-A", amount: 10000 },
				{ recipientId: "RCP-B", amount: 5000 },
			],
			calculationType: "fixed",
			value: 15000,
			effectiveFrom: "2026-04-01",
			effectiveTo: null,
			status: "active",
			note: "",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
	],
};

const dataset: MisaDataset = {
	fileName: "misa.xlsx",
	importedAt: "2026-08-27T00:00:00.000Z",
	periodFrom: "2026-04-01",
	periodTo: "2026-06-30",
	sourceRowCount: 2,
	detailsAvailable: true,
	units: [
		{
			id: "benh vien a",
			name: "Bệnh viện A",
			customerId: "CUS-1",
			customerCode: "KH-001",
			sourceRowCount: 2,
			salesLineCount: 1,
			salesDocumentCount: 1,
			receiptDocumentCount: 1,
			adjustmentDocumentCount: 0,
			salesAmount: 100000,
			receiptAmount: 120000,
			openingBalance: 0,
			lastTransactionDate: "2026-04-15",
		},
	],
};

function detail(overrides: Partial<MisaDetailRecord>): MisaDetailRecord {
	return {
		id: "ROW-1",
		unitId: "benh vien a",
		rowNumber: 1,
		date: "2026-04-10",
		documentNumber: "BH001",
		productCode: "SP-001",
		description: "Hóa chất A",
		unit: "Hộp",
		quantity: 2,
		unitPrice: 50000,
		generalDescription: "Bán hàng",
		debtAccount: "131",
		contraAccount: "511",
		debit: 100000,
		credit: null,
		balanceDebit: 100000,
		balanceCredit: null,
		documentKind: "sale",
		...overrides,
	};
}

describe("reconciliation engine", () => {
	it("đủ điều kiện khi đã thu nhiều hơn doanh số và tính theo từng người nhận", () => {
		const result = calculateReconciliation(
			"2026-04-01",
			"2026-06-30",
			[
				detail({}),
				detail({
					id: "ROW-2",
					rowNumber: 2,
					documentNumber: "NT001",
					productCode: "",
					description: "Thu tiền",
					quantity: null,
					unitPrice: null,
					debit: null,
					credit: 120000,
					documentKind: "receipt",
				}),
			],
			dataset,
			[customer],
			catalog,
		);

		expect(result.rows[0]).toMatchObject({
			status: "eligible",
			revenue: 100000,
			collected: 100000,
			rawCollected: 120000,
			unallocatedCollected: 20000,
			difference: 0,
			expectedDiscount: 30000,
		});
		expect(result.rows[0].productLines[0].recipients).toMatchObject([
			{ recipientName: "Người A", totalAmount: 20000 },
			{ recipientName: "Người B", totalAmount: 10000 },
		]);
	});

	it("trừ chi phí giữ lại khỏi chiết khấu thực nhận", () => {
		const catalogWithRetention = structuredClone(catalog);
		catalogWithRetention.policies[0].recipientAllocations[0].retainedAmount = 2_000;
		catalogWithRetention.policies[0].recipientAllocations[1].retainedAmount = 1_000;
		const result = calculateReconciliation(
			"2026-04-01",
			"2026-06-30",
			[detail({})],
			dataset,
			[customer],
			catalogWithRetention,
		);

		expect(result.rows[0].productLines[0]).toMatchObject({
			grossDiscount: 30_000,
			retainedCost: 6_000,
			discount: 24_000,
		});
		expect(result.rows[0].expectedDiscount).toBe(24_000);
		expect(result.rows[0].productLines[0].recipients).toMatchObject([
			{
				recipientName: "Người A",
				grossTotal: 20_000,
				retainedTotal: 4_000,
				totalAmount: 16_000,
			},
			{
				recipientName: "Người B",
				grossTotal: 10_000,
				retainedTotal: 2_000,
				totalAmount: 8_000,
			},
		]);
	});

	it("phân bổ FIFO cho công nợ cũ, doanh số kỳ và tiền thu dư", () => {
		const fifoDataset: MisaDataset = {
			...dataset,
			periodFrom: "2026-01-01",
			units: [
				{
					...dataset.units[0],
					openingBalance: 58847330,
				},
			],
		};
		const result = calculateReconciliation(
			"2026-04-13",
			"2026-06-30",
			[
				detail({
					id: "PRIOR-SALE",
					date: "2026-03-30",
					quantity: 1,
					unitPrice: 29891250,
					debit: 29891250,
				}),
				detail({
					id: "PERIOD-SALE-A",
					rowNumber: 2,
					date: "2026-04-13",
					quantity: 100,
					unitPrice: 229000,
					debit: 22900000,
				}),
				detail({
					id: "PERIOD-SALE-B",
					rowNumber: 3,
					date: "2026-05-12",
					quantity: 1,
					unitPrice: 364531500,
					debit: 364531500,
				}),
				detail({
					id: "PERIOD-RETURN",
					rowNumber: 4,
					date: "2026-06-09",
					quantity: -50,
					unitPrice: 229000,
					debit: null,
					credit: 11450000,
					documentKind: "adjustment",
				}),
				detail({
					id: "PERIOD-ADJUSTMENT",
					rowNumber: 5,
					date: "2026-06-10",
					productCode: "",
					description: "Bù trừ công nợ",
					quantity: null,
					unitPrice: null,
					debit: 1753920,
					credit: null,
					documentKind: "adjustment",
				}),
				detail({
					id: "PERIOD-RECEIPT",
					rowNumber: 6,
					date: "2026-07-06",
					productCode: "",
					description: "Thu tiền",
					quantity: 0,
					unitPrice: 0,
					debit: null,
					credit: 468224000,
					documentKind: "receipt",
				}),
			],
			fifoDataset,
			[customer],
			catalog,
			"2026-07-06",
		);

		expect(result.paymentCutoff).toBe("2026-07-06");

		expect(result.rows[0]).toMatchObject({
			status: "eligible",
			revenue: 375981500,
			collected: 375981500,
			rawCollected: 468224000,
			priorDebtSettled: 88738580,
			adjustmentSettled: 1753920,
			unallocatedCollected: 1750000,
			remainingReceivable: 0,
		});
	});

	it("đánh dấu cần kiểm tra khi không ghép được sản phẩm", () => {
		const result = calculateReconciliation(
			"2026-04-01",
			"2026-06-30",
			[detail({ productCode: "UNKNOWN", description: "Sản phẩm lạ" })],
			dataset,
			[customer],
			catalog,
		);
		expect(result.rows[0].status).toBe("review");
		expect(result.rows[0].issues).toContain("unmatched_product");
	});

	it("trừ số lượng, doanh số và chiết khấu khi có chứng từ trả hàng", () => {
		const result = calculateReconciliation(
			"2026-04-01",
			"2026-06-30",
			[
				detail({ quantity: 100, unitPrice: 229000, debit: 22900000 }),
				detail({
					id: "ROW-RETURN",
					rowNumber: 2,
					date: "2026-06-09",
					documentNumber: "TRA-HANG-CTY-B-009",
					quantity: -50,
					unitPrice: 229000,
					debit: null,
					credit: 11450000,
					documentKind: "adjustment",
				}),
				detail({
					id: "ROW-RECEIPT",
					rowNumber: 3,
					documentNumber: "NT001",
					productCode: "",
					description: "Thu tiền",
					quantity: null,
					unitPrice: null,
					debit: null,
					credit: 11450000,
					documentKind: "receipt",
				}),
			],
			dataset,
			[customer],
			catalog,
		);

		expect(result.rows[0]).toMatchObject({
			status: "eligible",
			revenue: 11450000,
			collected: 11450000,
			expectedDiscount: 750000,
		});
		expect(result.rows[0].productLines).toMatchObject([
			{ quantity: 100, revenue: 22900000, discount: 1500000, isReturn: false },
			{
				quantity: -50,
				revenue: -11450000,
				discount: -750000,
				isReturn: true,
			},
		]);
		expect(result.rows[0].productSummaries).toMatchObject([
			{
				unitPrice: 229000,
				soldQuantity: 100,
				returnedQuantity: 50,
				netQuantity: 50,
				netRevenue: 11450000,
			},
		]);
	});
});
