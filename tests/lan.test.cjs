const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdir, mkdtemp, readdir, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { companies, sharedHostCompanies } = require('../server/companies.cjs');
const { initializeAdministrator } = require('../server/access.cjs');
const { companyDatabasePath, createLanServer, openCompanyDatabase, stopLanServer } = require('../server/lan.cjs');
const { automaticBackups } = require('../server/automatic-backup.cjs');
const { lanOptions } = require('../server/lan-options.cjs');
const { loginItem } = require('../electron/lan-startup.cjs');

const salesKey = 'cong-no.misa-sales-book.v1';
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
  return async (method, resource, payload, cookie = '', extraHeaders = {}) => {
    const response = await fetch(base + '/api/' + resource, {
      method,
      headers: { ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
        'x-cong-no-lan': '1', cookie, ...extraHeaders },
      body: payload === undefined ? undefined : JSON.stringify(payload),
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
    const oldApi = await fetch(`${base}/${company.id}/api/branding`, { redirect: 'manual' });
    assert.equal(oldApi.status, 307);
    assert.equal(oldApi.headers.get('location'), '/api/branding');
    assert.equal((await fetch(`${base}/${company.id}/assets/test.js`)).status, 200);
    for (const other of companies.filter(({ id }) => id !== company.id)) {
      assert.equal((await fetch(`${base}/${other.id}/`)).status, 404);
    }

    const call = api(base);
    clients.set(company.id, call);
    assert.equal((await call('GET', 'sales-book', undefined)).status, 401);
    assert.equal((await call('GET', 'automatic-backups')).status, 401);
    const settings = await call('GET', 'branding', undefined);
    assert.equal(settings.value.displayName, company.name);
    // Trang đăng nhập không được thấy tài khoản ngân hàng hay người ký.
    assert.deepEqual(settings.value.bankAccounts, []);
    assert.equal(settings.value.signatoryName, '');
    const first = await call('POST', 'session', { username: 'admin', password: temporary(company) });
    assert.equal(first.status, 200);
    assert.match(first.setCookie, /HttpOnly; SameSite=Strict/);
    assert.ok(first.setCookie.includes('Path=/api/'));
    assert.equal(first.value.profile.mustChangePassword, true);
    assert.equal('proof' in first.value.profile, false);
    assert.equal((await call('GET', 'sales-book', undefined, first.cookie)).status, 403);
    const changed = await call('PATCH', 'session/password', { password: password(company) }, first.cookie);
    assert.equal(changed.status, 200);
    assert.equal((await call('GET', 'session', undefined, first.cookie)).status, 401);
    assert.equal((await call('GET', 'session', undefined, changed.cookie)).value.profile.mustChangePassword, false);
    assert.equal((await call('GET', 'datasets/accounts', undefined, changed.cookie)).status, 404);
    assert.deepEqual((await call('GET', 'customers', undefined, changed.cookie)).value, []);
    assert.equal((await call('GET', 'sales-book', undefined, changed.cookie)).value, null);
    assert.equal((await call('GET', 'receipt-ledger', undefined, changed.cookie)).value, null);
    const backups = await call('GET', 'automatic-backups', undefined, changed.cookie);
    assert.equal(backups.status, 200);
    assert.equal(backups.value.retention, 14);
    cookies.set(company.id, changed.cookie);
  }
  const [nhv, tk, wb, naviva] = companies;
  const actor = cookies.get(nhv.id);
  const call = clients.get(nhv.id);
  for (const company of [tk, wb, naviva]) {
    assert.equal((await clients.get(company.id)('GET', 'session', undefined, actor)).status, 401);
    assert.equal((await clients.get(company.id)('POST', 'session', { username: 'admin', password: password(nhv) })).status, 401);
  }
  assert.equal((await call('GET', 'session', undefined, actor, { origin: 'http://different.example' })).status, 403);

  const data = { fileName: 'test-misa.xlsx', rows: [], importedAt: '2026-01-02T12:00:00.000Z' };
  assert.equal((await call('GET', 'sales-book/stamp', undefined)).status, 401);
  assert.equal((await call('GET', 'datasets/accounts/stamp', undefined, actor)).status, 404);
  assert.equal((await call('GET', 'sales-book/stamp', undefined, actor)).value, null);
  assert.equal((await call('PUT', 'sales-book', { expected: null, data }, actor)).value, true);
  // Máy trạm dùng dấu này để biết sổ đã đổi mà không phải tải lại cả sổ.
  assert.match((await call('GET', 'sales-book/stamp', undefined, actor)).value, /^1:/);
  assert.equal((await call('PUT', 'sales-book', { expected: null, data }, actor)).status, 409);
  const ledger = { revision: 'first', receipts: [], allocations: [] };
  assert.equal((await call('PUT', 'receipt-ledger', { revision: '', data: ledger, salesBookImportedAt: data.importedAt }, actor)).value, true);
  assert.equal((await call('PUT', 'receipt-ledger', { revision: '', data: ledger }, actor)).status, 409);
  assert.equal((await call('GET', 'sales-book', undefined, actor)).value.data.fileName, data.fileName);
  assert.equal((await call('GET', 'receipt-ledger', undefined, actor)).value.data.revision, ledger.revision);

  const customer = {
    id: 'c1', misaCode: 'TEST', name: 'Khách hàng mẫu', group: 'unknown',
    taxCode: '', province: '', address: '', status: 'active', assignments: [],
    createdAt: data.importedAt, updatedAt: data.importedAt,
  };
  const employee = {
    id: 'e1', code: 'TEST', name: 'Nhân viên mẫu', phone: '', email: '',
    status: 'active', createdAt: data.importedAt,
  };
  const createdCustomer = (await call('POST', 'customers', customer, actor)).value;
  const createdEmployee = (await call('POST', 'employees', employee, actor)).value;
  const otherCustomer = (await call('POST', 'customers', { ...customer, misaCode: 'OTHER' }, actor)).value;
  const patch = (item, name) => call('PATCH', 'customers/' + item.id, {
    expected: item.updatedAt, customer: { ...item, name },
  }, actor);
  const writes = await Promise.all([patch(createdCustomer, 'Tên A'), patch(otherCustomer, 'Tên B')]);
  assert.deepEqual(writes.map(({ status }) => status), [200, 200]);
  assert.equal((await patch(createdCustomer, 'Tên cũ')).status, 409);
  assert.equal((await call('GET', 'customers', undefined, actor)).value.find(({ id }) => id === createdCustomer.id).name, 'Tên A');

  const viewer = await call('POST', 'accounts', {
    draft: { name: 'Người xem', username: 'view', password: 'temporary-view', role: 'viewer', pages: ['dashboard'] },
  }, actor);
  assert.equal(viewer.status, 200);
  const viewerSession = await call('POST', 'session', { username: 'view', password: 'temporary-view' });
  const viewerChanged = await call('PATCH', 'session/password', { password: 'viewer-password' }, viewerSession.cookie);
  assert.equal((await call('GET', 'sales-book', undefined, viewerChanged.cookie)).status, 200);
  assert.equal((await call('PUT', 'sales-book', { expected: data.importedAt, data }, viewerChanged.cookie)).status, 403);
  assert.equal((await call('GET', 'activities', undefined, viewerChanged.cookie)).status, 403);
  assert.equal((await call('GET', 'automatic-backups', undefined, viewerChanged.cookie)).status, 403);
  const guest = viewerChanged.cookie;
  const protectedRoutes = [
    ['GET', 'session'], ['DELETE', 'session'], ['PATCH', 'session/password', {}],
    ['POST', 'accounts', {}], ['PATCH', 'accounts/missing', {}], ['PATCH', 'accounts/missing/status', {}],
    ['GET', 'settings'], ['PUT', 'settings', {}], ['GET', 'customers'], ['GET', 'employees'],
    ['POST', 'customers', {}], ['POST', 'customers/imports', {}], ['POST', 'customers/misa-supplements', {}],
    ['PATCH', 'customers/missing', {}], ['DELETE', 'customers/missing', {}],
    ['POST', 'employees', {}], ['PATCH', 'employees/missing', {}], ['DELETE', 'employees/missing', {}],
    ['POST', 'assignments', {}], ['PATCH', 'assignments/missing', {}],
    ['GET', 'sales-book'], ['GET', 'sales-book/stamp'], ['GET', 'sales-book/allocated-documents'],
    ['PUT', 'sales-book', {}], ['GET', 'receipt-ledger'], ['GET', 'receipt-ledger/stamp'],
    ['PUT', 'receipt-ledger', {}], ['GET', 'activities'], ['POST', 'activities', {}],
    ['GET', 'business-backup'], ['POST', 'business-backup/restore', {}], ['DELETE', 'business-data', {}],
    ['GET', 'automatic-backups'], ['POST', 'automatic-backups/missing/restore'], ['GET', 'status'],
  ];
  const noDashboard = new Set(['accounts', 'accounts/missing', 'accounts/missing/status',
    'customers/imports', 'customers/misa-supplements', 'customers/missing', 'employees/missing',
    'assignments', 'assignments/missing', 'sales-book/allocated-documents', 'business-backup',
    'business-backup/restore', 'business-data', 'automatic-backups', 'automatic-backups/missing/restore']);
  for (const [method, resource, body] of protectedRoutes) {
    assert.equal((await call(method, resource, body)).status, 401, method + ' ' + resource);
    if (noDashboard.has(resource) ||
        (method !== 'GET' && ['customers', 'employees', 'sales-book', 'receipt-ledger', 'settings'].includes(resource)) ||
        (method === 'GET' && resource === 'activities'))
      assert.equal((await call(method, resource, body, guest)).status, 403, method + ' ' + resource);
  }
  assert.equal((await call('POST', '', {}, actor)).status, 404);
  assert.equal((await call('POST', 'status', {}, actor)).status, 405);
  assert.equal((await call('POST', 'session', { username: 'x'.repeat(17_000) })).status, 413);
  assert.equal((await call('POST', 'customers', { name: 'x'.repeat(66_000) }, guest)).status, 403);
  assert.equal((await call('POST', 'customers', { name: 'x'.repeat(66_000) }, actor)).status, 413);
  assert.equal((await call('POST', 'customers', {}, actor, { 'content-type': 'text/plain' })).status, 415);

  assert.equal((await call('PATCH', 'accounts/' + viewer.value.account.id + '/status', { active: false }, actor)).status, 200);
  assert.equal((await call('GET', 'session', undefined, viewerChanged.cookie)).status, 401);

  const editor = await call('POST', 'accounts', {
    draft: { name: 'Người nhập liệu', username: 'editor', password: 'temporary-editor', role: 'editor', pages: ['sales'] },
  }, actor);
  assert.equal(editor.status, 200);
  const editorSession = await call('POST', 'session', { username: 'editor', password: 'temporary-editor' });
  const editorChanged = await call('PATCH', 'session/password', { password: 'editor-password' }, editorSession.cookie);
  assert.equal(editorChanged.status, 200);
  assert.equal((await call('GET', 'sales-book/allocated-documents', undefined, editorChanged.cookie)).status, 403);
  assert.equal((await call('POST', 'customers', { ...customer, misaCode: 'NO' }, editorChanged.cookie)).status, 403);
  const misa = (await call('POST', 'accounts', {
    draft: { name: 'Nhập MISA', username: 'misa-only', password: 'temporary-misa', role: 'editor', pages: ['misa'] },
  }, actor)).value.account;
  const misaLogin = await call('POST', 'session', { username: misa.username, password: 'temporary-misa' });
  const misaCookie = (await call('PATCH', 'session/password', { password: 'misa-password' }, misaLogin.cookie)).cookie;
  assert.equal((await call('GET', 'sales-book/allocated-documents', undefined, misaCookie)).status, 200);
  assert.equal((await call('GET', 'receipt-ledger', undefined, misaCookie)).status, 403);
  assert.equal((await call('POST', 'customers', customer, misaCookie)).status, 403);
  assert.equal((await call('POST', 'customers/imports', { customers: [customer] }, misaCookie)).status, 403);
  const supplement = await call('POST', 'customers/misa-supplements', {
    customers: [{ ...customer, misaCode: 'MISA-IMPORT', assignments: [{ employeeId: 'unauthorized' }] }],
  }, misaCookie);
  assert.equal(supplement.status, 200);
  assert.deepEqual(supplement.value[0].assignments, []);
  assert.equal((await call('DELETE', 'customers/' + supplement.value[0].id, { expected: supplement.value[0].updatedAt }, misaCookie)).status, 403);
  assert.equal((await call('DELETE', 'customers/' + supplement.value[0].id, { expected: supplement.value[0].updatedAt }, actor)).status, 200);
  const batch = await call('POST', 'customers/imports', {
    customers: [{ ...customer, misaCode: 'BATCH' }, customer],
  }, actor);
  assert.equal(batch.status, 409);
  assert.ok(!(await call('GET', 'customers', undefined, actor)).value.some(({ misaCode }) => misaCode === 'BATCH'));
  const staleReceipt = {
    id: 'r-stale', number: 'PT-1', customerId: supplement.value[0].id,
    customerName: supplement.value[0].name, customerCode: supplement.value[0].misaCode,
    date: '2026-01-01', createdAt: data.importedAt, amount: 100, reference: '',
  };
  assert.equal((await call('PUT', 'receipt-ledger', {
    revision: ledger.revision, data: { ...ledger, revision: 'stale-customer', receipts: [staleReceipt] },
  }, actor)).status, 409);
  const settings = await call('GET', 'settings', undefined, actor);
  assert.equal((await call('PUT', 'settings', {
    expected: settings.value.revision, data: { ...settings.value.data, companyAddress: 'Địa chỉ thử' },
  }, actor)).status, 200);
  assert.equal((await call('GET', 'branding')).value.companyAddress, '');

  const employeeRoute = 'employees/' + createdEmployee.id;
  const withLink = { ...createdEmployee, linkedAccountId: editor.value.account.id };
  assert.equal((await call('PATCH', employeeRoute, { expected: createdEmployee, employee: withLink }, editorChanged.cookie)).status, 403);
  const linked = (await call('PATCH', employeeRoute, { expected: createdEmployee, employee: withLink }, actor)).value.employee;
  const salesCookie = editorChanged.cookie;
  const assignment = {
    employeeId: linked.id, employeeName: linked.name, effectiveFrom: '2026-02-01',
    customers: writes.map(({ value }) => ({ id: value.id, expected: value.updatedAt })),
  };
  const failedBulk = await call('POST', 'assignments', {
    ...assignment, customers: [assignment.customers[0], { ...assignment.customers[1], expected: 'stale' }],
  }, salesCookie);
  assert.equal(failedBulk.status, 409);
  assert.ok((await call('GET', 'customers', undefined, actor)).value.every((item) => !item.assignments.length));
  const assignedResponse = await call('POST', 'assignments', assignment, salesCookie);
  assert.equal(assignedResponse.status, 200);
  const [assigned, otherAssigned] = assignedResponse.value;
  const currentAssignment = assigned.assignments[0];
  assert.equal(currentAssignment.employeeId, linked.id);
  const renamed = await call('PATCH', employeeRoute, {
    expected: linked, employee: { ...linked, name: 'Tên nhân viên đã sửa' },
  }, salesCookie);
  assert.equal(renamed.status, 200);
  assert.equal(renamed.value.employee.linkedAccountId, editor.value.account.id);
  assert.equal(renamed.value.customers.length, 2);
  assert.ok(renamed.value.customers.every((item) => item.assignments[0].employeeName === renamed.value.employee.name));
  assert.equal((await call('PATCH', employeeRoute, {
    expected: renamed.value.employee, employee: { ...renamed.value.employee, linkedAccountId: undefined },
  }, salesCookie)).status, 403);
  const assignmentPath = 'assignments/' + currentAssignment.id;
  assert.equal((await call('PATCH', assignmentPath, { expected: assigned.updatedAt, effectiveTo: '2026-02-02' }, salesCookie)).status, 409);
  const renamedCustomer = renamed.value.customers.find(({ id }) => id === assigned.id);
  const ended = await call('PATCH', assignmentPath, { expected: renamedCustomer.updatedAt, effectiveTo: '2026-02-02' }, salesCookie);
  assert.equal(ended.value.assignments[0].effectiveTo, '2026-02-02');
  const removed = await call('DELETE', employeeRoute, { expected: renamed.value.employee, effectiveTo: '2026-02-03' }, actor);
  assert.equal(removed.status, 200);
  assert.equal(removed.value[0].id, otherAssigned.id);
  assert.equal(removed.value[0].assignments[0].effectiveTo, '2026-02-03');

  assert.equal((await call('POST', 'activities', { category: 'data', action: 'Thao tác mẫu', detail: '', actorId: 'fake' }, actor)).status, 200);
  assert.equal((await call('POST', 'activities', { category: 'session', action: 'Mở màn hình', detail: 'Nhật ký sử dụng' }, actor)).status, 200);
  const activity = (await call('GET', 'activities', undefined, actor)).value;
  assert.equal(activity.some(({ action }) => action === 'Mở màn hình'), false);
  assert.equal(activity.find(({ action }) => action === 'Thao tác mẫu').actorId, viewer.value.profile.id);
  for (const company of [tk, wb, naviva]) {
    const sibling = clients.get(company.id);
    const cookie = cookies.get(company.id);
    assert.equal((await sibling('GET', 'sales-book', undefined, cookie)).value, null);
    assert.equal((await sibling('GET', 'receipt-ledger', undefined, cookie)).value, null);
    assert.deepEqual((await sibling('GET', 'customers', undefined, cookie)).value, []);
    assert.ok(!(await sibling('GET', 'activities', undefined, cookie)).value.some(({ action }) => action === 'Thao tác mẫu'));
  }
  for (const directory of new Set(dataDirectories.values())) {
    const stored = (await readdir(directory)).filter((name) => name.endsWith('.sqlite')).sort();
    const expectedFiles = companies.filter(({ id }) => dataDirectories.get(id) === directory)
      .map(({ id }) => `cong-no-${id}.sqlite`).sort();
    assert.deepEqual(stored, expectedFiles);
  }

  const exported = await call('GET', 'business-backup', undefined, actor);
  assert.equal(exported.status, 200);
  assert.equal(exported.value.companyId, nhv.id);
  assert.equal(exported.value.data.salesBook.fileName, data.fileName);
  assert.equal(Object.hasOwn(exported.value.data, 'accounts'), false);
  assert.equal(Object.hasOwn(exported.value.data, 'activities'), false);
  assert.equal((await call('POST', 'business-backup/restore', {
    backup: { ...exported.value, companyId: tk.id },
  }, actor)).status, 400);
  assert.equal((await call('DELETE', 'business-data', { groups: ['salesBook'] }, actor)).status, 200);
  assert.equal((await call('GET', 'sales-book', undefined, actor)).value, null);
  assert.equal((await call('GET', 'receipt-ledger', undefined, actor)).value.data.revision, ledger.revision);
  assert.equal((await call('POST', 'business-backup/restore', { backup: exported.value }, actor)).status, 200);
  assert.equal((await call('GET', 'sales-book', undefined, actor)).value.data.fileName, data.fileName);
  const automatic = (await call('GET', 'automatic-backups', undefined, actor)).value.backups[0];
  assert.ok(automatic, 'Expected the daily LAN backup to be available.');
  assert.equal((await call('POST', 'automatic-backups/' + encodeURIComponent('../' + automatic.fileName) + '/restore', undefined, actor)).status, 404);
  assert.equal((await call('POST', 'automatic-backups/' + automatic.fileName + '/restore', undefined, actor)).status, 200);
  assert.equal((await call('GET', 'sales-book', undefined, actor)).value, null);
  assert.equal((await call('GET', 'session', undefined, actor)).status, 200);
  const savedSafety = await readdir(join(dataDirectories.get(nhv.id), 'backups', nhv.id));
  assert.equal(savedSafety.filter((file) => file.includes('truoc-khi-thay-doi')).length, 3);
  assert.equal((await call('DELETE', 'session', undefined, actor)).status, 200);
  assert.equal((await call('GET', 'session', undefined, actor)).status, 401);
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
