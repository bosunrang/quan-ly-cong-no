import { Workbook } from "exceljs";
import { readSheet } from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import type { Customer } from "../src/domain/customers/customer.model";
import type { SalesEmployee } from "../src/domain/employees/employee.model";
import {
	createCustomerFromImport,
	customerImportFields,
} from "../src/domain/customers/customer.service";
import { makeCustomerWorkbook } from "../src/features/customers/customer.export";
import { parseCustomerRows } from "../src/features/customers/customer.import";
import { seedCustomers } from "./fixtures/seed-customers";

describe("customer Excel export", () => {
	it("xuất Excel giữ mã có số 0 đầu và nhập lại được danh mục ở công ty khác", async () => {
		const customers: Customer[] = [
			{
				...seedCustomers[0],
				misaCode: "000123",
				name: 'Bệnh viện "A", chi nhánh 1',
				taxCode: "0100123456-001",
				paymentTermDays: 90,
			},
			{
				...seedCustomers[2],
				misaCode: "KH-002",
				taxCode: "001234567890",
				paymentTermDays: 0,
				status: "paused",
			},
			{
				...seedCustomers[0],
				misaCode: "KH-003",
				name: "Khách chưa phân loại",
				group: "unknown",
				taxCode: "",
				assignments: [],
			},
		];
		const employees: SalesEmployee[] = customers
			.slice(0, 2)
			.map((customer, i) => ({
				id: customer.assignments[0].employeeId,
				code: i === 0 ? "0007" : "NV-002",
				name: customer.assignments[0].employeeName,
				phone: "",
				email: "",
				status: "active",
				createdAt: customer.createdAt,
			}));
		const bytes = await makeCustomerWorkbook(customers, employees);
		// Đọc file thật bằng cùng thư viện mà chức năng Nhập Excel sử dụng.
		const rows = await readSheet(Buffer.from(bytes));
		const preview = parseCustomerRows("danh-muc-khach-hang.xlsx", rows, [], {
			employees: employees.map((employee, i) => ({
				...employee,
				id: `target-${i}`,
			})),
		});
		expect(preview.readyCount).toBe(3);
		expect(preview.invalidCount).toBe(0);
		expect(preview.duplicateCount).toBe(0);
		expect(preview.rows.map(({ draft }) => draft)).toEqual(
			customers.map(
				({
					misaCode,
					name,
					address,
					province,
					taxCode,
					group,
					status,
					paymentTermDays,
					assignments,
				}) => ({
					misaCode,
					name,
					address,
					province,
					taxCode,
					group,
					status,
					...(paymentTermDays === undefined ? {} : { paymentTermDays }),
					...(assignments.length
						? {
								employeeName: assignments[0].employeeName,
								employeeCode: employees.find(
									(e) => e.id === assignments[0].employeeId,
								)?.code,
								assignmentFrom: assignments[0].effectiveFrom,
							}
						: {}),
				}),
			),
		);
		for (const [index, { draft }] of preview.rows.entries()) {
			// Bao gồm bước chuyển dữ liệu trước khi gửi HTTP, không chỉ bản xem trước.
			const fields = customerImportFields(draft);
			expect(fields.status).toBe(customers[index].status);
			expect(fields.paymentTermDays).toBe(customers[index].paymentTermDays);
			expect(fields.employeeName).toBe(
				customers[index].assignments[0]?.employeeName,
			);
			expect(fields.assignmentFrom).toBe(
				customers[index].assignments[0]?.effectiveFrom,
			);
			expect(fields).not.toHaveProperty("employeeId");
			const created = createCustomerFromImport(draft);
			expect(created.status).toBe(customers[index].status);
			expect(created.paymentTermDays).toBe(customers[index].paymentTermDays);
		}
		const workbook = new Workbook();
		await workbook.xlsx.load(bytes);
		const sheet = workbook.getWorksheet("Khách hàng");
		if (!sheet) throw new Error("Thiếu trang khách hàng.");
		expect(sheet.getCell("A2").value).toBe("000123");
		expect(sheet.getCell("E2").value).toBe("0100123456-001");
		expect(sheet.getCell("H2").value).toBe(90);
		expect(sheet.getCell("H3").value).toBe(0);
		expect(sheet.getCell("H4").value).toBeNull();
		expect(sheet.getCell("I3").value).toBe("Tạm ngưng");
		expect(sheet.getCell("J2").value).toBe("0007");
		expect(sheet.getCell("K2").value).toBe(
			customers[0].assignments[0].effectiveFrom,
		);
	});
});
