const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { openDatabase, DATASET_KEYS } = require('../server/database.cjs');
const { initializeAdministrator } = require('../server/access.cjs');
const { startDevelopmentServer } = require('../server/development.cjs');
const { SALE } = require('../server/books.cjs');

test('nhân viên phải liên kết và chỉ đọc, đối soát khách đang được phân công qua HTTP', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cong-no-scope-'));
  const db = openDatabase(join(directory, 'cong-no.sqlite'));
  const password = 'scope-password-123';
  const time = '2026-01-01T00:00:00.000Z';
  await initializeAdministrator(db, password);
  const [initial] = db.readDataset('cong-no.accounts.v1').data;
  const admin = { ...initial, mustChangePassword: false };
  const staff = ['one', 'two', 'empty', 'unlinked', 'inactive'].map((id) => ({ ...admin,
    id, username: id, role: id === 'two' ? 'viewer' : 'editor',
    pages: id === 'two' ? ['dashboard', 'receivables', 'reports'] : ['dashboard', 'receivables', 'payments', 'reports', 'sales'],
  }));
  db.writeAccounts([initial], [admin, ...staff]);
  const employees = staff.filter(({ id }) => id !== 'unlinked').map(({ id }) => ({
    id: 'e-' + id, code: id, name: id, phone: '', email: '', status: id === 'inactive' ? 'inactive' : 'active',
    createdAt: time, linkedAccountId: id,
  }));
  const customers = ['one', 'two', 'unassigned', 'ended'].map((id) => ({
    id: 'c-' + id, misaCode: id, name: 'Khách ' + id, group: 'unknown', taxCode: '', address: '',
    province: id, status: 'active', createdAt: time, updatedAt: time,
    assignments: id === 'unassigned' ? [] : [{ id: 'a-' + id, employeeId: 'e-' + (id === 'ended' ? 'one' : id),
      employeeName: id, province: id, source: 'direct', effectiveFrom: '2026-01-01',
      effectiveTo: id === 'ended' ? '2026-01-02' : null }],
  }));
  db.writeDataset(DATASET_KEYS.employees, 2, employees);
  db.writeDataset(DATASET_KEYS.customers, 2, customers);
  const rows = [...customers, { name: 'Khách chưa có danh mục', misaCode: 'missing' }].map((customer, index) => ({
    rowNumber: index + 1, date: '2026-01-02', documentNumber: 'BH-' + index, invoiceNumber: String(index + 1),
    customerName: customer.name, productName: 'Hàng', unit: 'Hộp', quantity: 1, unitPrice: 200,
    salesAmount: 200, paymentTotal: 200, source: { customerCode: customer.misaCode },
  }));
  db.writeDataset(SALE, 1, { fileName: 'scope.xlsx', importedAt: time, rows });
  db.close();
  const backend = await startDevelopmentServer(directory);
  t.after(async () => { await backend.stop(); await rm(directory, { recursive: true, force: true }); });
  async function call(cookie, method, resource, payload) {
    const response = await fetch(backend.target + '/api/' + resource, { method,
      headers: { 'x-cong-no-lan': '1', cookie, ...(payload ? { 'content-type': 'application/json' } : {}) },
      body: payload ? JSON.stringify(payload) : undefined });
    return { status: response.status, ...(await response.json()), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const login = (username) => call('', 'POST', 'session', { username, password });
  const unlinked = await login('unlinked');
  assert.equal(unlinked.status, 403);
  assert.match(unlinked.error, /chưa liên kết/);
  assert.equal(unlinked.cookie, undefined);
  assert.equal((await login('inactive')).status, 403);
  const cookies = {};
  for (const username of ['admin', 'one', 'two', 'empty']) {
    const result = await login(username);
    assert.equal(result.status, 200);
    cookies[username] = result.cookie;
  }
  const read = (user, resource) => call(cookies[user], 'GET', resource);
  const write = (user, method, resource, payload) => call(cookies[user], method, resource, payload);
  const period = 'from=2026-01-01&through=2026-12-31';

  // Có phân bổ thật ở cả hai khách để kiểm tra tổng và chi tiết không lẫn dữ liệu.
  for (const id of ['one', 'two']) {
    const receiptId = 'receipt-' + id;
    assert.equal((await write('admin', 'POST', 'receipts', { id: receiptId, customerId: 'c-' + id,
      customerCode: id, date: '2026-01-02', amount: 100, reference: '' })).status, 200);
    const detail = (await read('admin', 'receipts/' + receiptId)).value;
    const candidate = (await read('admin', 'receipts/' + receiptId + '/candidates')).value.items[0];
    assert.equal((await write('admin', 'POST', 'receipts/' + receiptId + '/allocations', {
      revision: detail.revision, bookStamp: detail.bookStamp, date: '2026-01-02',
      lines: [{ invoice: candidate.invoice, amount: 50 }],
    })).status, 200);
  }
  // Xen kẽ quản trị và các nhân viên cùng kỳ: bộ nhớ đệm không được làm lộ tổng của người khác.
  for (const user of ['admin', 'one', 'two', 'empty', 'admin', 'two', 'one']) {
    const result = await read(user, 'dashboard?' + period);
    assert.equal(result.status, 200);
    const expected = user === 'admin' ? 700 : user === 'empty' ? 0 : 150;
    assert.equal(result.value.remaining, expected, user);
    assert.equal(result.value.periodReceived, user === 'admin' ? 200 : user === 'empty' ? 0 : 100);
    assert.equal(result.value.unallocated, user === 'admin' ? 100 : user === 'empty' ? 0 : 50);
    assert.equal(result.value.salesRowCount, user === 'admin' ? 5 : user === 'empty' ? 0 : 1);
    if (user !== 'admin') assert.ok(result.value.rows.items.every(({ id }) => id === 'catalog:c-' + user));
  }
  for (const view of ['period', 'unallocated']) {
    const result = (await read('one', 'dashboard?' + period + '&view=' + view)).value;
    assert.equal(result.rows.total, 1);
    assert.equal(result.rows.items[0].customerId, 'c-one');
  }
  assert.deepEqual((await read('one', 'customers')).value.map(({ id }) => id), ['c-one']);
  const receivables = (await read('one', 'receivables')).value;
  assert.equal(receivables.rows.total, 1);
  assert.deepEqual(receivables.filterOptions.provinces, ['one']);
  assert.equal(receivables.filterOptions.unmatchedCount, 0);
  assert.equal((await read('one', 'receivables?employee=e-two')).value.rows.total, 0);
  assert.equal((await read('empty', 'receivables')).value.rows.total, 0);
  assert.equal((await read('one', 'reports/statements/c-one?' + period)).status, 200);
  assert.equal((await write('two', 'PUT', 'receivables/opening-balances/c-two', {
    expected: null, amount: 450, date: '2026-01-01',
  })).status, 403);
  const ownInvoices = (await read('one', 'receivables/catalog%3Ac-one/invoices')).value.items;
  assert.equal(ownInvoices.length, 1);
  assert.equal((await read('one', 'receivables/catalog%3Ac-one/invoices/' + encodeURIComponent(ownInvoices[0].id))).status, 200);
  for (const resource of [
    'receivables/catalog%3Ac-two/invoices', 'receivables/catalog%3Ac-two/invoices?' + period,
    'receivables/catalog%3Ac-two/invoices/' + encodeURIComponent(ownInvoices[0].id),
    'reports/statements/c-two?' + period, 'reports/statements/c-unassigned?' + period,
    'receipts/receipt-two', 'receipts/receipt-two/candidates',
    'receipts/receipt-two/candidates/matches?date=2026-01-02', 'receipts/receipt-two/candidates/guess',
  ]) assert.equal((await read('one', resource)).status, 404, resource);
  const receipts = (await read('one', 'receipts')).value;
  assert.equal(receipts.count, 1);
  assert.equal(receipts.items[0].receipt.customerId, 'c-one');
  assert.equal((await read('one', 'receipts?q=two')).value.total, 0);
  assert.equal((await read('one', 'receipts/receipt-one/candidates')).status, 200);
  const other = (await read('admin', 'receipts/receipt-two')).value;
  const revision = other.revision;
  assert.equal((await write('one', 'POST', 'receipts', { id: 'forbidden-receipt', customerId: 'c-two',
    customerCode: 'two', date: '2026-01-02', amount: 1, reference: '' })).status, 404);
  assert.equal((await write('one', 'POST', 'receipts/receipt-two/allocations', {
    lines: [{ invoice: { id: 'guess' }, amount: 1 }], revision, date: '2026-01-02',
  })).status, 404);
  for (const resource of ['receipts/receipt-two/reversal', 'allocations/' + other.allocations[0].id + '/reversal'])
    assert.equal((await write('one', 'POST', resource, { date: '2026-01-02', reason: 'Thử quyền', revision })).status, 404);
  assert.equal((await read('admin', 'receipts/receipt-two')).value.revision, revision);
  assert.equal((await write('one', 'POST', 'receipts', { id: 'own-new-receipt', customerId: 'c-one',
    customerCode: 'one', date: '2026-01-02', amount: 1, reference: '' })).status, 200);

  // Tự nhận rồi bỏ phân công: cả bốn màn hình cập nhật trong cùng phiên.
  const available = (await read('empty', 'assignments')).value.customers.find(({ id }) => id === 'c-unassigned');
  assert.equal((await write('admin', 'POST', 'receipts', { id: 'receipt-unassigned', customerId: available.id,
    customerCode: available.misaCode, date: '2026-01-02', amount: 80, reference: '' })).status, 200);
  async function checkClaim(visible) {
    const dashboard = (await read('empty', 'dashboard?' + period)).value;
    assert.equal(dashboard.remaining, visible ? 200 : 0);
    assert.equal(dashboard.periodReceived, visible ? 80 : 0);
    assert.deepEqual(dashboard.rows.items.map(({ id }) => id), visible ? ['catalog:c-unassigned'] : []);
    const debts = (await read('empty', 'receivables')).value;
    assert.deepEqual(debts.rows.items.map(({ customerId }) => customerId), visible ? [available.id] : []);
    const payments = (await read('empty', 'receipts')).value;
    assert.deepEqual(payments.items.map(({ receipt }) => receipt.customerId), visible ? [available.id] : []);
    const statement = await read('empty', 'reports/statements/c-unassigned?' + period);
    assert.equal(statement.status, visible ? 200 : 404);
    if (visible) assert.equal(statement.value.customer.id, available.id);
    assert.deepEqual((await read('empty', 'customers')).value.map(({ id }) => id), visible ? [available.id] : []);
  }
  await checkClaim(false);
  const claimed = await write('empty', 'POST', 'assignments', { employeeId: 'e-empty', employeeName: 'empty',
    effectiveFrom: '2026-01-03', customers: [{ id: available.id, expected: available.updatedAt }] });
  assert.equal(claimed.status, 200);
  await checkClaim(true);
  const [assignedCustomer] = claimed.value;
  assert.equal((await write('empty', 'PATCH', 'assignments/' + assignedCustomer.assignments[0].id, {
    expected: assignedCustomer.updatedAt, effectiveTo: '2026-01-04',
  })).status, 200);
  await checkClaim(false);

  // Chuyển khách cho người khác có hiệu lực ngay, không phải đăng nhập lại.
  const own = (await read('admin', 'customers')).value.find(({ id }) => id === 'c-one');
  assert.equal((await write('admin', 'POST', 'assignments', { employeeId: 'e-two', employeeName: 'two',
    effectiveFrom: '2026-01-03', customers: [{ id: own.id, expected: own.updatedAt }] })).status, 200);
  assert.equal((await read('one', 'dashboard?' + period)).value.remaining, 0);
  assert.equal((await read('one', 'receipts')).value.count, 0);
  assert.equal((await read('two', 'dashboard?' + period)).value.remaining, 300);
  assert.equal((await read('one', 'reports/statements/c-one?' + period)).status, 404);

  const employee = (await read('admin', 'employees')).value.find(({ id }) => id === 'e-one');
  assert.equal((await write('admin', 'PATCH', 'employees/e-one', {
    expected: employee, employee: { ...employee, linkedAccountId: undefined },
  })).status, 200);
  assert.equal((await read('one', 'session')).status, 401);
  assert.equal((await read('one', 'dashboard?' + period)).status, 401);
  assert.equal((await login('one')).status, 403);
  const unlinkedEmployee = (await read('admin', 'employees')).value.find(({ id }) => id === 'e-one');
  assert.equal((await write('admin', 'PATCH', 'employees/e-one', {
    expected: unlinkedEmployee, employee: { ...unlinkedEmployee, linkedAccountId: 'one' },
  })).status, 200);
  assert.equal((await read('one', 'session')).status, 401);
  assert.equal((await login('one')).status, 200);
  const empty = (await read('admin', 'employees')).value.find(({ id }) => id === 'e-empty');
  assert.equal((await write('admin', 'PATCH', 'employees/e-empty', {
    expected: empty, employee: { ...empty, status: 'inactive' },
  })).status, 200);
  assert.equal((await read('empty', 'session')).status, 401);
  const deleted = (await read('admin', 'employees')).value.find(({ id }) => id === 'e-two');
  assert.equal((await write('admin', 'DELETE', 'employees/e-two', {
    expected: deleted, effectiveTo: '2026-01-04',
  })).status, 200);
  assert.equal((await read('two', 'session')).status, 401);
  assert.equal((await login('two')).status, 403);

  // Số dư nhập tay là nguồn công nợ riêng, kể cả khi khách chưa có chứng từ MISA.
  assert.equal((await write('admin', 'DELETE', 'business-data', { groups: ['salesBook', 'ledger'] })).status, 200);
  cookies.one = (await login('one')).cookie;
  const availableForOpening = (await read('admin', 'customers')).value.find(({ id }) => id === 'c-unassigned');
  assert.equal((await write('one', 'PUT', 'receivables/opening-balances/c-unassigned', {
    expected: null, amount: 900, date: '2026-01-06',
  })).status, 404);
  assert.equal((await write('admin', 'POST', 'assignments', { employeeId: 'e-one', employeeName: 'one',
    effectiveFrom: '2026-01-05', customers: [{ id: availableForOpening.id, expected: availableForOpening.updatedAt }] })).status, 200);
  const search = (await read('one', 'receivables?q=unassigned')).value;
  assert.equal(search.hasBook, false);
  const openingCustomer = search.rows.items[0];
  assert.equal(openingCustomer.customerId, 'c-unassigned');
  const invoiceList = 'receivables/' + encodeURIComponent(openingCustomer.id) + '/invoices';
  assert.equal((await read('one', invoiceList)).value.total, 0);
  const openingRoute = 'receivables/opening-balances/c-unassigned';
  const balance = { amount: 900, date: '2026-01-06' };
  assert.equal((await write('one', 'PUT', openingRoute, { expected: null, ...balance, date: '2026-02-30' })).status, 400);
  assert.deepEqual((await write('one', 'PUT', openingRoute, { expected: null, ...balance })).value, { balance, locked: false });
  assert.equal((await write('one', 'PUT', openingRoute, { expected: null, ...balance, amount: 1000 })).status, 409);
  const openingDocument = (await read('one', invoiceList)).value.items[0];
  assert.equal(openingDocument.openingBalance, true);
  assert.equal(openingDocument.balance.remaining, 900);
  assert.equal((await read('one', 'dashboard?from=2026-01-01&through=2026-01-05')).value.remaining, 0);
  assert.equal((await read('one', 'dashboard?' + period)).value.remaining, 900);
  assert.equal((await read('one', 'receivables')).value.rows.items[0].balance.remaining, 900);
  const statementRoute = 'reports/statements/c-unassigned?from=2026-01-07&through=2026-12-31';
  assert.equal((await read('one', statementRoute)).value.opening, 900);
  const receiptRoute = 'receipts/opening-payment';
  assert.equal((await write('one', 'POST', 'receipts', { id: 'opening-payment', customerId: 'c-unassigned',
    customerCode: 'unassigned', date: '2026-01-07', amount: 250, reference: '' })).status, 200);
  const openedReceipt = (await read('one', receiptRoute)).value;
  assert.equal(openedReceipt.hasInvoices, true);
  const { invoice } = (await read('one', receiptRoute + '/candidates')).value.items[0];
  assert.equal(invoice.amount, 900);
  assert.equal((await write('one', 'POST', receiptRoute + '/allocations', { revision: openedReceipt.revision,
    bookStamp: openedReceipt.bookStamp, date: '2026-01-07', lines: [{ invoice, amount: 250 }] })).status, 200);
  assert.equal((await read('one', 'dashboard?' + period)).value.remaining, 650);
  assert.equal((await read('one', 'receivables')).value.rows.items[0].balance.remaining, 650);
  const statement = (await read('one', statementRoute)).value;
  assert.deepEqual([statement.opening, statement.payment, statement.closing], [900, 250, 650]);
  assert.equal((await read('one', openingRoute)).value.locked, true);
  assert.equal((await write('one', 'PUT', openingRoute, { expected: balance, amount: 0 })).status, 409);
  const backup = (await read('admin', 'business-backup')).value;
  assert.deepEqual(backup.data.customers.find(({ id }) => id === 'c-unassigned').openingBalance, balance);
  assert.equal((await write('admin', 'POST', 'business-backup/restore', { backup })).status, 200);
  assert.equal((await read('one', 'dashboard?' + period)).value.remaining, 650);
});
