import { useCallback, useEffect, useMemo, useState } from "react";

export function usePagination<T>(items: readonly T[], initialPageSize = 25) {
	const [requestedPage, setRequestedPage] = useState(1);
	const [pageSize, setPageSizeState] = useState(initialPageSize);
	const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
	const currentPage = Math.min(requestedPage, pageCount);

	useEffect(() => {
		if (requestedPage !== currentPage) setRequestedPage(currentPage);
	}, [currentPage, requestedPage]);

	const pageItems = useMemo(() => {
		const start = (currentPage - 1) * pageSize;
		return items.slice(start, start + pageSize);
	}, [currentPage, items, pageSize]);

	const setCurrentPage = useCallback(
		(page: number) => {
			setRequestedPage(Math.min(Math.max(1, page), pageCount));
		},
		[pageCount],
	);

	const setPageSize = useCallback((size: number) => {
		setPageSizeState(Math.max(1, Math.floor(size)));
		setRequestedPage(1);
	}, []);

	const resetPage = useCallback(() => setRequestedPage(1), []);
	const firstVisible =
		items.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
	const lastVisible = Math.min(currentPage * pageSize, items.length);

	return {
		currentPage,
		pageCount,
		pageSize,
		pageItems,
		firstVisible,
		lastVisible,
		setCurrentPage,
		setPageSize,
		resetPage,
	};
}
