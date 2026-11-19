import type { PageId } from "../types";

export interface PageMeta {
	title: string;
	subtitle: string;
}

export const pageMeta: Record<PageId, PageMeta> = {
	dashboard: {
		title: "Dashboard",
		subtitle: "Tổng quan công nợ phải thu và khoản thu của khách hàng",
	},
	misa: {
		title: "Dữ liệu MISA",
		subtitle: "Nhập và tra cứu Sổ chi tiết bán hàng từ MISA",
	},
	customers: {
		title: "Khách hàng",
		subtitle: "Danh mục khách hàng, địa bàn và nhân viên phụ trách",
	},
	sales: {
		title: "Nhân viên & khu vực",
		subtitle: "Phân công khách hàng theo địa bàn và theo dõi người phụ trách",
	},
	receivables: {
		title: "Công nợ phải thu",
		subtitle: "Tổng hợp hóa đơn theo khách hàng, nhân viên và khu vực",
	},
	payments: {
		title: "Đối soát khoản thu",
		subtitle: "Đối chiếu và phân bổ khoản thu vào hóa đơn",
	},
	reports: {
		title: "Báo cáo",
		subtitle: "Lập biên bản đối chiếu công nợ theo khách hàng và kỳ báo cáo",
	},
	users: {
		title: "Người dùng & phân quyền",
		subtitle: "Quản lý vai trò nhập liệu, tra cứu dữ liệu và quản trị",
	},
	audit: {
		title: "Nhật ký sử dụng",
		subtitle: "Theo dõi lịch sử thay đổi và các thao tác quan trọng",
	},
	settings: {
		title: "Cài đặt",
		subtitle: "Cấu hình dữ liệu, sao lưu và phương thức đồng bộ",
	},
};
