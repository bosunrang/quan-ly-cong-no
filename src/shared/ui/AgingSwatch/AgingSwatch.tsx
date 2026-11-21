// Ô màu nhóm tuổi nợ dùng chung cho Dashboard và Công nợ phải thu: cùng nhóm, cùng màu ở mọi màn.
// Màu là token --chart-aging-* (một sắc cam, nhạt đến đậm theo mức quá hạn; xám cho chưa có hạn).
const tones: Record<string, string> = {
	current: "current",
	"1-30": "30",
	"31-60": "60",
	"61-90": "90",
	"90+": "over",
	"no-due-date": "none",
};

/** Màu CSS của một nhóm tuổi nợ (mã nhóm như "1-30", "90+", "no-due-date"). */
export function agingColor(bucket: string) {
	const tone = tones[bucket];
	return tone ? `var(--chart-aging-${tone})` : undefined;
}

export function AgingSwatch({ bucket }: { bucket: string }) {
	const color = agingColor(bucket);
	if (!color) return null;
	return (
		<span
			className="aging-swatch"
			aria-hidden="true"
			style={{ background: color }}
		/>
	);
}
