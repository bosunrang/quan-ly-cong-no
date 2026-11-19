const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdir, mkdtemp, readdir, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { DATASET_KEYS } = require('../electron/database.cjs');
const { companies, sharedHostCompanies } = require('../server/companies.cjs');
const { initializeAdministrator } = require('../server/access.cjs');
const { companyDatabasePath, createLanServer, openCompanyDatabase, stopLanServer } = require('../server/lan.cjs');
const { automaticBackups } = require('../server/automatic-backup.cjs');
const { lanOptions } = require('../server/lan-options.cjs');
const { loginItem } = require('../electron/lan-startup.cjs');

const salesKey = 'cong-no.misa-sales-book.v1';
const ledgerKey = 'cong-no.receipt-ledger.v1';
const temporary = (company) => `temporary-${company.id}`;
const password = (company) => `new-${company.id}`;

async function createFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'cong-no-lan-'));
  const sharedDirectory = join(root, 'data', 'shared');
  const dataDirectories = new Map(companies.map((company) => [
    company.id,
    sharedHostCompanies.includes(company) ? sharedDirectory : join(root, 'data', company.id),
  ]));
  const staticRoot = join(root, 'dist');
  await mkdir(join(staticRoot, 'assets'), { recursive: true });
  await writeFile(join(staticRoot, 'index.html'), '<html><head><title>Quản lý công nợ</title></head><body></body></html>');
  await writeFile(join(staticRoot, 'assets', 'test.js'), 'export default true');
  const servers = [];
  t.after(async () => {
    await Promise.all(servers.map(stopLanServer));
    await rm(root, { force: true, recursive: true });
  });
  const origin = new Map();
  for (const company of companies) {
    const directory = dataDirectories.get(company.id);
    const db = openCompanyDatabase(directory, company);
    try { await initializeAdministrator(db, temporary(company)); }
    finally { db.close(); }
    const server = createLanServer({ company, directory, staticRoot });
    servers.push(server.listen(0, '127.0.0.1'));
    await once(server, 'listening');
    origin.set(company.id, `http://127.0.0.1:${server.address().port}`);
  }
  return { dataDirectories, origin };
}

function api(base) {
  const url = `${base}/api/`;
  return async (operation, payload = {}, cookie = '', extraHeaders = {}) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cong-no-lan': '1', cookie, ...extraHeaders },
      body: JSON.stringify({ operation, payload }),
    });
    const body = await response.json();
    const setCookie = response.headers.get('set-cookie') ?? '';
    return { ...body, status: response.status, setCookie, cookie: setCookie.split(';')[0] };
  };
}

