import type { DatabaseEnvelope } from "./storage.types";
import { api } from "../api/client";

// Bộ nhớ đệm dùng chung cho các sổ lớn (sổ bán hàng, sổ đối soát).
// Mỗi lần đọc chỉ hỏi "dấu thay đổi" (phiên bản + thời điểm ghi) từ máy chủ;
// sổ chỉ được tải lại và giải mã khi dấu khác bản đang giữ. Các trang nhận lại đúng
// đối tượng cũ nên React bỏ qua việc tính lại khi dữ liệu không đổi.

interface CachedDataset {
	stamp: string | null;
	value: unknown;
}

const cache = new Map<string, CachedDataset>();
const loading = new Map<string, Promise<unknown>>();

async function readStamp(key: string): Promise<string | null> {
	return (await api<string | null>("GET", `${key}/stamp`)) ?? null;
}

async function readEnvelope(key: string): Promise<DatabaseEnvelope | null> {
	return (await api<DatabaseEnvelope | null>("GET", key)) ?? null;
}

/**
 * Đọc một sổ lớn qua máy chủ, dùng lại bản đã giải mã khi sổ chưa đổi.
 * `decode` phải trả về dữ liệu không bị sửa tại chỗ về sau, vì nhiều trang dùng chung.
 */
export async function readCachedDataset<T>(
	key: string,
	decode: (envelope: DatabaseEnvelope | null) => T,
): Promise<T> {
	const id = key;
	const stamp = await readStamp(key);
	const cached = cache.get(id);
	if (cached && cached.stamp === stamp) return cached.value as T;

	// Nhiều trang cùng hỏi một sổ (ví dụ khi cửa sổ được chọn lại) chỉ tải một lần.
	const loadId = `${id}|${stamp}`;
	let pending = loading.get(loadId) as Promise<T> | undefined;
	if (!pending) {
		pending = readEnvelope(key)
			.then((envelope) => {
				const value = decode(envelope);
				// Nếu sổ đổi giữa lúc đọc dấu và lúc tải, lần đọc sau thấy dấu mới và tải lại.
				cache.set(id, { stamp, value });
				return value;
			})
			.finally(() => loading.delete(loadId));
		loading.set(loadId, pending);
	}
	return pending;
}

/** Bỏ bản đệm sau khi chính máy này ghi sổ hoặc khi dữ liệu bị thay thế. */
export function forgetCachedDataset(key?: string) {
	if (key === undefined) cache.clear();
	else cache.delete(key);
}
