import type { ActivityItem } from "./dashboard.model";

export const seedActivityItems: ActivityItem[] = [
	{
		title: "Đã nhập dữ liệu thu tiền MISA",
		detail: "12 chứng từ · tổng 18.400.000đ",
		time: "08:42 hôm nay",
		tone: "success",
	},
	{
		title: "Hoàn tất đối soát KH-TH-001",
		detail: "Đủ điều kiện chi 3.200.000đ",
		time: "16:25 hôm qua",
		tone: "success",
	},
	{
		title: "Phát hiện mức chiết khấu bất thường",
		detail: "SP-B lệch với chính sách đang áp dụng",
		time: "14:10 hôm qua",
		tone: "warning",
	},
	{
		title: "Đã chốt kỳ chiết khấu Quý I/2026",
		detail: "Người thực hiện: Quản trị viên",
		time: "22/04/2026",
		tone: "neutral",
	},
];