test('four company stores, independent accounts and concurrent writes over LAN', async (t) => {
  assert.deepEqual(companies.map(({ id, port }) => [id, port]), [
    ['nam-hung-viet', 3300], ['tuong-khue', 3300], ['winbio', 3300], ['naviva-group', 3301],
  ]);
  assert.deepEqual(sharedHostCompanies.map(({ id }) => id), ['nam-hung-viet', 'naviva-group']);
  const { dataDirectories, origin } = await createFixture(t);

  const cookies = new Map();
  const clients = new Map();
  for (const company of companies) {
    const base = origin.get(company.id);
    const page = await fetch(base, { redirect: 'manual' });
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('location'), null);
    const html = await page.text();
    assert.ok(html.includes('<title>Quản lý công nợ</title>'));
    assert.ok(html.includes('content="/api/"'));
    assert.equal((await fetch(`${base}/assets/test.js`)).status, 200);
    assert.equal((await fetch(`${base}/favicon.ico`)).status, 404);
    const oldPage = await fetch(`${base}/${company.id}/`, { redirect: 'manual' });
    assert.equal(oldPage.status, 302);
    assert.equal(oldPage.headers.get('location'), '/');
    const oldApi = await fetch(`${base}/${company.id}/api/`, { method: 'POST', redirect: 'manual' });
    assert.equal(oldApi.status, 307);
    assert.equal(oldApi.headers.get('location'), '/api/');
    assert.equal((await fetch(`${base}/${company.id}/assets/test.js`)).status, 200);
    for (const other of companies.filter(({ id }) => id !== company.id)) {
      assert.equal((await fetch(`${base}/${other.id}/`)).status, 404);
    }

    const call = api(base);
    clients.set(company.id, call);
    const protectedKey = { key: salesKey };
    assert.equal((await call('read-dataset', protectedKey)).status, 401);
    assert.equal((await call('backup-status')).status, 401);
    const settings = await call('read-dataset', { key: DATASET_KEYS.settings });
    assert.equal(settings.value.data.displayName, company.name);
    // Trang đăng nhập không được thấy tài khoản ngân hàng hay người ký.
    assert.deepEqual(settings.value.data.bankAccounts, []);
    assert.equal(settings.value.data.signatoryName, '');
    const first = await call('login', { username: 'admin', password: temporary(company) });
    assert.equal(first.status, 200);
    assert.match(first.setCookie, /HttpOnly; SameSite=Strict/);
    assert.ok(first.setCookie.includes('Path=/api/'));
    assert.equal(first.value.profile.mustChangePassword, true);
    assert.equal('proof' in first.value.profile, false);
    assert.equal((await call('read-dataset', protectedKey, first.cookie)).status, 403);
    const changed = await call('initial-password', { password: password(company) }, first.cookie);
    assert.equal(changed.status, 200);
    assert.equal((await call('session', {}, first.cookie)).status, 401);
    assert.equal((await call('session', {}, changed.cookie)).value.profile.mustChangePassword, false);
    assert.equal((await call('read-dataset', { key: 'cong-no.accounts.v1' }, changed.cookie)).status, 400);
    assert.deepEqual((await call('read-dataset', { key: DATASET_KEYS.customers }, changed.cookie)).value.data, []);
    assert.equal((await call('read-dataset', protectedKey, changed.cookie)).value, null);
    assert.equal((await call('read-dataset', { key: ledgerKey }, changed.cookie)).value, null);
    const backups = await call('backup-status', {}, changed.cookie);
    assert.equal(backups.status, 200);
    assert.equal(backups.value.retention, 14);
    cookies.set(company.id, changed.cookie);
  }
  const [nhv, tk, wb, naviva] = companies;
  const actor = cookies.get(nhv.id);
  const call = clients.get(nhv.id);
  for (const company of [tk, wb, naviva]) {
    assert.equal((await clients.get(company.id)('session', {}, actor)).status, 401);
    assert.equal((await clients.get(company.id)('login', { username: 'admin', password: password(nhv) })).status, 401);
  }
  assert.equal((await call('session', {}, actor, { origin: 'http://different.example' })).status, 403);

  const data = { fileName: 'test-misa.xlsx', rows: [], importedAt: '2026-01-02T12:00:00.000Z' };
  assert.equal((await call('dataset-stamp', { key: salesKey })).status, 401);
  assert.equal((await call('dataset-stamp', { key: 'cong-no.accounts.v1' }, actor)).status, 400);
  assert.equal((await call('dataset-stamp', { key: salesKey }, actor)).value, null);
  assert.equal((await call('write-sales-book', { expected: null, data }, actor)).value, true);
  // Máy trạm dùng dấu này để biết sổ đã đổi mà không phải tải lại cả sổ.
  assert.match((await call('dataset-stamp', { key: salesKey }, actor)).value, /^1:/);
  assert.equal((await call('write-sales-book', { expected: null, data }, actor)).value, false);
  const ledger = { revision: 'first', receipts: [], allocations: [] };
  assert.equal((await call('write-ledger', { revision: '', data: ledger, salesBookImportedAt: data.importedAt }, actor)).value, true);
  assert.equal((await call('write-ledger', { revision: '', data: ledger }, actor)).value, false);
  assert.equal((await call('read-dataset', { key: salesKey }, actor)).value.data.fileName, data.fileName);
  assert.equal((await call('read-dataset', { key: ledgerKey }, actor)).value.data.revision, ledger.revision);

  const customer = {
    id: 'c1', misaCode: 'TEST', name: 'Khách hàng mẫu', group: 'unknown',
    taxCode: '', province: '', address: '', status: 'active', assignments: [],
    createdAt: data.importedAt, updatedAt: data.importedAt,
  };
  const employee = {
    id: 'e1', code: 'TEST', name: 'Nhân viên mẫu', phone: '', email: '',
    status: 'active', createdAt: data.importedAt,
  };
  const directories = [DATASET_KEYS.customers, DATASET_KEYS.employees];
  const snapshots = await Promise.all(directories.map((key) => call('read-dataset', { key }, actor)));
  const expected = Object.fromEntries(directories.map((key, index) => [key, snapshots[index].revision]));
  const update = { expected, customers: [customer], employees: [employee] };
  assert.equal((await call('write-directory', update, actor)).status, 200);
  assert.equal((await call('write-directory', update, actor)).status, 409);
  assert.equal((await call('read-dataset', { key: directories[0] }, actor)).value.data[0].id, customer.id);

  const viewer = await call('save-account', {
    draft: { name: 'Người xem', username: 'view', password: 'temporary-view', role: 'viewer', pages: ['dashboard'] },
  }, actor);
  assert.equal(viewer.status, 200);
  const viewerSession = await call('login', { username: 'view', password: 'temporary-view' });
  const viewerChanged = await call('initial-password', { password: 'viewer-password' }, viewerSession.cookie);
  assert.equal((await call('read-dataset', { key: salesKey }, viewerChanged.cookie)).status, 200);
  assert.equal((await call('write-sales-book', { expected: data.importedAt, data }, viewerChanged.cookie)).status, 403);
  assert.equal((await call('read-activities', {}, viewerChanged.cookie)).status, 403);
  assert.equal((await call('backup-status', {}, viewerChanged.cookie)).status, 403);
  assert.equal((await call('account-status', { id: viewer.value.account.id, active: false }, actor)).status, 200);
  assert.equal((await call('session', {}, viewerChanged.cookie)).status, 401);

  const editor = await call('save-account', {
    draft: { name: 'Người nhập liệu', username: 'editor', password: 'temporary-editor', role: 'editor', pages: ['sales'] },
  }, actor);
  assert.equal(editor.status, 200);
  const editorSession = await call('login', { username: 'editor', password: 'temporary-editor' });
  const editorChanged = await call('initial-password', { password: 'editor-password' }, editorSession.cookie);
  assert.equal(editorChanged.status, 200);
  const employeeSnapshot = await call('read-dataset', { key: DATASET_KEYS.employees }, actor);
  const adminLink = {
    key: DATASET_KEYS.employees, version: 2, expected: employeeSnapshot.revision,
    data: [{ ...employee, linkedAccountId: editor.value.account.id }],
  };
  assert.equal((await call('write-dataset', adminLink, editorChanged.cookie)).status, 403);
  const savedLinks = await call('write-dataset', adminLink, actor);
  assert.equal(savedLinks.status, 200);
  const editorUpdate = {
    ...adminLink, expected: savedLinks.revision,
    data: [{ ...adminLink.data[0], name: 'Tên nhân viên đã sửa' }],
  };
  assert.equal((await call('write-dataset', editorUpdate, editorChanged.cookie)).status, 200);
  const employeeAfterEdit = await call('read-dataset', { key: DATASET_KEYS.employees }, actor);
  assert.equal(employeeAfterEdit.value.data[0].linkedAccountId, editor.value.account.id);
  assert.equal((await call('write-dataset', {
    ...adminLink, expected: employeeAfterEdit.revision, data: [employee],
  }, editorChanged.cookie)).status, 403);

  assert.equal((await call('append-activity', { category: 'data', action: 'Thao tác mẫu', detail: '', actorId: 'fake' }, actor)).status, 200);
  assert.equal((await call('append-activity', { category: 'session', action: 'Mở màn hình', detail: 'Nhật ký sử dụng' }, actor)).status, 200);
  const activity = (await call('read-activities', {}, actor)).value;
  assert.equal(activity.some(({ action }) => action === 'Mở màn hình'), false);
  assert.equal(activity.find(({ action }) => action === 'Thao tác mẫu').actorId, viewer.value.profile.id);
  for (const company of [tk, wb, naviva]) {
    const sibling = clients.get(company.id);
    const cookie = cookies.get(company.id);
    assert.equal((await sibling('read-dataset', { key: salesKey }, cookie)).value, null);
    assert.equal((await sibling('read-dataset', { key: ledgerKey }, cookie)).value, null);
    assert.deepEqual((await sibling('read-dataset', { key: DATASET_KEYS.customers }, cookie)).value.data, []);
    assert.ok(!(await sibling('read-activities', {}, cookie)).value.some(({ action }) => action === 'Thao tác mẫu'));
  }
  for (const directory of new Set(dataDirectories.values())) {
    const stored = (await readdir(directory)).filter((name) => name.endsWith('.sqlite')).sort();
    const expectedFiles = companies.filter(({ id }) => dataDirectories.get(id) === directory)
      .map(({ id }) => `cong-no-${id}.sqlite`).sort();
    assert.deepEqual(stored, expectedFiles);
  }

  const exported = await call('export-business-backup', {}, actor);
  assert.equal(exported.status, 200);
  assert.equal(exported.value.companyId, nhv.id);
  assert.equal(exported.value.data.salesBook.fileName, data.fileName);
  assert.equal(Object.hasOwn(exported.value.data, 'accounts'), false);
  assert.equal(Object.hasOwn(exported.value.data, 'activities'), false);
  assert.equal((await call('change-business-data', {
    type: 'restore', backup: { ...exported.value, companyId: tk.id },
  }, actor)).status, 400);
  assert.equal((await call('change-business-data', { type: 'delete', groups: ['salesBook'] }, actor)).status, 200);
  assert.equal((await call('read-dataset', { key: salesKey }, actor)).value, null);
  assert.equal((await call('read-dataset', { key: ledgerKey }, actor)).value.data.revision, ledger.revision);
  assert.equal((await call('change-business-data', { type: 'restore', backup: exported.value }, actor)).status, 200);
  assert.equal((await call('read-dataset', { key: salesKey }, actor)).value.data.fileName, data.fileName);
  const automatic = (await call('backup-status', {}, actor)).value.backups[0];
  assert.ok(automatic, 'Expected the daily LAN backup to be available.');
  assert.equal((await call('restore-automatic-backup', { fileName: '../' + automatic.fileName }, actor)).status, 404);
  assert.equal((await call('restore-automatic-backup', { fileName: automatic.fileName }, actor)).status, 200);
  assert.equal((await call('read-dataset', { key: salesKey }, actor)).value, null);
  assert.equal((await call('session', {}, actor)).status, 200);
  const savedSafety = await readdir(join(dataDirectories.get(nhv.id), 'backups', nhv.id));
  assert.equal(savedSafety.filter((file) => file.includes('truoc-khi-thay-doi')).length, 3);
  assert.equal((await call('logout', {}, actor)).status, 200);
  assert.equal((await call('session', {}, actor)).status, 401);
});

