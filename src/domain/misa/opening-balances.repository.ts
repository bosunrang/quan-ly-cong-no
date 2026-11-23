import { api } from "../../shared/api/client";
import type {
	OpeningBalancePlan,
	OpeningBalanceSource,
} from "./opening-balances";

export const openingBalancesResource = "opening-balances";

/** Số dư đầu kỳ đang dùng (null khi chưa nhập). */
export interface OpeningBalanceStatus {
	date: string;
	fileName: string;
	importedAt: string;
	customerCount: number;
	debitTotal: number;
	creditTotal: number;
	/** Dòng sổ bán hàng hạch toán đến ngày chốt: đã nằm trong số dư nên không tính thêm. */
	excludedSalesRows: number;
	/** Số khách đã phân bổ khoản thu vào số dư đầu kỳ: còn thì không xóa được. */
	allocatedCustomers: number;
	/** Số khách có số dư do nhân viên điền tay. */
	manualCount: number;
}

export type OpeningBalanceReview = OpeningBalancePlan["counts"] & {
	date: string;
	issues: string[];
	additionCount: number;
	additions: { misaCode: string; name: string }[];
	token: string;
};

export function previewOpeningBalances(source: OpeningBalanceSource) {
	return api<OpeningBalanceReview>("POST", "opening-balances/preview", {
		source,
	});
}

export function confirmOpeningBalances(
	source: OpeningBalanceSource,
	token: string,
) {
	return api<{ date: string; importedAt: string; customerCount: number }>(
		"POST",
		"opening-balances",
		{ source, token },
	);
}

export function removeOpeningBalances(expected: string) {
	return api<true>("DELETE", "opening-balances", { expected });
}

/** Số dư đầu kỳ của một khách (màn Công nợ phải thu). */
export interface CustomerOpeningBalance {
	/** Ngày chốt chung; null khi quản trị chưa đặt ngày chốt hay nhập báo cáo. */
	date: string | null;
	/** Dư Nợ trừ dư Có; 0 là chưa có số dư. */
	amount: number;
	source: "file" | "manual" | null;
	fileName: string;
	/** Đã phân bổ khoản thu vào số dư nên không sửa được. */
	locked: boolean;
}

export const customerOpeningBalanceResource = (customerId: string) =>
	`opening-balances/customers/${encodeURIComponent(customerId)}`;

export function saveCustomerOpeningBalance(
	customerId: string,
	amount: number,
	expected: number,
) {
	return api<true>("PUT", customerOpeningBalanceResource(customerId), {
		amount,
		expected,
	});
}

/** Đặt ngày chốt chung khi chưa có số dư, để nhân viên điền tay số dư từng khách. */
export function saveOpeningBalanceDate(date: string, expected: string | null) {
	return api<{ date: string; importedAt: string }>(
		"PUT",
		"opening-balances/date",
		{ date, expected },
	);
}
