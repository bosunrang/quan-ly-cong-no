import type { Customer } from "../../domain/customers/customer.model";
import { customerStatusLabels } from "../../domain/customers/customer.model";
import { currentAssignment } from "../../domain/customers/customer.selectors";
import type { SalesEmployee } from "../../domain/employees/employee.model";

export async function makeCustomerWorkbook(
	customers: Customer[],
	employees: SalesEmployee[] = [],
) {
	const { Workbook } = await import("exceljs");
	const workbook = new Workbook();
	const sheet = workbook.addWorksheet("Khách hàng", {
		views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
	});
	const header = [
		"Mã khách hàng",
		"Tên khách hàng",
		"Địa chỉ",
		"Tỉnh/Thành phố",
		"Mã số thuế",
		"Nhà nước/Tư nhân",
		"Nhân viên phụ trách",
		"Thời hạn công nợ (ngày)",
		"Trạng thái",
		"Mã nhân viên phụ trách",
		"Ngày bắt đầu phụ trách",
	];
	sheet.columns = [24, 64, 88, 24, 22, 24, 30, 28, 22, 26, 26].map((width) => ({
		width,
	}));
	// Mã MISA và MST là định danh dạng chữ để giữ nguyên số 0 ở đầu.
	sheet.getColumn(1).numFmt = "@";
	sheet.getColumn(5).numFmt = "@";
	sheet.getColumn(10).numFmt = "@";
	const employeeById = new Map(
		employees.map((employee) => [employee.id, employee]),
	);
	const groupLabels = {
		state: "Nhà nước",
		private: "Tư nhân",
		unknown: "Chưa phân loại",
	};
	sheet.addRow(header);
	for (const customer of customers) {
		const assignment = currentAssignment(customer);
		const employee = assignment
			? employeeById.get(assignment.employeeId)
			: undefined;
		const row = sheet.addRow([
			customer.misaCode,
			customer.name,
			customer.address,
			customer.province,
			customer.taxCode,
			groupLabels[customer.group],
			employee?.name ?? assignment?.employeeName ?? "",
			customer.paymentTermDays ?? null,
			customerStatusLabels[customer.status],
			employee?.code ?? "",
			assignment?.effectiveFrom ?? "",
		]);
		row.height = Math.max(
			30,
			Math.ceil(customer.name.length / 52) * 16,
			Math.ceil(customer.address.length / 75) * 16,
		);
	}
	sheet.eachRow((row, rowNumber) => {
		row.eachCell((cell) => {
			cell.font = { name: "Arial", size: 11 };
			cell.alignment = { vertical: "middle", wrapText: true };
			if (rowNumber === 1) {
				cell.font = {
					name: "Arial",
					size: 11,
					bold: true,
					color: { argb: "FFFFFFFF" },
				};
				cell.fill = {
					type: "pattern",
					pattern: "solid",
					fgColor: { argb: "FF087D8B" },
				};
				cell.alignment.horizontal = "center";
			}
		});
	});
	sheet.getRow(1).height = 32;
	sheet.getColumn(8).numFmt = "0";
	sheet.autoFilter = "A1:K1";
	return workbook.xlsx.writeBuffer();
}

export async function exportCustomers(
	customers: Customer[],
	employees: SalesEmployee[] = [],
) {
	const buffer = await makeCustomerWorkbook(customers, employees);
	const url = URL.createObjectURL(
		new Blob([new Uint8Array(buffer)], {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		}),
	);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = "danh-muc-khach-hang.xlsx";
	anchor.click();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
