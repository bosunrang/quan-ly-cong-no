// Cài đặt và nhận diện công ty, sao lưu, khôi phục, xóa dữ liệu theo nhóm, trạng thái máy chủ.
const { createHash } = require('node:crypto');
const { DATASET_KEYS, openDatabase } = require('../database.cjs');
const { companySettings } = require('../companies.cjs');
const { audit, fail, requirePage } = require('../access.cjs');
const { deleteBusinessGroups, isValidSettings, validateBusinessBackup } = require('../../src/domain/settings/business-data.rules.mjs');

const SMALL = 16 * 1024;
const LARGE = 64 * 1024 * 1024;
const pages = (list, maxBodyBytes = 0) => ({ pages: list, maxBodyBytes });

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

function register(router, tenant) {
  const { db, backups } = tenant;
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
}

module.exports = { register, settingsOf };
