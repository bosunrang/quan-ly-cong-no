// API của máy chủ một công ty: mỗi màn hình một tệp route trong server/routes (như app cước phí).
// Mặc định cấm: mọi route ngoài PUBLIC_ROUTES cần phiên hợp lệ và đúng thẻ được khai báo.
const { requirePage, fail } = require('./access.cjs');
const { createRouter, readJsonBody, sendJson } = require('./http.cjs');
const { createAccountingState } = require('./accounting-state.cjs');
const { customerScope } = require('./customer-scope.cjs');

const PUBLIC_ROUTES = new Set(['POST /api/session', 'GET /api/branding']);
// Các thẻ được đọc danh mục khách hàng và nhân viên.
const directoryReaders = ['dashboard', 'misa', 'payments', 'receivables', 'reports', 'customers', 'sales'];

function createApi(tenant) {
  const { db, access, devLoginKey } = tenant;
  const router = createRouter();
  require('./routes/auth.cjs').register(router, tenant);
  if (devLoginKey) {
    router.post('/api/dev-login', ({ req, res }) => {
      if (req.headers['x-cong-no-dev-login'] !== devLoginKey) fail(403, 'Chỉ tự đăng nhập qua máy chủ Vite cục bộ.');
      return access.devLogin(req, res);
    }, { pages: [], maxBodyBytes: 0 });
  }
  require('./routes/settings.cjs').register(router, tenant);
  require('./routes/customers.cjs').register(router, db, directoryReaders);
  require('./routes/employees.cjs').register(router, db, directoryReaders);
  const state = createAccountingState(db);
  for (const name of ['misa', 'dashboard', 'receivables', 'opening-balances', 'reports', 'payments'])
    require('./routes/' + name + '.cjs').register(router, db, state);
  require('./routes/audit.cjs').register(router, tenant);

  return async (req, res, pathname, origin) => {
    const query = new URLSearchParams(String(req.url).split("?").slice(1).join("?"));
    if (req.headers['x-cong-no-lan'] !== '1' ||
        (req.headers.origin && req.headers.origin !== origin))
      fail(403, 'Yêu cầu khác nguồn bị từ chối.');
    const route = router.match(req.method, pathname);
    if (!route) fail(404, 'Chức năng không tồn tại.');
    let account;
    const devLogin = devLoginKey && req.method === 'POST' && pathname === '/api/dev-login';
    if (!devLogin && !PUBLIC_ROUTES.has(req.method + ' ' + pathname)) {
      account = access.actor(req, route.options.allowPending);
      requirePage(account, route.options.pages);
    }
    const body = route.options.maxBodyBytes ? await readJsonBody(req, route.options.maxBodyBytes) : {};
    if (!route.options.maxBodyBytes && (Number(req.headers['content-length']) > 0 || req.headers['transfer-encoding']))
      fail(413, 'Yêu cầu này không nhận dữ liệu gửi lên.');
    if (account && route.options.maxBodyBytes) {
      account = access.actor(req, route.options.allowPending);
      requirePage(account, route.options.pages);
    }
    const scope = account ? customerScope(db, account) : undefined;
    const value = await route.handler({ req, res, params: route.params, body, account, query, scope });
    sendJson(res, 200, { ok: true, value });
  };
}

module.exports = { createApi };
