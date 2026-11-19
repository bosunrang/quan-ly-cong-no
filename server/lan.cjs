const { createHash } = require('node:crypto');
const { createServer: httpServer } = require('node:http');
const { createServer: httpsServer } = require('node:https');
const { createReadStream, mkdirSync, readFileSync, statSync } = require('node:fs');
const { extname, resolve, sep } = require('node:path');
const { DATASET_KEYS, openDatabase } = require('../electron/database.cjs');
const { companySettings } = require('./companies.cjs');
const { audit, canOpen, createAccess, fail, initializeAdministrator } = require('./access.cjs');
const { automaticBackups } = require('./automatic-backup.cjs');
const {
  deleteBusinessGroups, isValidCustomerList, isValidEmployeeList, isValidReceiptLedger, isValidSalesBook,
  isValidSettings, validateBusinessBackup,
} = require('../src/domain/settings/business-data.rules.mjs');

const book = 'cong-no.misa-sales-book.v1';
const ledger = 'cong-no.receipt-ledger.v1';
const sharedWrites = new Map([
  [DATASET_KEYS.customers, ['customers', 'sales', 'misa']],
  [DATASET_KEYS.employees, ['sales']],
  [DATASET_KEYS.settings, ['settings']],
]);
const bookReaders = ['dashboard', 'misa', 'payments', 'receivables', 'reports'];
// Danh mục khách hàng và nhân viên chỉ dành cho tài khoản có thẻ nghiệp vụ.
const directoryReaders = ['dashboard', 'misa', 'payments', 'receivables', 'reports', 'customers', 'sales'];
const UNAUTHENTICATED_BODY_LIMIT = 1024 * 1024;
const BODY_LIMIT = 64 * 1024 * 1024;
const ledgerReaders = ['dashboard', 'payments', 'receivables', 'reports'];
const authOperations = new Set(['login', 'session', 'logout', 'initial-password', 'save-account', 'account-status']);
const activityCategories = new Set(['session', 'accounts', 'data', 'payments', 'reports', 'settings']);
const contentTypes = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function requirePage(account, pages) {
  if (!pages.some((page) => canOpen(account, page)))
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

function datasetOf(tenant, key, account) {
  if (key === DATASET_KEYS.settings) {
    const settings = settingsOf(tenant);
    return {
      version: 2,
      data: account ? settings : {
        ...settings, companyAddress: '', bankAccounts: [], accountingContact: '', signatoryName: '', signatoryTitle: '',
      },
    };
  }
  if (key === DATASET_KEYS.customers || key === DATASET_KEYS.employees) {
    requirePage(account, directoryReaders);
    return tenant.db.readDataset(key) ?? { version: 2, data: [] };
  }
  if (key === book) requirePage(account, bookReaders);
  else if (key === ledger) requirePage(account, ledgerReaders);
  else fail(400, 'Nhóm dữ liệu không hợp lệ.');
  return tenant.db.readDataset(key) ?? null;
}

function revision(dataset) {
  return createHash('sha256').update(JSON.stringify(dataset)).digest('hex');
}

function requireEmployeeLinkPermission(account, current, next) {
  if (account.role === 'admin') return;
  const links = new Map(current.map((employee) => [employee.id, employee.linkedAccountId]));
  if (next.some((employee) => employee.linkedAccountId !== links.get(employee.id)))
    fail(403, 'Chỉ quản trị viên được thay đổi tài khoản liên kết.');
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

const customerProfileFields = ['id', 'misaCode', 'name', 'group', 'taxCode', 'province', 'address', 'status', 'createdAt'];

/**
 * Tài khoản không có thẻ Khách hàng chỉ được: thêm khách hàng mới (thẻ Dữ liệu MISA)
 * hoặc đổi phân công (thẻ Nhân viên & khu vực). Không được xóa hay sửa hồ sơ.
 */
function requireCustomerChangePermission(account, current, next) {
  if (canOpen(account, 'customers')) return;
  const previous = new Map(current.map((item) => [item.id, item]));
  const nextIds = new Set(next.map(({ id }) => id));
  if (current.some(({ id }) => !nextIds.has(id)))
    fail(403, 'Chỉ tài khoản có thẻ Khách hàng được xóa khách hàng.');
  const canAssign = canOpen(account, 'sales');
  const canAdd = canOpen(account, 'misa');
  for (const item of next) {
    const before = previous.get(item.id);
    if (!before) {
      if (!canAdd) fail(403, 'Tài khoản chưa có quyền thêm khách hàng.');
      continue;
    }
    const profileChanged = customerProfileFields.some((field) => canonical(before[field]) !== canonical(item[field]));
    const assignmentsChanged = canonical(before.assignments) !== canonical(item.assignments);
    if (profileChanged || (assignmentsChanged && !canAssign))
      fail(403, 'Tài khoản chỉ được thay đổi phần dữ liệu thuộc thẻ được cấp.');
  }
}

const datasetValidators = new Map([
  [DATASET_KEYS.customers, isValidCustomerList],
  [DATASET_KEYS.employees, isValidEmployeeList],
  [DATASET_KEYS.settings, isValidSettings],
]);

async function saveBusinessChange(tenant, req, change, detail = "") {
  const { db, company, backups } = tenant;
  const previous = db.exportBusinessBackup(company.id);
  if (change.type === 'restore') {
    if (validateBusinessBackup(change.backup).companyId !== company.id) {
      fail(400, 'Bản sao lưu không thuộc công ty đang mở.');
    }
  } else if (change.type === 'delete') {
    deleteBusinessGroups(previous.data, change.groups);
  } else fail(400, 'Thao tác dữ liệu không hợp lệ.');
  await backups.saveBeforeChange(previous);
  const account = tenant.access.actor(req);
  requirePage(account, ['settings']);
  return db.changeBusinessData(change, company.id, JSON.stringify(previous.data), () =>
    audit(db, account, 'settings', change.type === 'restore' ? 'Khôi phục dữ liệu' : 'Xóa dữ liệu theo nhóm', detail));
}

async function handle(tenant, operation, payload, req, res) {
  if (authOperations.has(operation))
    return { value: await tenant.access.handle(operation, payload, req, res) };
  if (operation === 'read-dataset' && payload.key === DATASET_KEYS.settings) {
    let account;
    try { account = tenant.access.actor(req); } catch (error) {
      if (error.status !== 401 && error.status !== 403) throw error;
    }
    const value = datasetOf(tenant, payload.key, account);
    return { value, revision: account ? revision(value) : undefined };
  }

  const account = tenant.access.actor(req);
  const db = tenant.db;
  if (operation === 'read-dataset') {
    const value = datasetOf(tenant, payload.key, account);
    return { value, revision: sharedWrites.has(payload.key) ? revision(value) : undefined };
  }
  if (operation === 'dataset-stamp') {
    // Dấu thay đổi của sổ lớn: máy trạm chỉ tải lại sổ khi dấu khác bản đang giữ.
    if (payload.key === book) requirePage(account, bookReaders);
    else if (payload.key === ledger) requirePage(account, ledgerReaders);
    else fail(400, 'Nhóm dữ liệu không hợp lệ.');
    return { value: db.datasetStamp(payload.key) };
  }
  if (operation === 'write-dataset') {
    const { key, version, data, expected } = payload;
    const pages = sharedWrites.get(key);
    if (!pages || version !== 2) fail(400, 'Nhóm dữ liệu không hợp lệ.');
    requirePage(account, pages);
    const current = datasetOf(tenant, key, account);
    if (revision(current) !== expected) fail(409, 'Dữ liệu vừa thay đổi trên máy khác. Tải lại màn hình trước khi lưu.');
    if (!datasetValidators.get(key)(data))
      fail(400, key === DATASET_KEYS.settings ? 'Cài đặt không hợp lệ.' : 'Danh mục không hợp lệ.');
    if (key === DATASET_KEYS.employees) requireEmployeeLinkPermission(account, current.data, data);
    if (key === DATASET_KEYS.customers) requireCustomerChangePermission(account, current.data, data);
    if (!db.writeDataset(key, version, data)) fail(500, 'Không thể lưu dữ liệu.');
    return { value: true, revision: revision(datasetOf(tenant, key, account)) };
  }
  if (operation === 'write-directory') {
    requirePage(account, ['sales']);
    const { customers, employees, expected } = payload;
    if (!isValidCustomerList(customers) || !isValidEmployeeList(employees))
      fail(400, 'Danh mục không hợp lệ.');
    const keys = [DATASET_KEYS.customers, DATASET_KEYS.employees];
    if (keys.some((key) => expected?.[key] !== revision(datasetOf(tenant, key, account))))
      fail(409, 'Danh mục vừa thay đổi trên máy khác. Tải lại màn hình trước khi lưu.');
    requireEmployeeLinkPermission(account, datasetOf(tenant, DATASET_KEYS.employees, account).data, employees);
    requireCustomerChangePermission(account, datasetOf(tenant, DATASET_KEYS.customers, account).data, customers);
    if (!db.writeDirectory(customers, employees)) fail(500, 'Không thể lưu danh mục.');
    return { value: Object.fromEntries(keys.map((key) => [key, revision(datasetOf(tenant, key, account))])) };
  }
  if (operation === 'write-sales-book') {
    requirePage(account, ['misa']);
    if (!isValidSalesBook(payload.data) ||
      (payload.expected !== null && typeof payload.expected !== 'string'))
      fail(400, 'Sổ bán hàng không hợp lệ.');
    return { value: db.writeMisaSalesBook(payload.expected, payload.data) };
  }
  if (operation === 'write-ledger') {
    requirePage(account, ['payments']);
    if (typeof payload.revision !== 'string' || !isValidReceiptLedger(payload.data) ||
      (payload.salesBookImportedAt !== undefined && typeof payload.salesBookImportedAt !== 'string'))
      fail(400, 'Sổ đối soát không hợp lệ.');
    return { value: db.writeReceiptLedger(payload.revision, payload.data, payload.salesBookImportedAt) };
  }
  if (operation === 'read-activities') {
    requirePage(account, ['audit']);
    return { value: db.readActivities() };
  }
  if (operation === 'export-business-backup') {
    requirePage(account, ['settings']);
    const backup = db.exportBusinessBackup(tenant.company.id);
    audit(db, account, 'settings', 'Xuất bản sao lưu');
    return { value: backup };
  }
  if (operation === 'change-business-data') {
    requirePage(account, ['settings']);
    const detail = payload.type === 'delete' && Array.isArray(payload.groups) ? payload.groups.join(', ') : '';
    return { value: await saveBusinessChange(tenant, req, payload, detail) };
  }
  if (operation === 'restore-automatic-backup') {
    requirePage(account, ['settings']);
    const location = await tenant.backups.findSnapshot(payload.fileName);
    if (!location) fail(404, 'Không tìm thấy bản sao lưu đã chọn.');
    const saved = openDatabase(location, { readOnly: true });
    let backup;
    try { backup = saved.exportBusinessBackup(tenant.company.id); }
    finally { saved.close(); }
    return { value: await saveBusinessChange(tenant, req, { type: 'restore', backup }, payload.fileName) };
  }
  if (operation === 'backup-status') {
    requirePage(account, ['settings']);
    return { value: await tenant.backups.status() };
  }
  if (operation === 'append-activity') {
    const { category, action, detail } = payload;
    if (!activityCategories.has(category) || typeof action !== 'string' ||
      !action || action.length > 140 || typeof detail !== 'string')
      fail(400, 'Bản ghi nhật ký không hợp lệ.');
    if (category === 'session' && action === 'Mở màn hình') return { value: true };
    return { value: audit(db, account, category, action, detail) };
  }
  if (operation === 'clear-business-data') {
    requirePage(account, ['settings']);
    // Thao tác xóa mạnh nhất cũng phải có bản sao để khôi phục.
    await tenant.backups.saveBeforeChange(db.exportBusinessBackup(tenant.company.id));
    const cleared = db.clearAllData(settingsOf(tenant));
    audit(db, account, 'settings', 'Xóa toàn bộ dữ liệu nghiệp vụ');
    return { value: cleared };
  }
  if (operation === 'status') return { value: { backend: 'lan', schemaVersion: db.status().schemaVersion } };
  fail(404, 'Chức năng không tồn tại.');
}

async function jsonBody(req, maxBytes) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'Yêu cầu JSON.');
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) fail(413, 'Tệp quá lớn để lưu qua mạng.');
  let size = 0;
  const parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > maxBytes) fail(413, 'Tệp quá lớn để lưu qua mạng.');
    parts.push(part);
  }
  try {
    const value = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (!value || typeof value.operation !== 'string' || !value.payload || typeof value.payload !== 'object')
      fail(400, 'Yêu cầu không hợp lệ.');
    return value;
  } catch {
    fail(400, 'Yêu cầu JSON không hợp lệ.');
  }
}

