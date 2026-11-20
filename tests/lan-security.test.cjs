const assert = require('node:assert/strict');
const test = require('node:test');
const { openDatabase } = require('../server/database.cjs');
const { createAccess, initializeAdministrator } = require('../server/access.cjs');
const {
  isValidCustomerList, isValidReceiptLedger, isValidSalesBook, isValidSettings,
} = require('../src/domain/settings/business-data.rules.mjs');

const company = { id: 'kiem-thu', name: 'Kiểm thử' };
let address = 0;
function request(cookie) {
  address += 1;
  // Mỗi yêu cầu từ một địa chỉ khác để chỉ kiểm tra giới hạn theo tài khoản.
  return { headers: cookie ? { cookie } : {}, socket: { remoteAddress: `10.0.0.${address}` } };
}
function response() {
  return { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
}

async function statusOf(promise) {
  try { await promise; return 200; } catch (error) { return error.status; }
}

test('không thể dùng tài khoản của mình để đặt lại giới hạn dò mật khẩu quản trị', async () => {
  const db = openDatabase(':memory:');
  try {
    const password = 'mat-khau-dung-123';
    await initializeAdministrator(db, password);
    const [admin] = db.readDataset('cong-no.accounts.v1').data;
    const viewer = { ...admin, id: 'viewer', username: 'ketoan', role: 'viewer', pages: ['dashboard'],
      mustChangePassword: false };
    assert.equal(db.writeAccounts([admin], [admin, viewer]), true);
    db.writeDataset('cong-no.sales-employees.v2', 2, [{ id: 'viewer-employee', code: 'VIEW', name: 'Người xem',
      phone: '', email: '', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', linkedAccountId: viewer.id }]);
    const access = createAccess(db, company, false);
    const login = (username, secret) =>
      statusOf(access.handle('login', { username, password: secret }, request(), response()));

    for (let attempt = 0; attempt < 5; attempt++) {
      assert.equal(await login('admin', `sai-${attempt}-mat-khau`), 401);
      // Đăng nhập đúng bằng tài khoản khác không xóa bộ đếm của admin.
      assert.equal(await login('ketoan', password), 200);
    }
    assert.equal(await login('admin', 'sai-lan-sau-mat-khau'), 401);
    // Sau 6 lần sai, admin bị tạm khóa kể cả khi nhập đúng mật khẩu.
    assert.equal(await login('admin', password), 429);
    assert.equal(await login('ketoan', password), 200);
  } finally {
    db.close();
  }
});

test('giới hạn đăng nhập sai theo máy, đăng nhập đúng không xóa bộ đếm của máy', async () => {
  const db = openDatabase(':memory:');
  try {
    await initializeAdministrator(db, 'mat-khau-dung-123');
    const access = createAccess(db, company, false);
    const fixed = { headers: {}, socket: { remoteAddress: '10.9.9.9' } };
    for (let attempt = 0; attempt < 15; attempt++) {
      const status = await statusOf(access.handle('login',
        { username: `khong-co-${attempt}`, password: 'sai-mat-khau-1' }, fixed, response()));
      assert.equal(status, 401);
    }
    assert.equal(await statusOf(access.handle('login',
      { username: 'admin', password: 'mat-khau-dung-123' }, fixed, response())), 429);
  } finally {
    db.close();
  }
});

test('gửi song song nhiều lần đăng nhập sai vẫn bị giới hạn theo máy và theo tài khoản', async () => {
  const db = openDatabase(':memory:');
  try {
    const password = 'mat-khau-dung-123';
    await initializeAdministrator(db, password);
    const access = createAccess(db, company, false);
    // 30 yêu cầu sai cùng lúc từ một máy: chỉ 15 lượt đầu được kiểm tra mật khẩu.
    const fixed = { headers: {}, socket: { remoteAddress: '10.8.8.8' } };
    const burst = await Promise.all(Array.from({ length: 30 }, (_, index) =>
      statusOf(access.handle('login', { username: `khong-co-${index}`, password: 'sai-mat-khau-1' }, fixed, response()))));
    assert.equal(burst.filter((status) => status === 401).length, 15);
    assert.equal(burst.filter((status) => status === 429).length, 15);
    // 20 yêu cầu sai cùng lúc vào admin từ nhiều máy: tài khoản bị khóa, mật khẩu đúng cũng bị chặn.
    const account = await Promise.all(Array.from({ length: 20 }, (_, index) =>
      statusOf(access.handle('login', { username: 'admin', password: `sai-${index}-mat-khau` }, request(), response()))));
    assert.ok(account.filter((status) => status === 401).length <= 6, account.join(','));
    assert.equal(await statusOf(access.handle('login', { username: 'admin', password }, request(), response())), 429);
  } finally {
    db.close();
  }
});

test('phiên đăng nhập còn sau khi khởi động lại máy chủ, mất khi đăng xuất', async () => {
  const db = openDatabase(':memory:');
  try {
    const password = 'mat-khau-dung-123';
    await initializeAdministrator(db, password);
    const first = createAccess(db, company, false);
    const res = response();
    await first.handle('login', { username: 'admin', password }, request(), res);
    const cookie = String(res.headers['Set-Cookie']).split(';')[0];
    // Bảng sessions chỉ lưu bản băm của token, không lưu token trong cookie.
    const stored = db.findSession(cookie.split('=')[1]);
    assert.equal(stored, undefined);
    const restarted = createAccess(db, company, false);
    assert.equal(restarted.actor(request(cookie), true).username, 'admin');
    await restarted.handle('logout', {}, request(cookie), response());
    assert.throws(() => createAccess(db, company, false).actor(request(cookie), true), { status: 401 });
  } finally {
    db.close();
  }
});

test('đăng nhập đúng trả lại lượt đã tính cho máy', async () => {
  const db = openDatabase(':memory:');
  try {
    const password = 'mat-khau-dung-123';
    await initializeAdministrator(db, password);
    const access = createAccess(db, company, false);
    const fixed = { headers: {}, socket: { remoteAddress: '10.7.7.7' } };
    for (let attempt = 0; attempt < 20; attempt++)
      assert.equal(await statusOf(access.handle('login', { username: 'admin', password }, fixed, response())), 200);
  } finally {
    db.close();
  }
});

const customer = {
  id: 'c1', misaCode: 'KH001', name: 'Khách A', group: 'unknown', taxCode: '', province: 'Hà Nội',
  address: '', status: 'active', assignments: [],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
test('máy chủ từ chối dữ liệu ghi sai cấu trúc', () => {
  assert.equal(isValidCustomerList([customer]), true);
  assert.equal(isValidCustomerList([{ ...customer, status: 'deleted' }]), false);
  assert.equal(isValidCustomerList([customer, customer]), false);
  const line = {
    rowNumber: 2, date: '2026-11-01', documentNumber: 'BH1', invoiceNumber: '1', customerName: 'A',
    productName: 'B', unit: 'Hộp', quantity: 1, unitPrice: 10, salesAmount: 10, paymentTotal: 11,
  };
  const book = { fileName: 'a.xlsx', importedAt: '2026-11-19T00:00:00.000Z', rows: [line] };
  assert.equal(isValidSalesBook(book), true);
  assert.equal(isValidSalesBook({ ...book, rows: [{ ...line, paymentTotal: '11' }] }), false);
  const receipt = {
    id: 'r1', number: 'PT-1', customerId: 'c1', customerName: 'A', customerCode: 'KH001', reference: '',
    date: '2026-11-02', createdAt: '2026-11-02T00:00:00.000Z', amount: 100,
  };
  assert.equal(isValidReceiptLedger({ revision: 'x', receipts: [receipt], allocations: [] }), true);
  assert.equal(isValidReceiptLedger({ revision: 'x', receipts: [{ ...receipt, amount: -5 }], allocations: [] }), false);
  assert.equal(isValidReceiptLedger({
    revision: 'x', receipts: [], allocations: [{
      id: 'a', receiptId: 'khong-co', date: '2026-11-02', createdAt: '2026-11-02T00:00:00.000Z', lines: [],
    }],
  }), false);
  const settings = { companyName: 'A', companyAddress: '', displayName: 'A', tagline: '', logoDataUrl: null };
  assert.equal(isValidSettings(settings), true);
  assert.equal(isValidSettings({ ...settings, bankAccounts: ['1', '2', '3', '4'] }), false);
  assert.equal(isValidSettings({ ...settings, signatoryName: 5 }), false);
});