test('daily SQLite snapshots keep fourteen copies per company and can be read independently', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'cong-no-snapshots-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const [nhv, naviva] = sharedHostCompanies;
  const first = openCompanyDatabase(root, nhv);
  const second = openCompanyDatabase(root, naviva);
  let day = 1;
  const time = () => new Date(2026, 0, day, 14);
  const primary = automaticBackups(companyDatabasePath(root, nhv), root, nhv, time);
  const sibling = automaticBackups(companyDatabasePath(root, naviva), root, naviva, time);
  try {
    const records = (fileName) => ({ fileName, rows: [], importedAt: new Date().toISOString() });
    assert.equal(first.writeMisaSalesBook(null, records('nhv.xlsx')), true);
    assert.equal(second.writeMisaSalesBook(null, records('naviva.xlsx')), true);
    await sibling.run();
    for (day = 1; day <= 16; day++) {
      await Promise.all([primary.run(), primary.run()]);
    }
    const nhvCopies = (await primary.status()).backups;
    const navivaCopies = (await sibling.status()).backups;
    assert.equal(nhvCopies.length, 14);
    assert.equal(nhvCopies[0].fileName, 'cong-no-nam-hung-viet-2026-01-16.sqlite');
    assert.equal(nhvCopies.at(-1).fileName, 'cong-no-nam-hung-viet-2026-01-03.sqlite');
    assert.equal(navivaCopies.length, 1);
    for (const [profile, record, source] of [
      [nhv, nhvCopies[0], 'nhv.xlsx'],
      [naviva, navivaCopies[0], 'naviva.xlsx'],
    ]) {
      const db = new DatabaseSync(join(root, 'backups', profile.id, record.fileName), { readOnly: true });
      try {
        assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
        const row = db.prepare('SELECT payload_json FROM app_datasets WHERE dataset_key = ?').get(salesKey);
        assert.equal(JSON.parse(row.payload_json).fileName, source);
      } finally {
        db.close();
      }
    }
  } finally {
    await Promise.all([primary.stop(), sibling.stop()]);
    first.close();
    second.close();
  }
});

test('Windows login entries preserve company, hidden launch and storage path', () => {
  const directory = join(tmpdir(), 'Công nợ nội bộ');
  const settings = { directory, loopback: true };
  const [nhv, naviva] = sharedHostCompanies.map((company) => loginItem(company, settings, 'CongNo.exe'));
  assert.notEqual(nhv.name, naviva.name);
  assert.ok(nhv.args.includes('--company=nam-hung-viet'));
  assert.ok(naviva.args.includes('--company=naviva-group'));
  assert.ok(nhv.args.includes('--hidden'));
  assert.equal(lanOptions(nhv.args, 'unused').directory, directory);
  assert.equal(lanOptions(nhv.args, 'unused').host, '127.0.0.1');
});
