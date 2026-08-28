import { describe, expect, it, vi } from "vitest";
import type {
	Customer,
	CustomerDraft,
	DiscountRecipient,
} from "../src/domain/customers/customer.model";
import {
	createCustomerFromDraft,
	createCustomerFromImport,
	customerToDraft,
	saveRecipientToCustomer,
	updateCustomerFromDraft,
} from "../src/domain/customers/customer.service";

const baseDraft: CustomerDraft = {
	misaCode: " KH-001 ",
	name: " Khách hàng A ",
	group: "state",
	taxCode: " 0101 ",
	province: "Hà Nội",
	address: " Số 1 ",
	status: "active",
	recipientName: " Nguyễn Văn A ",
	recipientPosition: " Kế toán ",
	recipientPhone: " 0901 ",
	recipientFrom: "2026-03-01",
};

function customer(recipients: DiscountRecipient[] = []): Customer {
	return {
		id: "CUS-001",
		misaCode: "KH-001",
		name: "Khách hàng A",
		group: "state",
		taxCode: "0101",
		province: "Hà Nội",
		address: "Số 1",
		status: "active",
		assignments: [],
		recipients,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

const primaryRecipient: DiscountRecipient = {
	id: "RCP-001",
	fullName: "Nguyễn Văn A",
	position: "Kế toán",
	phone: "0901",
	effectiveFrom: "2026-01-01",
	effectiveTo: null,
	isPrimary: true,
	active: true,
};

describe("customer service", () => {
	it("tạo draft mặc định và draft từ hồ sơ hiện có", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-05T08:00:00.000Z"));
		expect(customerToDraft()).toMatchObject({
			misaCode: "",
			group: "state",
			status: "active",
			recipientFrom: "2026-04-05",
		});
		expect(customerToDraft(customer([primaryRecipient]))).toMatchObject({
			misaCode: "KH-001",
			recipientName: "Nguyễn Văn A",
			recipientFrom: "2026-01-01",
		});
		vi.useRealTimers();
	});

	it("tạo khách hàng thủ công, có hoặc không có người nhận", () => {
		const created = createCustomerFromDraft(baseDraft);
		expect(created).toMatchObject({
			misaCode: "KH-001",
			name: "Khách hàng A",
			taxCode: "0101",
			address: "Số 1",
		});
		expect(created.recipients[0]).toMatchObject({
			fullName: "Nguyễn Văn A",
			position: "Kế toán",
			phone: "0901",
			isPrimary: true,
			active: true,
		});

		const withoutRecipient = createCustomerFromDraft({
			...baseDraft,
			recipientName: "  ",
		});
		expect(withoutRecipient.recipients).toEqual([]);
	});

	it("tạo khách hàng nhập Excel và chuẩn hóa khoảng trắng", () => {
		expect(
			createCustomerFromImport({
				misaCode: " KH-002 ",
				name: " Đơn vị B ",
				group: "private",
				province: " Hà Nội ",
				address: " Số 2 ",
			}),
		).toMatchObject({
			misaCode: "KH-002",
			name: "Đơn vị B",
			province: "Hà Nội",
			address: "Số 2",
			status: "active",
			recipients: [],
			assignments: [],
		});
	});

	it("giữ nguyên lịch sử người nhận khi thông tin không đổi", () => {
		const result = updateCustomerFromDraft(
			customer([primaryRecipient]),
			baseDraft,
		);
		expect(result.recipients).toEqual([primaryRecipient]);
		expect(result.assignments).toEqual([]);
	});

	it("đóng người nhận cũ và tạo lượt mới khi thông tin đổi", () => {
		const result = updateCustomerFromDraft(customer([primaryRecipient]), {
			...baseDraft,
			recipientName: "Người mới",
			recipientFrom: "2026-03-01",
		});
		expect(result.recipients).toHaveLength(2);
		expect(result.recipients[0]).toMatchObject({
			id: "RCP-001",
			active: false,
			effectiveTo: "2026-02-28",
		});
		expect(result.recipients[1]).toMatchObject({
			fullName: "Người mới",
			active: true,
			effectiveFrom: "2026-03-01",
		});

		const removed = updateCustomerFromDraft(customer([primaryRecipient]), {
			...baseDraft,
			recipientName: "",
		});
		expect(removed.recipients).toHaveLength(1);
		expect(removed.recipients[0].active).toBe(false);
	});

	it("thêm và sửa người nhận, đồng thời duy trì đúng một người mặc định", () => {
		const added = saveRecipientToCustomer(customer([primaryRecipient]), {
			fullName: " Người B ",
			position: " Mua hàng ",
			phone: " 0902 ",
			effectiveFrom: "2026-04-01",
			isPrimary: true,
		});
		expect(added.recipients[0].isPrimary).toBe(false);
		expect(added.recipients[1]).toMatchObject({
			fullName: "Người B",
			position: "Mua hàng",
			phone: "0902",
			isPrimary: true,
		});

		const edited = saveRecipientToCustomer(
			added,
			{
				fullName: "Người B sửa",
				position: "",
				phone: "",
				effectiveFrom: "2026-05-01",
				isPrimary: false,
			},
			added.recipients[1].id,
		);
		expect(edited.recipients[1]).toMatchObject({
			fullName: "Người B sửa",
			active: true,
			effectiveTo: null,
			isPrimary: false,
		});
		expect(edited.recipients[0].isPrimary).toBe(true);

		const first = saveRecipientToCustomer(customer(), {
			fullName: "Người đầu tiên",
			position: "",
			phone: "",
			effectiveFrom: "2026-01-01",
			isPrimary: false,
		});
		expect(first.recipients[0].isPrimary).toBe(true);
	});
});
