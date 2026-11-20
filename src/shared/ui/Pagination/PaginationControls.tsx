import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationControlsProps {
	currentPage: number;
	pageCount: number;
	onPageChange: (page: number) => void;
	previousLabel: string;
	nextLabel: string;
	showPageWord?: boolean;
	disabled?: boolean;
}

export function PaginationControls({
	currentPage,
	pageCount,
	onPageChange,
	previousLabel,
	nextLabel,
	showPageWord = false,
	disabled = false,
}: PaginationControlsProps) {
	return (
		<div className="pagination-controls">
			<button
				className="row-action"
				type="button"
				onClick={() => onPageChange(currentPage - 1)}
				disabled={disabled || currentPage <= 1}
				aria-label={previousLabel}
			>
				<ChevronLeft className="icon-size-16" />
			</button>
			<span>
				{showPageWord && "Trang "}
				<strong>{currentPage}</strong> / {pageCount}
			</span>
			<button
				className="row-action"
				type="button"
				onClick={() => onPageChange(currentPage + 1)}
				disabled={disabled || currentPage >= pageCount}
				aria-label={nextLabel}
			>
				<ChevronRight className="icon-size-16" />
			</button>
		</div>
	);
}
