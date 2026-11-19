import { Notice } from "../../shared/ui/Notice";
import { ArrowRightLeft, Building2, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { DateInput } from "../../shared/ui/DateInput/DateInput";
import type { Customer } from "../../domain/customers/customer.model";
import type { SalesEmployee } from "../../domain/employees/employee.model";
import {
	activeSalesAssignment,
	latestAssignmentBoundary,
} from "../../domain/assignments/assignment.service";
import { Dialog } from "../../shared/ui/Dialog/Dialog";
import { StatusPill } from "../../shared/ui/StatusPill";
import { formatDateOnly, isIsoDate, todayLocal } from "../../shared/lib/date";

interface AssignmentDialogProps {
	customers: Customer[];
	employee: SalesEmployee;
	error: string;
	onClose: () => void;
	onConfirm: (effectiveFrom: string) => void;
}

export function AssignmentDialog({
	customers,
	employee,
	error,
	onClose,
	onConfirm,
}: AssignmentDialogProps) {
	const [effectiveFrom, setEffectiveFrom] = useState(todayLocal);
	const transferCount = customers.filter((customer) => {
		const assignment = activeSalesAssignment(customer);
		return assignment && assignment.employeeId !== employee.id;
	}).length;
	const boundary = customers.map(latestAssignmentBoundary).sort().at(-1) ?? "";
	const validDate = isIsoDate(effectiveFrom);
	const conflictingDate = validDate && effectiveFrom <= boundary;

	return (
		<Dialog
			ariaLabelledBy="assignment-dialog-title"
			eyebrow="XÁC NHẬN PHÂN CÔNG"
			title={`Giao ${customers.length} khách hàng cho ${employee.name}`}
			icon={<ArrowRightLeft className="icon-size-19" />}
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
						disabled={!validDate || conflictingDate || !customers.length}
						onClick={() => onConfirm(effectiveFrom)}
					>
						<CheckCircle2 className="icon-size-16" /> Xác nhận phân công
					</button>
				</>
			}
		>
			<div className="dialog-body">
				{error && (
					<Notice tone="danger" announce>
						{error}
					</Notice>
				)}
				<div className="assignment-summary">
					<div>
						<Building2 className="icon-size-18" />
						<span>
							<strong>{customers.length - transferCount}</strong> phân công mới
						</span>
					</div>
					<div>
						<ArrowRightLeft className="icon-size-18" />
						<span>
							<strong>{transferCount}</strong> chuyển người phụ trách
						</span>
					</div>
				</div>
				<label
					className="assignment-date-field"
					htmlFor="assignment-effective-from"
				>
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
					<Notice tone="warning">
						Lịch sử của nhân viên cũ sẽ được đóng vào ngày liền trước ngày bắt
						đầu mới.
					</Notice>
				)}
				{conflictingDate && (
					<Notice tone="danger" announce>
						Ngày bắt đầu mới phải sau ngày {formatDateOnly(boundary)} để giữ
						đúng lịch sử phân công.
					</Notice>
				)}
			</div>
		</Dialog>
	);
}
