import { CircleDollarSign, FileBarChart, History, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PageId } from "../types";

export interface PageMeta {
	title: string;
	subtitle: string;
}

export interface PlaceholderPageConfig {
	icon: LucideIcon;
	description: string;
	bullets: string[];
}

export const pageMeta: Record<PageId, PageMeta> = {
	dashboard: {
		title: "Dashboard",
		subtitle: "Tổng quan doanh số, tiền thu và chiết khấu trong kỳ",
	},
	reconcile: {
		title: "Đối soát chiết khấu",
		subtitle: "Kiểm tra điều kiện thu đủ trước khi lập đề nghị chi",
	},
	misa: {
		title: "Dữ liệu MISA",
		subtitle: "Nhập và quản lý đơn hàng bán, thu tiền khách hàng từ MISA",
	},
	products: {
		title: "Sản phẩm & chính sách",
		subtitle: "Quản lý chính sách riêng theo từng sản phẩm và đơn vị",
	},
	customers: {
		title: "Khách hàng",
		subtitle: "Danh mục khách hàng, khu vực và điều khoản thanh toán",
	},
	sales: {
		title: "Nhân viên & khu vực",
		subtitle:
			"Chọn từng đơn vị trong tỉnh/thành để phân công cho nhân viên kinh doanh",
	},
	periods: {
		title: "Kỳ chiết khấu",
		subtitle: "Lập, duyệt và chốt chiết khấu theo quý trong từng năm",
	},
	reports: {
		title: "Báo cáo",
		subtitle:
			"Tổng hợp chi phí theo khách hàng, sản phẩm, khu vực và nhân viên",
	},
	users: {
		title: "Người dùng & phân quyền",
		subtitle: "Quản lý vai trò nhập liệu, đối soát, duyệt và quản trị",
	},
	audit: {
		title: "Nhật ký hoạt động",
		subtitle: "Theo dõi lịch sử thay đổi và các thao tác quan trọng",
	},
	settings: {
		title: "Cài đặt",
		subtitle: "Cấu hình dữ liệu, sao lưu và phương thức đồng bộ",
	},
};

export const placeholderPages: Partial<Record<PageId, PlaceholderPageConfig>> =
	{
		periods: {
			icon: CircleDollarSign,
			description:
				"Quản lý vòng đời chiết khấu theo quý, đảm bảo năm nào tính năm đó.",
			bullets: [
				"Tạo và khóa kỳ theo quý/năm",
				"Lập danh sách đủ điều kiện chi",
				"Quy trình kiểm tra – duyệt – xác nhận đã chi",
				"Lưu ảnh chụp số liệu khi chốt kỳ",
			],
		},
		reports: {
			icon: FileBarChart,
			description: "Tổng hợp số liệu quản trị và xuất hồ sơ trình duyệt.",
			bullets: [
				"Báo cáo theo sản phẩm và khách hàng",
				"Báo cáo theo khu vực và nhân viên",
				"So sánh dự kiến, đủ điều kiện và đã chi",
				"Xuất Excel/PDF theo biểu mẫu",
			],
		},
		users: {
			icon: Users,
			description:
				"Phân tách rõ quyền nhập dữ liệu, đối soát, duyệt chi và quản trị hệ thống.",
			bullets: [
				"Vai trò và quyền chi tiết",
				"Khóa/mở tài khoản người dùng",
				"Kiểm soát quyền theo chức năng",
				"Xác thực lại khi duyệt hoặc chốt kỳ",
			],
		},
		audit: {
			icon: History,
			description:
				"Ghi lại đầy đủ ai đã thay đổi dữ liệu gì và vào thời điểm nào.",
			bullets: [
				"Nhật ký thêm, sửa, xóa dữ liệu",
				"Lịch sử nhập file MISA/Excel",
				"Lịch sử duyệt và chốt kỳ",
				"Bộ lọc và xuất nhật ký kiểm tra",
			],
		},
	};
