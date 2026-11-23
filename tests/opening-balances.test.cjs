const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { openDatabase, DATASET_KEYS } = require('../server/database.cjs');
const { initializeAdministrator } = require('../server/access.cjs');
const { startDevelopmentServer } = require('../server/development.cjs');
const { SALE } = require('../server/books.cjs');

test('nhập số dư đầu kỳ MISA, tính vào công nợ và chặn thao tác làm số liệu tính hai lần', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cong-no-opening-'));
  const db = openDatabase(join(directory, 'cong-no.sqlite'));
  const password = 'opening-password-123';
  const time = '2026-01-01T00:00:00.000Z';
  await initializeAdministrator(db, password);
  const [initial] = db.readDataset('cong-no.accounts.v1').data;
  db.writeAccounts([initial], [{ ...initial, mustChangePassword: false }]);
  db.writeDataset(DATASET_KEYS.customers, 2, [{ id: 'c-a', misaCode: 'KH-A', name: 'Khách A', group: 'unknown',
    taxCode: '', address: '', province: '', status: 'active', createdAt: time, updatedAt: time, assignments: [] }]);
  const rows = [['BH-old', '2025-12-20', 700], ['BH-new', '2026-01-05', 500]].map(([documentNumber, date, amount], index) => ({
    rowNumber: index + 1, date, documentNumber, invoiceNumber: String(index + 1), customerName: 'Khách A',
    productName: 'Hàng', unit: 'Hộp', quantity: 1, unitPrice: amount, salesAmount: amount, paymentTotal: amount,
    source: { customerCode: 'KH-A', invoiceSeries: 'C26', invoiceDate: date, postingDate: date, debitAccount: '131' },
  }));
  rows.push({ ...rows[1], rowNumber: 3, documentNumber: 'BH-thieu-so', invoiceNumber: '',
    date: '2026-01-04', unitPrice: 0, salesAmount: 0, paymentTotal: 0,
    source: { ...rows[1].source, invoiceSeries: '', invoiceDate: '', postingDate: '2026-01-04' } });
  db.writeDataset(SALE, 1, { fileName: 'so.xlsx', importedAt: time, rows });
  db.close();
  const backend = await startDevelopmentServer(directory);
  t.after(async () => { await backend.stop(); await rm(directory, { recursive: true, force: true }); });
  async function call(cookie, method, resource, payload) {
    const response = await fetch(backend.target + '/api/' + resource, { method,
      headers: { 'x-cong-no-lan': '1', cookie, ...(payload ? { 'content-type': 'application/json' } : {}) },
      body: payload ? JSON.stringify(payload) : undefined });
    return { status: response.status, ...(await response.json()), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const { cookie } = await call('', 'POST', 'session', { username: 'admin', password });
  const read = async (resource) => (await call(cookie, 'GET', resource)).value;

  assert.equal(await read('opening-balances'), null);
  const source = { fileName: 'tong-hop-131.xlsx', date: '2025-12-31', rows: [
    { rowNumber: 6, customerCode: 'KH-A', customerName: 'Khách A', debit: 1000, credit: 0 },
    { rowNumber: 7, customerCode: 'KH-NEW', customerName: 'Khách mới', debit: 0, credit: 200 },
  ] };
  const preview = (await call(cookie, 'POST', 'opening-balances/preview', { source })).value;
  assert.deepEqual(preview.issues, []);
  assert.equal(preview.customerCount, 2);
  assert.equal(preview.additionCount, 1);
  assert.equal(preview.excludedSalesRows, 1);

  // Mã xem trước gắn với tệp: đổi số liệu mà không xem lại thì bị từ chối.
  const changed = { ...source, rows: [{ ...source.rows[0], debit: 900 }, source.rows[1]] };
  assert.equal((await call(cookie, 'POST', 'opening-balances', { source: changed, token: preview.token })).status, 409);
  const saved = await call(cookie, 'POST', 'opening-balances', { source, token: preview.token });
  assert.equal(saved.status, 200);
  assert.equal(saved.value.customerCount, 2);

  const status = await read('opening-balances');
  assert.deepEqual([status.date, status.customerCount, status.debitTotal, status.creditTotal, status.excludedSalesRows],
    ['2025-12-31', 2, 1000, 200, 1]);
  const customers = await read('customers');
  const added = customers.find(({ misaCode }) => misaCode === 'KH-NEW');
  assert.equal(added.name, 'Khách mới');

  // Công nợ = số dư đầu kỳ + bán hàng sau ngày chốt; khách mới dư có.
  const receivables = await read('receivables');
  const byCode = new Map(receivables.rows.items.map((row) => [row.customerCode, row]));
  assert.equal(byCode.get('KH-A').balance.remaining, 1500);
  assert.equal(byCode.get('KH-NEW').balance.remaining, -200);
  const invoicePath = 'receivables/' + encodeURIComponent(byCode.get('KH-A').id) + '/invoices';
  const invoices = await read(invoicePath + '?limit=1');
  assert.equal(invoices.invoiceCount, 1);
  assert.equal(invoices.missingInvoiceNumberCount, 1);
  assert.deepEqual(invoices.items[0].documentNumbers, ['BH-new']);
  const missing = await read(invoicePath + '?missingInvoice=1&limit=1');
  assert.equal(missing.total, 1);
  assert.equal(missing.missingInvoiceNumberCount, 1);
  assert.deepEqual(missing.items[0].documentNumbers, ['BH-thieu-so']);
  assert.equal((await read(invoicePath + '?missingInvoice=1&q=BH-new')).total, 0);

  // Khoản thu đến ngày chốt đã nằm trong số dư.
  const early = await call(cookie, 'POST', 'receipts', { id: 'receipt-early', customerId: 'c-a', customerCode: 'KH-A',
    date: '2025-12-31', amount: 100, reference: '' });
  assert.equal(early.status, 400);
  assert.match(early.error, /sau ngày chốt số dư đầu kỳ 31\/12\/2025/);

  // Không xóa khách đang có số dư đầu kỳ.
  const removal = await call(cookie, 'DELETE', 'customers/' + added.id, { expected: added.updatedAt });
  assert.equal(removal.status, 409);

  // Phân bổ khoản thu vào số dư đầu kỳ rồi thử xóa và nhập lại khác số dư.
  assert.equal((await call(cookie, 'POST', 'receipts', { id: 'receipt-a1', customerId: 'c-a', customerCode: 'KH-A',
    date: '2026-01-10', amount: 300, reference: '' })).status, 200);
  const candidates = await read('receipts/receipt-a1/candidates');
  const openingInvoice = candidates.items.find(({ invoice }) => invoice.documentNumber === 'Số dư đầu kỳ').invoice;
  const detail = await read('receipts/receipt-a1');
  assert.equal((await call(cookie, 'POST', 'receipts/receipt-a1/allocations', { revision: detail.revision,
    bookStamp: detail.bookStamp, date: '2026-01-10', lines: [{ invoice: openingInvoice, amount: 300 }] })).status, 200);
  const after = await read('receivables');
  assert.equal(after.rows.items.find((row) => row.customerCode === 'KH-A').balance.remaining, 1200);

  const locked = await call(cookie, 'DELETE', 'opening-balances', { expected: status.importedAt });
  assert.equal(locked.status, 409);
  const lockedPreview = (await call(cookie, 'POST', 'opening-balances/preview', { source: changed })).value;
  assert.equal(lockedPreview.issues.length, 1);
  assert.match(lockedPreview.issues[0], /KH-A/);
  // Nhập lại đúng số dư cũ vẫn được.
  const same = (await call(cookie, 'POST', 'opening-balances/preview', { source })).value;
  assert.deepEqual(same.issues, []);
});

test('đặt ngày chốt rồi nhân viên điền tay số dư từng khách ở Công nợ phải thu', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cong-no-opening-manual-'));
  const db = openDatabase(join(directory, 'cong-no.sqlite'));
  const password = 'opening-password-123';
  const time = '2026-01-01T00:00:00.000Z';
  await initializeAdministrator(db, password);
  const [initial] = db.readDataset('cong-no.accounts.v1').data;
  db.writeAccounts([initial], [{ ...initial, mustChangePassword: false }]);
  db.writeDataset(DATASET_KEYS.customers, 2, [{ id: 'c-z', misaCode: 'KH-Z', name: 'Khách Zeta', group: 'unknown',
    taxCode: '', address: '', province: '', status: 'active', createdAt: time, updatedAt: time, assignments: [] }]);
  db.close();
  const backend = await startDevelopmentServer(directory);
  t.after(async () => { await backend.stop(); await rm(directory, { recursive: true, force: true }); });
  async function call(cookie, method, resource, payload) {
    const response = await fetch(backend.target + '/api/' + resource, { method,
      headers: { 'x-cong-no-lan': '1', cookie, ...(payload ? { 'content-type': 'application/json' } : {}) },
      body: payload ? JSON.stringify(payload) : undefined });
    return { status: response.status, ...(await response.json()), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const { cookie } = await call('', 'POST', 'session', { username: 'admin', password });
  const path = 'opening-balances/customers/c-z';

  // Chưa có ngày chốt: không điền được.
  assert.deepEqual((await call(cookie, 'GET', path)).value,
    { date: null, amount: 0, source: null, fileName: '', locked: false });
  assert.equal((await call(cookie, 'PUT', path, { amount: 500, expected: 0 })).status, 409);

  const cutoff = await call(cookie, 'PUT', 'opening-balances/date', { date: '2025-12-31', expected: null });
  assert.equal(cutoff.status, 200);

  // Khách chưa có chứng từ chỉ hiện khi tìm theo tên hoặc mã.
  assert.equal((await call(cookie, 'GET', 'receivables')).value.rows.items.length, 0);
  const found = (await call(cookie, 'GET', 'receivables?q=zeta')).value.rows.items;
  assert.deepEqual(found.map(({ id }) => id), ['catalog:c-z']);
  assert.equal((await call(cookie, 'GET', 'receivables/catalog%3Ac-z/invoices')).status, 200);

  assert.equal((await call(cookie, 'PUT', path, { amount: 500, expected: 0 })).status, 200);
  assert.equal((await call(cookie, 'PUT', path, { amount: 700, expected: 0 })).status, 409);
  assert.deepEqual((await call(cookie, 'GET', path)).value,
    { date: '2025-12-31', amount: 500, source: 'manual', fileName: '', locked: false });
  const listed = (await call(cookie, 'GET', 'receivables')).value.rows.items;
  assert.deepEqual(listed.map(({ customerCode, balance }) => [customerCode, balance.remaining]), [['KH-Z', 500]]);
  const status = (await call(cookie, 'GET', 'opening-balances')).value;
  assert.deepEqual([status.customerCount, status.manualCount, status.debitTotal], [1, 1, 500]);

  // Đã có số dư thì không đổi ngày chốt được nữa.
  assert.equal((await call(cookie, 'PUT', 'opening-balances/date',
    { date: '2025-11-30', expected: status.importedAt })).status, 409);
  const activity = (await call(cookie, 'GET', 'activities')).value;
  const actions = (activity.items ?? activity).map(({ action }) => action);
  assert.ok(actions.includes('Cập nhật số dư đầu kỳ'));
  assert.ok(actions.includes('Đặt ngày chốt số dư đầu kỳ'));
});
