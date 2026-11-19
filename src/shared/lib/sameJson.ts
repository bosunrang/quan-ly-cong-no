/** So sánh hai giá trị JSON theo nội dung (dùng cho danh mục nhỏ đọc lại từ kho). */
export function sameJson(left: unknown, right: unknown): boolean {
	return left === right || JSON.stringify(left) === JSON.stringify(right);
}
