import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../api/client";

const changed = "accounting-changed";
let channel: BroadcastChannel | undefined;

function accountingChannel() {
	if (typeof window.BroadcastChannel === "function") {
		channel ??= new window.BroadcastChannel(changed);
	}
	return channel;
}

export function accountingChanged() {
	window.dispatchEvent(new Event(changed));
	accountingChannel()?.postMessage(changed);
}

export function resourceWithQuery(
	resource: string,
	params: Record<string, string | number | undefined>,
) {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(params))
		if (value !== undefined) query.set(key, String(value));
	return query.size ? `${resource}?${query.toString()}` : resource;
}

export function useServerData<T>(resource?: string) {
	const [request, setRequest] = useState(0);
	const [result, setResult] = useState<{
		resource: string;
		request: number;
		data?: T;
		error?: string;
	}>();
	const refresh = useCallback(() => setRequest((value) => value + 1), []);
	useEffect(() => {
		if (!resource) return;
		let active = true;
		void api<T>("GET", resource)
			.then((data) => {
				if (active) setResult({ resource, request, data });
			})
			.catch((reason: unknown) => {
				if (!active) return;
				const error =
					reason instanceof Error ? reason.message : "Không thể tải dữ liệu.";
				// Lỗi tạm thời (mất mạng, máy chủ đang khởi động lại) khi tải lại nền: giữ dữ liệu đang
				// xem để không đóng ngăn chi tiết hay hộp thoại đang nhập dở. Lỗi 4xx thì bỏ dữ liệu cũ.
				const transient =
					!(reason instanceof ApiError) ||
					reason.status === 0 ||
					reason.status >= 500;
				setResult((previous) => ({
					resource,
					request,
					data:
						transient && previous?.resource === resource
							? previous.data
							: undefined,
					error,
				}));
			});
		return () => {
			active = false;
		};
	}, [resource, request]);
	useEffect(() => {
		if (!resource) return;
		const changes = accountingChannel();
		window.addEventListener("focus", refresh);
		window.addEventListener(changed, refresh);
		changes?.addEventListener("message", refresh);
		return () => {
			window.removeEventListener("focus", refresh);
			window.removeEventListener(changed, refresh);
			changes?.removeEventListener("message", refresh);
		};
	}, [resource, refresh]);
	const current =
		resource && resource === result?.resource ? result : undefined;
	return {
		data: current?.data,
		previous: resource ? result?.data : undefined,
		previousResource: resource ? result?.resource : undefined,
		loading: Boolean(resource && (!current || current.request !== request)),
		error: current?.request === request ? current?.error : undefined,
		refresh,
	};
}

export function pageControls(page: number, limit: number, total: number) {
	return {
		firstVisible: total ? Math.min((page - 1) * limit + 1, total) : 0,
		lastVisible: Math.min(page * limit, total),
		pageCount: Math.max(1, Math.ceil(total / limit)),
	};
}
