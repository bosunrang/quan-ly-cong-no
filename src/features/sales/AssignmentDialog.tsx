import { ArrowRightLeft, Building2, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import type { Customer } from "../../domain/customers/customer.model";
import type { SalesEmployee } from "../../domain/employees/employee.model";
import { activeSalesAssignment } from "../../domain/assignments/assignment.service";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { StatusPill } from "../../shared/ui/StatusPill";
import { formatDateOnly, todayLocal } from "../../shared/lib/date";

interface AssignmentDialogProps {
	customers: Customer[];
	employee: SalesEmployee;
	onClose: () => void;
	onConfirm: (effectiveFrom: string) => void;
}

export function AssignmentDialog({
	customers,
	employee,
	onClose,
	onConfirm,
}: AssignmentDialogProps) {
	const [effectiveFrom, setEffectiveFrom] = useState(todayLocal);
	const transferCount = customers.filter((customer) => {
		const assignment = activeSalesAssignment(customer);
		return assignment && assignment.employeeId !== employee.id;
	}).length;
	const conflictingAssignment = customers
		.map(activeSalesAssignment)
		.find(
			(assignment) =>
				assignment &&
				assignment.employeeId !== employee.id &&
				effectiveFrom <= assignment.effectiveFrom,
		);

	return (
		<Dialog
			ariaLabelledBy="assignment-dialog-title"
			eyebrow="XÁC NHẬN PHÂN CÔNG"
			title={`Giao ${customers.length} đơn vị cho ${employee.name}`}
			icon={<ArrowRightLeft size={19} />}
			className="assignment-dialog"
			onClose={onClose}
			footer={
				<>
					<button className="button secondary" type="button" onClick={onClose}>
						Hủy
					</button>
					<button
						className="button primary"
						type="button"
						disabled={Boolean(conflictingAssignment)}
						onClick={() => onConfirm(effectiveFrom)}
					>
						<CheckCircle2 size={16} /> Xác nhận phân công
					</button>
				</>
			}
		>
			<div className="dialog-body">
				<div className="assignment-summary">
					<div>
						<Building2 size={18} />
						<span>
							<strong>{customers.length}</strong> đơn vị được chọn
						</span>
					</div>
					<div>
						<ArrowRightLeft size={18} />
						<span>
							<strong>{transferCount}</strong> đơn vị cần chuyển giao
						</span>
					</div>
				</div>
				<label htmlFor="assignment-effective-from">
					Ngày bắt đầu phụ trách
					<DateInput
						id="assignment-effective-from"
						ariaLabel="Ngày bắt đầu phụ trách"
						value={effectiveFrom}
						onChange={setEffectiveFrom}
					/>
				</label>
				<div className="assignment-preview-list">
					{customers.map((customer) => {
						const assignment = activeSalesAssignment(customer);
						return (
							<article key={customer.id}>
								<div>
									<strong>{customer.name}</strong>
									<span>
										{customer.misaCode} · {customer.province}
									</span>
								</div>
								{assignment && assignment.employeeId !== employee.id ? (
									<StatusPill tone="warning">
										Chuyển từ {assignment.employeeName}
									</StatusPill>
								) : (
									<StatusPill tone="success">Phân công mới</StatusPill>
								)}
							</article>
						);
					})}
				</div>
				{transferCount > 0 && (
					<p className="assignment-warning">
						Lịch sử của nhân viên cũ sẽ được đóng vào ngày liền trước ngày bắt
						đầu mới.
					</p>
				)}
				{conflictingAssignment && (
					<p className="assignment-error">
						Ngày bắt đầu mới phải sau ngày{" "}
						{formatDateOnly(conflictingAssignment.effectiveFrom)}, là ngày phân
						công hiện tại bắt đầu.
					</p>
				)}
			</div>
		</Dialog>
	);
}
