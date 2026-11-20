// Nhật ký sử dụng. Mọi thay đổi dữ liệu do máy chủ ghi; máy trạm chỉ tự ghi được việc chỉ
// xảy ra ở máy trạm (in, xuất Excel biên bản).
const { audit, fail } = require('../access.cjs');

const SMALL = 16 * 1024;
const pages = (list, maxBodyBytes = 0) => ({ pages: list, maxBodyBytes });
const clientActivities = new Set(['Mở hộp thoại in biên bản', 'Xuất Excel biên bản đối chiếu']);

function register(router, { db }) {
  router.get('/api/activities', () => db.readActivities(), pages(['audit']));
  router.post('/api/activities', ({ body: { category, action, detail }, account }) => {
    if (category !== 'reports' || !clientActivities.has(action) || typeof detail !== 'string')
      fail(400, 'Bản ghi nhật ký không hợp lệ.');
    return audit(db, account, category, action, detail);
  }, pages(['reports'], SMALL));
}

module.exports = { register };
