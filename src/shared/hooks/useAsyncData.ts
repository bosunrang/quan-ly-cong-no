import { useEffect, useState } from "react";

export function useAsyncData<T>(read: () => Promise<T>) {
	const [data, setData] = useState<T>();
	const [error, setError] = useState("");
	useEffect(() => {
		let active = true;
		void read()
			.then((value) => {
				if (active) setData(value);
			})
			.catch((reason: unknown) => {
				if (active)
					setError(
						reason instanceof Error ? reason.message : "Không thể tải dữ liệu.",
					);
			});
		return () => {
			active = false;
		};
	}, [read]);
	return { data, setData, error, loading: data === undefined && !error };
}