function send(res, status, body, contentType) {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  res.end(body);
}

function companyDatabasePath(directory, company) {
  return resolve(directory, `cong-no-${company.id}.sqlite`);
}

function openCompanyDatabase(directory, company) {
  mkdirSync(directory, { recursive: true });
  return openDatabase(companyDatabasePath(directory, company));
}

function createLanServer({ company, directory, staticRoot, tls }) {
  const root = resolve(staticRoot);
  const index = readFileSync(resolve(root, 'index.html'), 'utf8')
    .replace('</head>', '<meta name="cong-no-lan-api" content="/api/"></head>');
  const legacyPath = `/${company.id}`;
  const db = openCompanyDatabase(directory, company);
  const backups = automaticBackups(companyDatabasePath(directory, company), directory, company);
  const tenant = { company, db, backups, access: createAccess(db, company, Boolean(tls)) };
  const respond = async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    const pathname = String(req.url).split('?')[0];
    try {
      if (req.method === 'GET' &&
          [legacyPath, `${legacyPath}/`, `${legacyPath}/index.html`].includes(pathname)) {
        res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' });
        return res.end();
      }
      if (req.method === 'POST' && pathname === `${legacyPath}/api/`) {
        res.writeHead(307, { Location: '/api/', 'Cache-Control': 'no-store' });
        return res.end();
      }
      if (req.method === 'POST' && pathname === '/api/') {
        if (req.headers['x-cong-no-lan'] !== '1' ||
          (req.headers.origin && req.headers.origin !== `${tls ? 'https' : 'http'}://${req.headers.host}`))
          fail(403, 'Yêu cầu khác nguồn bị từ chối.');
        // Chỉ nhận thân yêu cầu lớn khi đã có phiên đăng nhập hợp lệ.
        const limit = tenant.access.hasSession(req) ? BODY_LIMIT : UNAUTHENTICATED_BODY_LIMIT;
        const { operation, payload } = await jsonBody(req, limit);
        const answer = await handle(tenant, operation, payload, req, res);
        return send(res, 200, JSON.stringify({ ok: true, ...answer }), 'application/json; charset=utf-8');
      }
      if (req.method !== 'GET') fail(405, 'Phương thức không được hỗ trợ.');
      if (pathname === '/' || pathname === '/index.html') {
        return send(res, 200, index, 'text/html; charset=utf-8');
      }
      const suffix = pathname.startsWith(`${legacyPath}/`)
        ? pathname.slice(legacyPath.length + 1)
        : pathname.slice(1);
      if (!/^(?:assets|fonts)\/[\w.-]+$/.test(suffix)) fail(404, 'Không tìm thấy tệp.');
      const path = resolve(root, suffix);
      const file = path.startsWith(root + sep) && statSync(path, { throwIfNoEntry: false });
      const mime = contentTypes[extname(path)];
      if (!file?.isFile() || !mime) fail(404, 'Không tìm thấy tệp.');
      res.writeHead(200, { 'Content-Type': mime, 'Content-Length': file.size });
      return createReadStream(path)
        .on('error', (error) => {
          console.error('Không đọc được tệp giao diện:', error.message);
          res.destroy();
        })
        .pipe(res);
    } catch (error) {
      if (res.headersSent || res.destroyed) return res.end();
      const status = error.status ?? 500;
      if (status >= 500) console.error('Lỗi máy chủ công nợ:', error.message);
      return send(res, status, JSON.stringify({ ok: false, error: status >= 500 ? 'Máy chủ không thể hoàn tất thao tác.' : error.message }), 'application/json; charset=utf-8');
    }
  };
  const server = tls ? httpsServer(tls, respond) : httpServer(respond);
  server.hasAdministrator = () => Boolean(db.readDataset('cong-no.accounts.v1')?.data?.length);
  server.initializeAdministrator = (password) => initializeAdministrator(db, password);
  server.once('listening', () => backups.start());
  server.dataClosed = new Promise((resolve, reject) => {
    server.once('close', () => {
      backups.stop().then(() => db.close()).then(resolve, reject);
    });
  });
  return server;
}

async function listenLanServer(server, port, host) {
  try {
    await new Promise((resolve, reject) => {
      const failToListen = (error) => reject(error);
      server.once('error', failToListen);
      server.listen(port, host, () => {
        server.off('error', failToListen);
        resolve();
      });
    });
  } catch (error) {
    await stopLanServer(server);
    throw error;
  }
}

function stopLanServer(server) {
  server.close();
  return server.dataClosed;
}

module.exports = {
  companyDatabasePath, createLanServer, openCompanyDatabase, listenLanServer, stopLanServer,
  requireCustomerChangePermission,
};
