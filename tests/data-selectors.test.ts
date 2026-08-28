import { describe, expect, it } from "vitest";
import {
	isOrderRecordList,
	selectOrderLines,
} from "../src/domain/orders/order.model";
import { selectCustomerReconcileRows } from "../src/domain/reconciliation/reconciliation.selectors";
import { seedCustomers } from "../src/domain/customers/customer.seed";

describe("cross-domain selectors", () => {
	it("lấy tên khách hàng mới nhất cho đơn hàng bằng mã MISA", () => {
		const records = [
			{
				id: "O-1",
				date: "2026-01-01",
				orderNo: "BH-1",
				customerCode: "KH-TH-001",
				customerName: "Tên cũ",
				product: "B",
				quantity: 1,
				unitPrice: 100,
				discountPerUnit: 10,
				policySnapshot: null,
			},
		];
		const customers = seedCustomers.map((customer) =>
			customer.misaCode === "KH-TH-001"
				? { ...customer, name: "Tên mới" }
				: customer,
		);

		expect(selectOrderLines(records, customers)[0].customer).toBe("Tên mới");
		expect(
			selectOrderLines(
				[{ ...records[0], customerCode: "UNKNOWN" }],
				customers,
			)[0].customer,
		).toBe("Tên cũ");
	});

	it("kiểm tra đầy đủ cấu trúc bản ghi đơn hàng", () => {
		const valid = {
			id: "O-1",
			date: "2026-01-01",
			orderNo: "BH-1",
			customerCode: "KH-1",
			customerName: "A",
			product: "B",
			quantity: 1,
			unitPrice: 100,
			discountPerUnit: 10,
			policySnapshot: null,
		};
		expect(isOrderRecordList([valid])).toBe(true);
		expect(isOrderRecordList(null)).toBe(false);
		expect(isOrderRecordList([null])).toBe(false);
		expect(isOrderRecordList([[]])).toBe(false);

		for (const key of Object.keys(valid)) {
			expect(isOrderRecordList([{ ...valid, [key]: undefined }])).toBe(false);
		}
	});

	it("lấy tỉnh và nhân viên hiện tại cho đối soát", () => {
		const entries = [
			{
				id: "R-1",
				customerCode: "KH-TH-001",
				customerName: "Tên cũ",
				region: "Tỉnh cũ",
				salesperson: "NV cũ",
				revenue: 100,
				collected: 100,
				expectedDiscount: 10,
				paidDiscount: 0,
				status: "eligible" as const,
			},
		];

		const [row] = selectCustomerReconcileRows(entries, seedCustomers);

		expect(row.customer).toBe("Trung tâm Kiểm soát Bệnh tật Thanh Hóa");
		expect(row.region).toBe("Thanh Hóa");
		expect(row.salesperson).toBe("Nguyễn Minh An");
	});
});
