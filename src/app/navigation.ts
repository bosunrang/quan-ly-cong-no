import {
	BarChart3,
	Boxes,
	Building2,
	CircleDollarSign,
	ClipboardCheck,
	Database,
	FileBarChart,
	History,
	MapPinned,
	Settings,
	Users,
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
		items: [
			{ id: "dashboard", label: "Dashboard", icon: BarChart3 },
			{ id: "reconcile", label: "Đối soát chiết khấu", icon: ClipboardCheck },
		],
	},
	{
		label: "Dữ liệu",
		items: [{ id: "misa", label: "Dữ liệu MISA", icon: Database }],
	},
	{
		label: "Danh mục",
		items: [
			{ id: "products", label: "Sản phẩm & chính sách", icon: Boxes },
			{ id: "customers", label: "Khách hàng", icon: Building2 },
			{ id: "sales", label: "Nhân viên & khu vực", icon: MapPinned },
		],
	},
	{
		label: "Quản lý",
		items: [
			{ id: "periods", label: "Kỳ chiết khấu", icon: CircleDollarSign },
			{ id: "reports", label: "Báo cáo", icon: FileBarChart },
		],
	},
	{
		label: "Hệ thống",
		items: [
			{ id: "users", label: "Người dùng", icon: Users },
			{ id: "audit", label: "Nhật ký hoạt động", icon: History },
			{ id: "settings", label: "Cài đặt", icon: Settings },
		],
	},
];
