import type { MisaSalesBook, MisaSalesLine } from "./misa.sales-book";

export const salesHeaders = {
	date: "Ngày chứng từ",
	documentNumber: "Số chứng từ",
	invoiceNumber: "Số hóa đơn",
	customerName: "Tên khách hàng",
	productName: "Tên hàng",
	unit: "ĐVT",
	quantity: "Số lượng bán",
	unitPrice: "Đơn giá",
	salesAmount: "Doanh số bán",
	paymentTotal: "Tổng thanh toán",
} satisfies Record<
	Exclude<keyof MisaSalesLine, "rowNumber" | "source" | "origin">,
	string
>;

export const salesColumns = Object.keys(
	salesHeaders,
) as (keyof typeof salesHeaders)[];

export interface MisaSalesImportPreview {
	book: MisaSalesBook;
	duplicateOf: ReadonlyMap<number, number>;
	customerAddresses?: ReadonlyMap<number, string>;
}
