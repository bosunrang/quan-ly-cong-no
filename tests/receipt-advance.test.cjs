const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { openDatabase, DATASET_KEYS } = require('../server/database.cjs');
const { initializeAdministrator } = require('../server/access.cjs');
const { startDevelopmentServer } = require('../server/development.cjs');
const { SALE } = require('../server/books.cjs');

test('khoản thu chỉ phân bổ vào chứng từ sau ngày thu khi xác nhận khách trả trước', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cong-no-advance-'));
  const db = openDatabase(join(directory, 'cong-no.sqlite'));
  const password = 'advance-password-123';
  const time = '2026-01-01T00:00:00.000Z';
  await initializeAdministrator(db, password);
  const [initial] = db.readDataset('cong-no.accounts.v1').data;
  db.writeAccounts([initial], [{ ...initial, mustChangePassword: false }]);
  db.writeDataset(DATASET_KEYS.customers, 2, [{ id: 'c-a', misaCode: 'a', name: 'Khách A', group: 'unknown',
    taxCode: '', address: '', province: '', status: 'active', createdAt: time, updatedAt: time, assignments: [] }]);
  const rows = [['BH-early', '2026-01-02'], ['BH-later', '2026-01-10']].map(([documentNumber, date], index) => ({
    rowNumber: index + 1, date, documentNumber, invoiceNumber: String(index + 1), customerName: 'Khách A',
    productName: 'Hàng', unit: 'Hộp', quantity: 1, unitPrice: 200, salesAmount: 200, paymentTotal: 200,
    source: { customerCode: 'a' },
  }));
  db.writeDataset(SALE, 1, { fileName: 'advance.xlsx', importedAt: time, rows });
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
  const read = (resource) => call(cookie, 'GET', resource);
  assert.equal((await call(cookie, 'POST', 'receipts', { id: 'receipt-a1', customerId: 'c-a', customerCode: 'a',
    date: '2026-01-05', amount: 400, reference: '' })).status, 200);
  const base = 'receipts/receipt-a1/candidates';

  // Mặc định chỉ thấy chứng từ đến ngày thu và báo số chứng từ sau ngày thu đang ẩn.
  const listed = (await read(base)).value;
  assert.deepEqual(listed.items.map(({ invoice }) => invoice.documentNumber), ['BH-early']);
  assert.equal(listed.later, 1);
  const advance = (await read(base + '?advance=1')).value;
  assert.deepEqual(advance.items.map(({ invoice }) => invoice.documentNumber), ['BH-later', 'BH-early']);

  // Nhóm khớp số tiền cũng không gom chứng từ sau ngày thu nếu chưa bật trả trước.
  const today = new Date();
  const date = [today.getFullYear(), today.getMonth() + 1, today.getDate()]
    .map((part) => String(part).padStart(2, '0')).join('-');
  const matchesOf = async (query) => (await read(base + '/matches?date=' + date + query)).value.matches
    .map((group) => group.map(({ invoice }) => invoice.documentNumber).sort());
  assert.ok((await matchesOf('')).every((group) => !group.includes('BH-later')));
  assert.ok((await matchesOf('&advance=1')).some((group) => group.includes('BH-later')));

  const later = advance.items.find(({ invoice }) => invoice.documentNumber === 'BH-later').invoice;
  const save = async (extra) => {
    const detail = (await read('receipts/receipt-a1')).value;
    return call(cookie, 'POST', 'receipts/receipt-a1/allocations', { revision: detail.revision,
      bookStamp: detail.bookStamp, date: '2026-01-10', lines: [{ invoice: later, amount: 100 }], ...extra });
  };
  const refused = await save({});
  assert.equal(refused.status, 400);
  assert.match(refused.error, /khách trả trước/);
  assert.equal((await save({ advance: 'yes' })).status, 400);
  assert.equal((await save({ advance: true })).status, 200);
  assert.equal((await read('receipts/receipt-a1')).value.allocated, 100);
});
