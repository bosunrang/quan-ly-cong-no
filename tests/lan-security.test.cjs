const assert = require('node:assert/strict');
const test = require('node:test');
const { openDatabase } = require('../electron/database.cjs');
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
