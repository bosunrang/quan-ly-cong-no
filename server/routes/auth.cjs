// Đăng nhập, phiên, đổi mật khẩu được cấp và quản lý tài khoản (logic ở server/access.cjs).
const SMALL = 16 * 1024;
const pages = (list, maxBodyBytes = 0, options = {}) => ({ pages: list, maxBodyBytes, ...options });

function register(router, { access }) {
  const auth = (operation, transform = (body) => body) =>
    ({ body, params, req, res }) => access.handle(operation, transform(body, params), req, res);
  const pending = { allowPending: true };
  router.post('/api/session', auth('login'), pages([], SMALL));
  router.get('/api/session', auth('session'), pages([], 0, pending));
  router.delete('/api/session', auth('logout'), pages([], 0, pending));
  router.patch('/api/session/password', auth('initial-password'), pages([], SMALL, pending));
  router.post('/api/accounts', auth('save-account', ({ draft }) => ({ draft })), pages(['users'], SMALL));
  router.patch('/api/accounts/:id', auth('save-account', (body, { id }) => ({ ...body, id })), pages(['users'], SMALL));
  router.patch('/api/accounts/:id/status', auth('account-status', (body, { id }) => ({ ...body, id })), pages(['users'], SMALL));
}

module.exports = { register };
