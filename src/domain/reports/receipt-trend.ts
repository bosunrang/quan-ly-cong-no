export type ReceiptTrendBucket = {
	from: string;
	through: string;
	amount: number;
	count: number;
	/** Khoản thu kỳ trước bị hủy trong cột này; số tiền đã được trừ vào `amount`. */
	reversals: number;
};

const dayInMs = 86_400_000;
const isoDay = (timestamp: number) =>
	new Date(timestamp).toISOString().slice(0, 10);

/**
 * Chia kỳ thành các cột liên tiếp, kể cả những ngày không phát sinh khoản thu. Dòng hủy
 * (`reversedOn`) được tính vào ngày hủy với số tiền âm, để tổng các cột bằng tiền thu trong kỳ.
 */
export function receiptTrend(
	receipts: readonly { date: string; amount: number; reversedOn?: string }[],
	from: string,
	through: string,
) {
	const start = Date.parse(from);
	const days = (Date.parse(through) - start) / dayInMs + 1;
	const daysPerBucket = days <= 12 ? 1 : days <= 84 ? 7 : Math.ceil(days / 12);
	const buckets = Array.from(
		{ length: Math.ceil(days / daysPerBucket) },
		(_, index): ReceiptTrendBucket => {
			const firstDay = index * daysPerBucket;
			return {
				from: isoDay(start + firstDay * dayInMs),
				through: isoDay(
					start + (Math.min(days, firstDay + daysPerBucket) - 1) * dayInMs,
				),
				amount: 0,
				count: 0,
				reversals: 0,
			};
		},
	);
	for (const receipt of receipts) {
		const day =
			(Date.parse(receipt.reversedOn ?? receipt.date) - start) / dayInMs;
		const bucket = buckets[Math.floor(day / daysPerBucket)];
		if (!bucket || day >= days) continue;
		bucket.amount += receipt.amount;
		if (receipt.reversedOn) bucket.reversals += 1;
		else bucket.count += 1;
	}
	return { buckets, daysPerBucket };
}
