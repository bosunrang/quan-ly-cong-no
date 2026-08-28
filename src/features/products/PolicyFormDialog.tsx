import { BadgeDollarSign, Search, UserRound } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type { Customer } from "../../domain/customers/customer.model";
import { currentRecipient } from "../../domain/customers/customer.selectors";
import type {
	CustomerProductPolicy,
	PolicyRecipientAllocation,
	Product,
} from "../../domain/products/product.model";
import type { PolicyDraft } from "../../domain/products/product-policy.service";
import { todayLocal } from "../../shared/lib/date";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import { Dialog } from "../../shared/ui/Dialog/Dialog";

interface Props {
	product: Product;
	customers: Customer[];
	policy?: CustomerProductPolicy;
	onClose: () => void;
	onSave: (draft: PolicyDraft) => void;
}

type AllocationAmounts = Record<string, Record<string, number>>;
const number = new Intl.NumberFormat("vi-VN");

function initialAmounts(
	customers: Customer[],
	policy?: CustomerProductPolicy,
): AllocationAmounts {
	if (policy)
		return {
			[policy.customerId]: Object.fromEntries(
				policy.recipientAllocations.map((allocation) => [
					allocation.recipientId,
					allocation.amount,
				]),
			),
		};
	return Object.fromEntries(
		customers.map((customer) => {
			const recipient = currentRecipient(customer);
			return [customer.id, recipient ? { [recipient.id]: 0 } : {}];
		}),
	);
}

function initialRetainedAmounts(
	customers: Customer[],
	policy?: CustomerProductPolicy,
): AllocationAmounts {
	if (policy)
		return {
			[policy.customerId]: Object.fromEntries(
				policy.recipientAllocations.map((allocation, index) => [
					allocation.recipientId,
					allocation.retainedAmount ??
						(index === 0 ? (policy.retainedAmount ?? 0) : 0),
				]),
			),
		};
	return Object.fromEntries(customers.map((customer) => [customer.id, {}]));
}

