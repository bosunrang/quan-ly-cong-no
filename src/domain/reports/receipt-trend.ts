export type ReceiptTrendBucket = {
	from: string;
	through: string;
	amount: number;
	count: number;
};

const dayInMs = 86_400_000;
const isoDay = (timestamp: number) =>
	new Date(timestamp).toISOString().slice(0, 10);

/** Chia kỳ thành các cột liên tiếp, kể cả những ngày không phát sinh khoản thu. */
export function receiptTrend(
	receipts: readonly { date: string; amount: number }[],
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
			};
		},
	);
	for (const receipt of receipts) {
		const day = (Date.parse(receipt.date) - start) / dayInMs;
		const bucket = buckets[Math.floor(day / daysPerBucket)];
		if (!bucket || day >= days) continue;
		bucket.amount += receipt.amount;
		bucket.count += 1;
	}
	return { buckets, daysPerBucket };
}
