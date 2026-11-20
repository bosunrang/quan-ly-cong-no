// Danh sách thẻ (màn hình) và quyền theo vai trò: một nguồn duy nhất cho máy chủ
// (server/access.cjs kiểm quyền từng route) và giao diện (thanh điều hướng, ô chọn thẻ
// trong màn hình Người dùng). Thêm một màn hình mới: thêm một dòng ở đây.
// `roles` là các vai trò được cấp thẻ này; quản trị luôn mở được mọi thẻ.

export const pages = Object.freeze([
  { id: "dashboard", roles: ["editor", "viewer"] },
  { id: "misa", roles: ["editor"] },
  { id: "receivables", roles: ["editor", "viewer"] },
  { id: "payments", roles: ["editor"] },
  { id: "reports", roles: ["editor", "viewer"] },
  { id: "customers", roles: ["editor"] },
  { id: "sales", roles: ["editor"] },
  { id: "users", roles: [] },
  { id: "audit", roles: [] },
  { id: "settings", roles: [] },
].map((page) => Object.freeze({ ...page, roles: Object.freeze(page.roles) })));

const forRole = (role) => Object.freeze(pages.filter(({ roles }) => roles.includes(role)).map(({ id }) => id));

export const pagesByRole = Object.freeze({ editor: forRole("editor"), viewer: forRole("viewer") });

/** Các thẻ có thể cấp cho vai trò; quản trị không cần cấp từng thẻ. */
export function grantablePages(role) {
  return role === "admin" ? [] : (pagesByRole[role] ?? []);
}

/** Tài khoản mở được thẻ nếu vai trò cho phép và (nếu có danh sách riêng) thẻ được cấp. */
export function canOpen(account, page) {
  if (account.role === "admin") return true;
  return grantablePages(account.role).includes(page) && (!account.pages || account.pages.includes(page));
}