export function PolicyFormDialog({
	product,
	customers,
	policy,
	onClose,
	onSave,
}: Props) {
	const [selected, setSelected] = useState<string[]>(
		policy ? [policy.customerId] : [],
	);
	const [amounts, setAmounts] = useState<AllocationAmounts>(() =>
		initialAmounts(customers, policy),
	);
	const [retainedAmounts, setRetainedAmounts] = useState<AllocationAmounts>(
		() => initialRetainedAmounts(customers, policy),
	);
	const [query, setQuery] = useState("");
	const [effectiveFrom, setEffectiveFrom] = useState(todayLocal());
	const [effectiveTo, setEffectiveTo] = useState("");
	const [note, setNote] = useState(policy?.note ?? "");
	const [error, setError] = useState("");
	const activeCustomers = useMemo(
		() =>
			customers.filter(
				(customer) =>
					(customer.status === "active" ||
						customer.id === policy?.customerId) &&
					(!policy || customer.id === policy.customerId) &&
					`${customer.misaCode} ${customer.name} ${customer.province}`
						.toLocaleLowerCase("vi-VN")
						.includes(query.toLocaleLowerCase("vi-VN")),
			),
		[customers, policy, query],
	);

	const toggleCustomer = (id: string) =>
		setSelected((current) =>
			current.includes(id)
				? current.filter((item) => item !== id)
				: [...current, id],
		);
	const toggleRecipient = (customerId: string, recipientId: string) =>
		setAmounts((current) => {
			const customerAmounts = { ...(current[customerId] ?? {}) };
			if (recipientId in customerAmounts) {
				delete customerAmounts[recipientId];
				setRetainedAmounts((retained) => {
					const customerRetained = { ...(retained[customerId] ?? {}) };
					delete customerRetained[recipientId];
					return { ...retained, [customerId]: customerRetained };
				});
			} else {
				customerAmounts[recipientId] = 0;
				setRetainedAmounts((retained) => ({
					...retained,
					[customerId]: {
						...(retained[customerId] ?? {}),
						[recipientId]: 0,
					},
				}));
			}
			return { ...current, [customerId]: customerAmounts };
		});
	const setRecipientAmount = (
		customerId: string,
		recipientId: string,
		amount: number,
	) =>
		setAmounts((current) => ({
			...current,
			[customerId]: { ...(current[customerId] ?? {}), [recipientId]: amount },
		}));
	const setRecipientRetainedAmount = (
		customerId: string,
		recipientId: string,
		amount: number,
	) =>
		setRetainedAmounts((current) => ({
			...current,
			[customerId]: { ...(current[customerId] ?? {}), [recipientId]: amount },
		}));

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const recipientAllocationsByCustomer = Object.fromEntries(
			selected.map((customerId) => [
				customerId,
				Object.entries(amounts[customerId] ?? {}).map(
					([recipientId, amount]): PolicyRecipientAllocation => ({
						recipientId,
						amount,
						retainedAmount: retainedAmounts[customerId]?.[recipientId] ?? 0,
					}),
				),
			]),
		);
		try {
			onSave({
				productId: product.id,
				customerIds: selected,
				recipientAllocationsByCustomer,
				calculationType: "fixed",
				value: 0,
				effectiveFrom,
				effectiveTo: effectiveTo || null,
				note,
			});
			onClose();
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Không thể lưu chính sách.",
			);
		}
	};

	return (
		<Dialog
			className="policy-form-dialog"
			ariaLabelledBy="policy-form-title"
			eyebrow={`${product.code} · ${product.name}`}
			title={
				policy
					? "Tạo phiên bản chính sách mới"
					: "Thiết lập chính sách theo đơn vị"
			}
			icon={<BadgeDollarSign size={19} />}
			onClose={onClose}
			onSubmit={submit}
			footer={
				<>
					<span className="policy-selected-count">
						{policy
							? "Bản cũ được giữ trong lịch sử"
							: `Đã chọn ${selected.length} đơn vị`}
					</span>
					<button className="button secondary" type="button" onClick={onClose}>
						Hủy
					</button>
					<button className="button primary" type="submit">
						{policy ? "Lưu phiên bản mới" : "Áp dụng chính sách"}
					</button>
				</>
			}
		>
			<div className="dialog-body policy-form-body">
				{error && <p className="form-alert">{error}</p>}
				<section className="policy-customer-picker">
					<div className="policy-picker-head">
						<strong>1. Đơn vị và mức tiền theo người nhận</strong>
						{!policy && (
							<button
								className="text-button"
								type="button"
								onClick={() =>
									setSelected(activeCustomers.map((item) => item.id))
								}
							>
								Chọn tất cả kết quả
							</button>
						)}
					</div>
					{!policy && (
						<span className="policy-search">
							<Search size={15} />
							<input
								aria-label="Tìm đơn vị áp dụng"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Tìm tên, mã hoặc tỉnh thành..."
							/>
						</span>
					)}
					<div className="policy-customer-list policy-allocation-customers">
						{activeCustomers.map((customer) => {
							const recipients = customer.recipients.filter(
								(recipient) => recipient.active && !recipient.effectiveTo,
							);
							const checked = selected.includes(customer.id);
							const customerAmounts = amounts[customer.id] ?? {};
							const customerRetained = retainedAmounts[customer.id] ?? {};
							const total = Object.values(customerAmounts).reduce(
								(sum, amount) => sum + (Number.isFinite(amount) ? amount : 0),
								0,
							);
							const retainedTotal = Object.keys(customerAmounts).reduce(
								(sum, recipientId) =>
									sum + (customerRetained[recipientId] ?? 0),
								0,
							);
							return (
								<article
									key={customer.id}
									className={checked ? "is-selected" : ""}
								>
									<label className="policy-customer-check">
										<input
											type="checkbox"
											disabled={Boolean(policy)}
											checked={checked}
											onChange={() => toggleCustomer(customer.id)}
										/>
										<span>
											<strong>{customer.name}</strong>
											<small>
												{customer.misaCode} · {customer.province} ·{" "}
												{recipients.length} người nhận
											</small>
										</span>
									</label>
									{checked && (
										<div className="recipient-allocation-list">
											{recipients.map((recipient) => {
												const included = recipient.id in customerAmounts;
												return (
													<div
														key={recipient.id}
														className={included ? "is-included" : ""}
													>
														<label className="recipient-allocation-check">
															<input
																type="checkbox"
																checked={included}
																onChange={() =>
																	toggleRecipient(customer.id, recipient.id)
																}
															/>
															<span>
																<UserRound size={14} />
																<strong>{recipient.fullName}</strong>
																<small>
																	{recipient.position || "Chưa có chức vụ"}
																	{recipient.isPrimary ? " · Mặc định" : ""}
																</small>
															</span>
														</label>
														<div className="recipient-money-fields">
															<label>
																<span>Mức chính sách</span>
																<div className="recipient-amount">
																	<input
																		aria-label={`Mức chính sách của ${recipient.fullName}`}
																		type="text"
																		inputMode="numeric"
																		disabled={!included}
																		value={
																			included
																				? number.format(
																						customerAmounts[recipient.id],
																					)
																				: ""
																		}
																		onChange={(event) =>
																			setRecipientAmount(
																				customer.id,
																				recipient.id,
																				Number(
																					event.target.value.replace(/\D/g, ""),
																				),
																			)
																		}
																	/>
																	<em>₫ / {product.unit}</em>
																</div>
															</label>
															<label>
																<span>Giữ lại</span>
																<div className="recipient-amount">
																	<input
																		aria-label={`Chi phí giữ lại của ${recipient.fullName}`}
																		type="text"
																		inputMode="numeric"
																		disabled={!included}
																		value={
																			included
																				? number.format(
																						customerRetained[recipient.id] ?? 0,
																					)
																				: ""
																		}
																		onChange={(event) =>
																			setRecipientRetainedAmount(
																				customer.id,
																				recipient.id,
																				Number(
																					event.target.value.replace(/\D/g, ""),
																				),
																			)
																		}
																	/>
																	<em>₫ / {product.unit}</em>
																</div>
															</label>
														</div>
													</div>
												);
											})}
											{recipients.length === 0 && (
												<p className="recipient-allocation-empty">
													Đơn vị chưa có người nhận chiết khấu. Hãy cập nhật
													trong hồ sơ khách hàng.
												</p>
											)}
											<div className="recipient-allocation-total">
												<div>
													<span>Tổng chính sách của đơn vị</span>
													<small>
														Thực nhận{" "}
														{number.format(Math.max(0, total - retainedTotal))}{" "}
														₫ / {product.unit}
													</small>
												</div>
												<strong>
													{number.format(total)} ₫ / {product.unit}
												</strong>
											</div>
										</div>
									)}
								</article>
							);
						})}
					</div>
				</section>
				<section className="policy-value-section">
					<strong>2. Thời gian hiệu lực</strong>
					<div className="dialog-grid">
						<label htmlFor="policy-effective-from">
							Hiệu lực từ
							<DateInput
								id="policy-effective-from"
								value={effectiveFrom}
								onChange={setEffectiveFrom}
								ariaLabel="Hiệu lực từ"
							/>
						</label>
						<label htmlFor="policy-effective-to">
							Kết thúc (không bắt buộc)
							<DateInput
								id="policy-effective-to"
								value={effectiveTo}
								onChange={setEffectiveTo}
								ariaLabel="Ngày kết thúc"
							/>
						</label>
					</div>
					<label>
						Ghi chú
						<input
							value={note}
							onChange={(event) => setNote(event.target.value)}
							placeholder="Ví dụ: chính sách theo hợp đồng 2026"
						/>
					</label>
				</section>
			</div>
		</Dialog>
	);
}
