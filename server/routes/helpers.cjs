// Hàm dùng chung cho các route tính tiền: phân trang, tìm kiếm, kỳ báo cáo, mã lỗi.
const { fail } = require('../access.cjs');
const domain = require('../domain.cjs');

const small = 64 * 1024;
const large = 64 * 1024 * 1024;
const opts = (pages, maxBodyBytes = 0) => ({ pages, maxBodyBytes });
const normalize = domain.normalizeVietnamese;
const docOrder = new Intl.Collator('vi-VN', { numeric: true });

function paging(query, defaultSize = 20) {
  const positive = (value, fallback, max) => {
    if (value === null) return fallback;
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(+value) || +value < 1 || +value > max)
      fail(400, 'Thông số phân trang không hợp lệ.');
    return +value;
  };
  return { page: positive(query.get('page'), 1, 1_000_000), limit: positive(query.get('limit'), defaultSize, 100) };
}

function pageOf(items, query, size) {
  const { page: requested, limit } = paging(query, size);
  const page = Math.min(requested, Math.max(1, Math.ceil(items.length / limit)));
  return { items: items.slice((page - 1) * limit, page * limit), total: items.length, page, limit };
}

const customerSummary = ({ documents, ...item }) => ({ ...item, documentCount: documents.length });
const documentSummary = ({ lines, ...item }) => item;
const find = (items, id, label) => items.find((item) => item.id === id) ?? fail(404, 'Không tìm thấy ' + label + '.');
const search = (query) => normalize(query.get('q') ?? '');

function period(query) {
  const from = query.get('from');
  const through = query.get('through');
  if (!domain.isIsoDate(from) || !domain.isIsoDate(through) || from > through)
    fail(400, 'Khoảng ngày không hợp lệ.');
  return [from, through];
}

// Lỗi có mã (400 dữ liệu nhập sai, 404, 409...) giữ nguyên; lỗi lập trình (TypeError...) để thành
// 500 và được ghi log; còn lại là xung đột nghiệp vụ với sổ hiện tại (409).
const programmingErrors = [TypeError, ReferenceError, RangeError, SyntaxError];
function domainChange(action) {
  try { return action(); }
  catch (error) {
    if (error.status || programmingErrors.some((type) => error instanceof type)) throw error;
    fail(409, error.message);
  }
}

module.exports = { small, large, opts, normalize, docOrder, paging, pageOf, customerSummary, documentSummary,
  find, search, period, domainChange };
