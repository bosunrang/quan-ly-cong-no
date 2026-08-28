import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationControlsProps {
	currentPage: number;
	pageCount: number;
	onPageChange: (page: number) => void;
	previousLabel: string;
	nextLabel: string;
	showPageWord?: boolean;
}

export function PaginationControls({
	currentPage,
	pageCount,
	onPageChange,
	previousLabel,
	nextLabel,
	showPageWord = false,
}: PaginationControlsProps) {
	return (
		<div className="pagination-controls">
			<button
				type="button"
				onClick={() => onPageChange(currentPage - 1)}
				disabled={currentPage <= 1}
				aria-label={previousLabel}
			>
				<ChevronLeft size={16} />
			</button>
			<span>
				{showPageWord && "Trang "}
				<strong>{currentPage}</strong> / {pageCount}
			</span>
			<button
				type="button"
				onClick={() => onPageChange(currentPage + 1)}
				disabled={currentPage >= pageCount}
				aria-label={nextLabel}
			>
				<ChevronRight size={16} />
			</button>
		</div>
	);
}
