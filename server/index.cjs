const { createHash } = require('node:crypto');
const { DATASET_KEYS, openDatabase } = require('../electron/database.cjs');
const { companySettings } = require('./companies.cjs');
const { audit, canOpen, fail } = require('./access.cjs');
const { createRouter, readJsonBody, sendJson } = require('./http.cjs');
const { registerDirectoryRoutes } = require('./directory.cjs');
const { deleteBusinessGroups, isValidSettings, validateBusinessBackup } = require('../src/domain/settings/business-data.rules.mjs');

const directoryReaders = ['dashboard', 'misa', 'payments', 'receivables', 'reports', 'customers', 'sales'];
// Máy trạm chỉ tự ghi được việc chỉ xảy ra ở máy trạm (in, xuất Excel); mọi thay đổi dữ liệu do máy chủ ghi.
const clientActivities = new Set(['Mở hộp thoại in biên bản', 'Xuất Excel biên bản đối chiếu']);
const PUBLIC_ROUTES = new Set(['POST /api/session', 'GET /api/branding']);
const SMALL = 16 * 1024;
const LARGE = 64 * 1024 * 1024;
const pages = (list, maxBodyBytes = 0, options = {}) => ({ pages: list, maxBodyBytes, ...options });

function requirePage(account, allowed) {
  if (allowed.length && !allowed.some((page) => canOpen(account, page)))
    fail(403, 'Tài khoản chưa có quyền truy cập dữ liệu này.');
}

function settingsOf(tenant) {
  const value = tenant.db.readDataset(DATASET_KEYS.settings)?.data ?? {};
  const defaults = companySettings(tenant.company);
  return {
    ...defaults, ...value,
    companyName: value.companyName?.trim() || defaults.companyName,
    displayName: value.displayName?.trim() || defaults.displayName,
  };
}

const backupCompany = ({ company }) => company.id === 'local' ? null : company.id;
const settingsRevision = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function saveBusinessChange(tenant, req, change, detail = "") {
  const { db, backups } = tenant;
  const previous = db.exportBusinessBackup(backupCompany(tenant));
  if (change.type === 'restore') {
    if (validateBusinessBackup(change.backup).companyId !== backupCompany(tenant)) {
      fail(400, 'Bản sao lưu không thuộc công ty đang mở.');
    }
  } else if (change.type === 'delete') {
    deleteBusinessGroups(previous.data, change.groups);
  } else fail(400, 'Thao tác dữ liệu không hợp lệ.');
  await backups.saveBeforeChange(previous);
  const account = tenant.access.actor(req);
  requirePage(account, ['settings']);
  return db.changeBusinessData(change, backupCompany(tenant), JSON.stringify(previous.data), () =>
    audit(db, account, 'settings', change.type === 'restore' ? 'Khôi phục dữ liệu' : 'Xóa dữ liệu theo nhóm', detail));
}

function createApi(tenant, tls) {
  const { db, access, backups } = tenant;
  const router = createRouter();
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

  router.get('/api/branding', () => {
    const settings = settingsOf(tenant);
    return { ...settings, companyAddress: '', bankAccounts: [], accountingContact: '', signatoryName: '', signatoryTitle: '' };
  }, pages([]));
  router.get('/api/settings', () => {
    const data = settingsOf(tenant);
    return { data, revision: settingsRevision(data) };
  }, pages([]));
  router.put('/api/settings', ({ body, account }) => {
    if (!isValidSettings(body.data)) fail(400, 'Cài đặt không hợp lệ.');
    if (body.expected !== settingsRevision(settingsOf(tenant)))
      fail(409, 'Cài đặt vừa thay đổi. Hãy tải lại trước khi lưu.');
    db.writeDataset(DATASET_KEYS.settings, 2, body.data);
    audit(db, account, 'settings', 'Lưu cấu hình ứng dụng');
    const data = settingsOf(tenant);
    return { data, revision: settingsRevision(data) };
  }, pages(['settings'], 2 * 1024 * 1024));

  registerDirectoryRoutes(router, db, directoryReaders);
  require('./accounting.cjs').registerAccountingRoutes(router, db);

  router.get('/api/activities', () => db.readActivities(), pages(['audit']));
  router.post('/api/activities', ({ body: { category, action, detail }, account }) => {
    if (category !== 'reports' || !clientActivities.has(action) || typeof detail !== 'string')
      fail(400, 'Bản ghi nhật ký không hợp lệ.');
    return audit(db, account, category, action, detail);
  }, pages(['reports'], SMALL));
  router.get('/api/business-backup', ({ account }) => {
    const backup = db.exportBusinessBackup(backupCompany(tenant));
    audit(db, account, 'settings', 'Xuất bản sao lưu');
    return backup;
  }, pages(['settings']));
  router.post('/api/business-backup/restore', ({ body, req }) =>
    saveBusinessChange(tenant, req, { type: 'restore', backup: body.backup }), pages(['settings'], LARGE));
  router.delete('/api/business-data', ({ body, req }) =>
    saveBusinessChange(tenant, req, { type: 'delete', groups: body.groups },
      Array.isArray(body.groups) ? body.groups.join(', ') : ''), pages(['settings'], SMALL));
  router.get('/api/automatic-backups', () => backups.status(), pages(['settings']));
  router.post('/api/automatic-backups/:fileName/restore', async ({ params, req }) => {
    const location = await backups.findSnapshot(params.fileName);
    if (!location) fail(404, 'Không tìm thấy bản sao lưu đã chọn.');
    const saved = openDatabase(location, { readOnly: true });
    let backup;
    try { backup = saved.exportBusinessBackup(backupCompany(tenant)); }
    finally { saved.close(); }
    return saveBusinessChange(tenant, req, { type: 'restore', backup }, params.fileName);
  }, pages(['settings']));
  router.get('/api/status', () => ({ backend: 'lan', schemaVersion: db.status().schemaVersion }), pages([]));

  return async (req, res, pathname) => {
    const query = new URLSearchParams(String(req.url).split("?").slice(1).join("?"));
    if (req.headers['x-cong-no-lan'] !== '1' ||
        (req.headers.origin && req.headers.origin !== (tls ? 'https://' : 'http://') + req.headers.host))
      fail(403, 'Yêu cầu khác nguồn bị từ chối.');
    const route = router.match(req.method, pathname);
    if (!route) fail(404, 'Chức năng không tồn tại.');
    let account;
    if (!PUBLIC_ROUTES.has(req.method + ' ' + pathname)) {
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
    const value = await route.handler({ req, res, params: route.params, body, account, query });
    sendJson(res, 200, { ok: true, value });
  };
}

module.exports = { createApi };
