import { readSalesEmployees } from "../employees/employee.repository";
import { readCustomers } from "./customer.repository";

export async function readDirectory() {
	const [customers, employees] = await Promise.all([
		readCustomers(),
		readSalesEmployees(),
	]);
	return { customers, employees };
}
