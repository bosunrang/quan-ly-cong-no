import { createId } from "../../shared/lib/identity";
import type { EmployeeDraft, SalesEmployee } from "./employee.model";

export function createEmployee(draft: EmployeeDraft): SalesEmployee {
	return {
		id: createId("NV"),
		code: draft.code.trim(),
		name: draft.name.trim(),
		phone: draft.phone.trim(),
		email: draft.email.trim(),
		status: draft.status,
		createdAt: new Date().toISOString(),
	};
}
