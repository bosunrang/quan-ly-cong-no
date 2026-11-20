// Nhật ký sử dụng. Mọi thay đổi dữ liệu do máy chủ ghi; máy trạm chỉ tự ghi được việc chỉ
// xảy ra ở máy trạm (in, xuất Excel biên bản).
const { audit, fail } = require('../access.cjs');
const { paging } = require('./helpers.cjs');

const SMALL = 16 * 1024;
const pages = (list, maxBodyBytes = 0) => ({ pages: list, maxBodyBytes });
const clientActivities = new Set(['Mở hộp thoại in biên bản', 'Xuất Excel biên bản đối chiếu']);

// Bộ lọc dùng chung cho trang nhật ký và tệp CSV: người thực hiện, nhóm thao tác và từ khóa
// (SQLite so với chuỗi đã bỏ dấu gồm tên người, thao tác và chi tiết).
function activityFilter(query) {
  const needle = query.get('q') ?? '';
  if (needle.length > 200) fail(400, 'Từ khóa tìm kiếm quá dài.');
  return { needle, actor: query.get('actor') || undefined, category: query.get('category') || undefined };
}

function register(router, { db }) {
  router.get('/api/activities', ({ query }) => {
    const { page, limit } = paging(query, 25);
    return db.activityPage(activityFilter(query), page, limit);
  }, pages(['audit']));
  router.get('/api/activities/export', ({ query }) => db.activityExport(activityFilter(query)), pages(['audit']));
  router.post('/api/activities', ({ body: { category, action, detail }, account }) => {
    if (category !== 'reports' || !clientActivities.has(action) || typeof detail !== 'string')
      fail(400, 'Bản ghi nhật ký không hợp lệ.');
    return audit(db, account, category, action, detail);
  }, pages(['reports'], SMALL));
}

module.exports = { register };
