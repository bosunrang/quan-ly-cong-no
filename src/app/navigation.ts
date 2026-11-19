import {
	BarChart3,
	Building2,
	ChartNoAxesCombined,
	Database,
	History,
	MapPinned,
	Receipt,
	Settings,
	Users,
	Wallet,
	type LucideIcon,
} from "lucide-react";
import type { PageId } from "../types";

export interface NavItem {
	id: PageId;
	label: string;
	icon: LucideIcon;
}

export interface NavGroup {
	label: string;
	items: NavItem[];
}

export const navGroups: NavGroup[] = [
	{
		label: "Tổng quan",
		items: [{ id: "dashboard", label: "Dashboard", icon: BarChart3 }],
	},
	{
		label: "Dữ liệu",
		items: [{ id: "misa", label: "Dữ liệu MISA", icon: Database }],
	},
	{
		label: "Nghiệp vụ",
		items: [
			{ id: "receivables", label: "Công nợ phải thu", icon: Wallet },
			{ id: "payments", label: "Đối soát khoản thu", icon: Receipt },
			{ id: "reports", label: "Báo cáo", icon: ChartNoAxesCombined },
		],
	},
	{
		label: "Danh mục",
		items: [
			{ id: "customers", label: "Khách hàng", icon: Building2 },
			{ id: "sales", label: "Nhân viên & khu vực", icon: MapPinned },
		],
	},
	{
		label: "Hệ thống",
		items: [
			{ id: "users", label: "Người dùng", icon: Users },
			{ id: "audit", label: "Nhật ký sử dụng", icon: History },
			{ id: "settings", label: "Cài đặt", icon: Settings },
		],
	},
];

export const navItems = navGroups.flatMap(({ items }) => items);
