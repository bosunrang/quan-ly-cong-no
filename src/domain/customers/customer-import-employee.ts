import type { SalesEmployee } from "../employees/employee.model";

export interface ImportedCustomerEmployee {
	employeeCode?: string;
	employeeName?: string;
	assignmentFrom?: string;
}

type EmployeeMatch =
	| { employee: SalesEmployee; create?: never; error?: never }
	| { create: { code?: string; name: string }; employee?: never; error?: never }
	| { error: string; employee?: never; create?: never }
	| { employee?: never; create?: never; error?: never };

const codeKey = (value: string) => value.trim().normalize("NFC").toUpperCase();
const nameKey = (value: string) =>
	value.trim().normalize("NFC").replace(/\s+/g, " ").toLocaleLowerCase("vi-VN");

// Không chuyển ID nhân viên giữa hai công ty. Chỉ ghép theo mã hoặc tên đầy đủ duy nhất.
export function resolveCustomerImportEmployee(
	input: ImportedCustomerEmployee,
	employees: SalesEmployee[],
): EmployeeMatch {
	const code = input.employeeCode?.trim() ?? "";
	const name = input.employeeName?.trim() ?? "";
	if (!code && !name) return {};
	let matches = code
		? employees.filter((e) => codeKey(e.code) === codeKey(code))
		: [];
	if (
		matches.length &&
		name &&
		matches.some((e) => nameKey(e.name) !== nameKey(name))
	)
		return {
			error: `Mã nhân viên ${code} đang thuộc tên khác. Kiểm tra lại người phụ trách`,
		};
	if (!matches.length && name) {
		const sameName = employees.filter((e) => nameKey(e.name) === nameKey(name));
		if (code && sameName.length)
			return {
				error: `Nhân viên ${name} đã có mã khác tại công ty nhận. Kiểm tra lại mã nhân viên`,
			};
		matches = sameName;
	}
	if (matches.length > 1)
		return {
			error: `Tên nhân viên ${name} bị trùng. Cần điền đúng mã nhân viên tại công ty nhận`,
		};
	if (matches.length) {
		const employee = matches[0];
		return employee.status === "active"
			? { employee }
			: { error: `Nhân viên ${employee.name} đã ngừng hoạt động` };
	}
	if (!name)
		return {
			error: `Chưa có mã nhân viên ${code}. Cần tên nhân viên để tạo mới`,
		};
	return { create: { ...(code ? { code } : {}), name } };
}
