import type { SalesEmployee } from "./employee.model";

export const seedSalesEmployees: SalesEmployee[] = [
	{
		id: "NV-001",
		code: "NVKD-001",
		name: "Nguyễn Minh An",
		phone: "0912 345 671",
		email: "an.nguyen@mkcost.vn",
		status: "active",
		createdAt: "2026-01-01T08:00:00.000Z",
	},
	{
		id: "NV-002",
		code: "NVKD-002",
		name: "Lê Hoàng Linh",
		phone: "0988 245 112",
		email: "linh.le@mkcost.vn",
		status: "active",
		createdAt: "2026-01-01T08:00:00.000Z",
	},
	{
		id: "NV-003",
		code: "NVKD-003",
		name: "Trần Thu Hà",
		phone: "0936 782 905",
		email: "ha.tran@mkcost.vn",
		status: "active",
		createdAt: "2026-01-01T08:00:00.000Z",
	},
	{
		id: "NV-004",
		code: "NVKD-004",
		name: "Phạm Quốc Việt",
		phone: "0904 221 884",
		email: "viet.pham@mkcost.vn",
		status: "active",
		createdAt: "2026-01-01T08:00:00.000Z",
	},
];
