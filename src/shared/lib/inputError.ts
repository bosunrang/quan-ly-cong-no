/**
 * Lỗi do dữ liệu người dùng nhập sai (ngày, số tiền, thiếu thông tin…), khác với lỗi do sổ vừa
 * thay đổi. Máy chủ trả mã 400 cho lỗi này; lỗi nghiệp vụ khác là 409.
 */
export class InputError extends Error {
	readonly status = 400;
}
