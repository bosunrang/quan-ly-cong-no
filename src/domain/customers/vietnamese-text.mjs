// Bỏ dấu và chuẩn hóa chữ tiếng Việt để tìm kiếm. Dùng chung cho giao diện và máy chủ
// (SQLite lưu sẵn chuỗi đã chuẩn hóa của nhật ký), nên mọi nơi tìm theo cùng một quy tắc.
export function normalizeVietnamese(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
