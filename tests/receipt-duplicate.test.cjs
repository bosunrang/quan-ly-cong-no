const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { openDatabase, DATASET_KEYS } = require('../server/database.cjs');
const { initializeAdministrator } = require('../server/access.cjs');
const { startDevelopmentServer } = require('../server/development.cjs');

test('ghi khoản thu cùng khách, cùng số tiền, gần ngày phải xác nhận không trùng', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cong-no-duplicate-'));
  const db = openDatabase(join(directory, 'cong-no.sqlite'));
  const password = 'duplicate-password-123';
  const time = '2026-01-01T00:00:00.000Z';
  await initializeAdministrator(db, password);
  const [initial] = db.readDataset('cong-no.accounts.v1').data;
  db.writeAccounts([initial], [{ ...initial, mustChangePassword: false }]);
  db.writeDataset(DATASET_KEYS.customers, 2, ['a', 'b'].map((code) => ({ id: 'c-' + code, misaCode: code,
    name: 'Khách ' + code, group: 'unknown', taxCode: '', address: '', province: '', status: 'active',
    createdAt: time, updatedAt: time, assignments: [] })));
  db.close();
  const backend = await startDevelopmentServer(directory);
  t.after(async () => { await backend.stop(); await rm(directory, { recursive: true, force: true }); });
  async function call(cookie, method, resource, payload) {
    const response = await fetch(backend.target + '/api/' + resource, { method,
      headers: { 'x-cong-no-lan': '1', cookie, ...(payload ? { 'content-type': 'application/json' } : {}) },
      body: payload ? JSON.stringify(payload) : undefined });
    return { status: response.status, ...(await response.json()) };
  }
  const session = await fetch(backend.target + '/api/session', { method: 'POST',
    headers: { 'x-cong-no-lan': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password }) });
  const cookie = session.headers.get('set-cookie').split(';')[0];
  const receipt = (id, extra = {}) => call(cookie, 'POST', 'receipts', { id, customerId: 'c-a', customerCode: 'a',
    date: '2026-03-01', amount: 4_704_000, reference: '', ...extra });
  const similar = async (query) =>
    (await call(cookie, 'GET', 'receipts/similar?' + new URLSearchParams(query))).value?.map(({ number }) => number);

  assert.equal((await receipt('receipt-first', { number: 'PT-1' })).status, 200);
  // Gửi lại cùng mã (lỗi mạng) vẫn không bị coi là trùng với chính nó.
  assert.equal((await receipt('receipt-first', { number: 'PT-1' })).status, 200);
  const query = { customerId: 'c-a', amount: 4_704_000, date: '2026-05-30' };
  assert.deepEqual(await similar(query), ['PT-1']);
  assert.deepEqual(await similar({ ...query, exclude: 'receipt-first' }), []);
  assert.deepEqual(await similar({ ...query, date: '2026-05-31' }), []);
  assert.deepEqual(await similar({ ...query, customerId: 'c-b' }), []);
  assert.deepEqual(await similar({ ...query, amount: 4_704_001 }), []);
  assert.equal((await call(cookie, 'GET', 'receipts/similar?customerId=c-a&amount=0&date=2026-03-01')).status, 400);

  // Khoản thứ hai cùng số tiền trong 90 ngày bị chặn ở máy chủ cho đến khi xác nhận.
  const refused = await receipt('receipt-second', { number: 'PT-2', date: '2026-05-30' });
  assert.equal(refused.status, 409);
  assert.match(refused.error, /PT-1 \(01\/03\/2026\)/);
  assert.equal((await receipt('receipt-second', { number: 'PT-2', date: '2026-05-30', allowDuplicate: 'yes' })).status, 400);
  assert.equal((await receipt('receipt-second', { number: 'PT-2', date: '2026-05-30', allowDuplicate: true })).status, 200);
  // Khoản ngoài 90 ngày, khách khác hoặc số tiền khác không cần xác nhận.
  assert.equal((await receipt('receipt-later', { number: 'PT-3', date: '2026-09-01' })).status, 200);
  assert.equal((await receipt('receipt-other', { number: 'PT-4', customerId: 'c-b', customerCode: 'b' })).status, 200);
  // Khoản thu đã hủy không còn tính là trùng.
  const fresh = (await call(cookie, 'GET', 'receipts/receipt-first')).value.revision;
  assert.equal((await call(cookie, 'POST', 'receipts/receipt-first/reversal',
    { date: '2026-03-02', reason: 'Ghi nhầm', revision: fresh })).status, 200);
  assert.deepEqual(await similar(query), ['PT-2']);

  const audit = (await call(cookie, 'GET', 'activities/export')).value;
  assert.ok(audit.some(({ action, detail }) => action === 'Ghi khoản thu' && /xác nhận không trùng PT-1/.test(detail)));
});
