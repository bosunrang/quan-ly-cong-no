const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { DATASET_KEYS, openDatabase } = require('../electron/database.cjs');

function withDatabase(action) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mkt-sqlite-test-'));
  const databasePath = path.join(directory, 'test.sqlite');
  const database = openDatabase(databasePath);
  try { action(database); }
  finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('SQLite lưu khách hàng theo các bảng quan hệ và đọc lại đúng cấu trúc', () => withDatabase((database) => {
  const customers = [{
    id: 'CUS-1', misaCode: 'KH-001', name: 'Đơn vị A', group: 'state', taxCode: '0101', province: 'Hà Nội', address: 'Địa chỉ', status: 'active',
    assignments: [{ id: 'ASN-1', employeeId: 'EMP-1', employeeName: 'Nguyễn An', province: 'Hà Nội', source: 'direct', effectiveFrom: '2026-01-01', effectiveTo: null }],
    recipients: [{ id: 'RCP-1', fullName: 'Trần Bình', position: 'Kế toán', phone: '0901', effectiveFrom: '2026-01-01', effectiveTo: null, isPrimary: true, active: true }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }];
  assert.equal(database.writeDataset(DATASET_KEYS.customers, 2, customers), true);
  assert.deepEqual(database.readDataset(DATASET_KEYS.customers), { version: 2, data: customers });
}));

test('SQLite xóa dây chuyền chính sách cũ khi ghi lại danh mục sản phẩm', () => withDatabase((database) => {
  const catalog = {
    products: [{ id: 'PRD-1', code: 'SP-1', name: 'Sản phẩm A', group: 'Vật tư', unit: 'Hộp', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    policies: [{ id: 'POL-1', productId: 'PRD-1', customerId: 'CUS-1', recipientAllocations: [{ recipientId: 'RCP-1', amount: 10000 }], calculationType: 'fixed', value: 10000, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'active', note: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
  };
  database.writeDataset(DATASET_KEYS.products, 7, catalog);
  database.writeDataset(DATASET_KEYS.products, 7, { products: catalog.products, policies: [] });
  assert.deepEqual(database.readDataset(DATASET_KEYS.products), { version: 7, data: { products: catalog.products, policies: [] } });
}));

test('SQLite tìm kiếm, lọc và phân trang sản phẩm mà không đọc toàn bộ danh mục', () => withDatabase((database) => {
  const products = Array.from({ length: 30 }, (_, index) => ({
    id: `PRD-${index + 1}`,
    code: `SP-${String(index + 1).padStart(3, '0')}`,
    name: index === 26 ? 'HÓA CHẤT đặc biệt' : `Sản phẩm ${index + 1}`,
    group: index % 2 ? 'Vật tư' : 'Hóa chất',
    unit: 'Hộp',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }));
  const policies = [
    { id: 'POL-1', productId: 'PRD-1', customerId: 'CUS-1', recipientAllocations: [{ recipientId: 'RCP-1', amount: 10000, retainedAmount: 2000 }], calculationType: 'fixed', value: 10000, retainedAmount: 0, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'active', note: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'POL-2', productId: 'PRD-1', customerId: 'CUS-2', recipientAllocations: [], calculationType: 'fixed', value: 5000, retainedAmount: 0, effectiveFrom: '2026-01-01', effectiveTo: '2026-09-01', status: 'active', note: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ];
  database.writeDataset(DATASET_KEYS.products, 7, { products, policies });

  const page = database.queryProducts({ query: '', group: 'all', page: 2, pageSize: 25, today: '2026-08-26', soonDate: '2026-09-25', activeCustomerCount: 3 });
  assert.equal(page.products.length, 5);
  assert.equal(page.filteredCount, 30);
  assert.equal(page.pageCount, 2);
  assert.equal(page.firstVisible, 26);
  assert.equal(page.summary.currentPolicies, 2);
  assert.equal(page.summary.currentCustomers, 2);
  assert.equal(page.summary.missingAssignments, 88);
  assert.equal(page.summary.expiringSoon, 1);

  const search = database.queryProducts({ query: 'hóa chất', group: 'Hóa chất', page: 1, pageSize: 25, today: '2026-08-26', soonDate: '2026-09-25', activeCustomerCount: 3 });
  assert.deepEqual(search.products.map((product) => product.id), ['PRD-27']);
  assert.equal(search.coverageByProduct['PRD-27'], 0);
  assert.deepEqual(database.readProductDetail('PRD-1'), { products: [products[0]], policies });
}));

test('SQLite lưu dataset chưa chuẩn hóa bằng JSON có phiên bản', () => withDatabase((database) => {
  const data = { periodLabel: 'Quý II/2026', entries: [{ id: 'REC-1' }] };
  assert.equal(database.writeDataset('mkt-cost.reconciliation.v2', 2, data), true);
  assert.deepEqual(database.readDataset('mkt-cost.reconciliation.v2'), { version: 2, data });
  assert.deepEqual(database.status(), { backend: 'sqlite', schemaVersion: 6 });
}));

test('SQLite lưu và phân trang chi tiết MISA theo từng đơn vị', () => withDatabase((database) => {
  const rows = [
    { id: 'A:1', unitId: 'don vi a', rowNumber: 1, date: '2026-01-02', documentNumber: 'BH001', productCode: 'SP-001', description: 'Hóa chất A', unit: 'Hộp', quantity: 2, unitPrice: 100000, generalDescription: 'Bán hàng', debtAccount: '131', contraAccount: '511', debit: 200000, credit: null, balanceDebit: 200000, balanceCredit: null, documentKind: 'sale' },
    { id: 'A:2', unitId: 'don vi a', rowNumber: 2, date: '2026-01-03', documentNumber: 'NTTK01', description: 'Thu tiền', unit: '', quantity: null, unitPrice: null, generalDescription: 'Thu tiền khách hàng', debtAccount: '131', contraAccount: '112', debit: null, credit: 100000, balanceDebit: 100000, balanceCredit: null, documentKind: 'receipt' },
    { id: 'B:3', unitId: 'don vi b', rowNumber: 3, date: null, documentNumber: '', description: 'Số dư đầu kỳ', unit: '', quantity: null, unitPrice: null, generalDescription: '', debtAccount: '', contraAccount: '', debit: null, credit: null, balanceDebit: 50000, balanceCredit: null, documentKind: 'opening' },
  ];
  assert.equal(database.writeMisaDetails(1, rows), true);
  const result = database.queryMisaDetails({ unitId: 'don vi a', query: 'hoa chat', documentKind: 'all', page: 1, pageSize: 25 });
  assert.equal(result.filteredCount, 1);
  assert.equal(result.rows[0].documentNumber, 'BH001');
  assert.equal(result.rows[0].unitPrice, 100000);
  assert.equal(result.rows[0].productCode, 'SP-001');
  assert.equal(result.rows[0].balanceDebit, 200000);
  assert.equal(result.rows[0].balanceCredit, null);
  assert.deepEqual(database.queryMisaRange({ dateFrom: '2026-01-01', dateTo: '2026-01-02' }).map((row) => row.id), ['A:1']);
  assert.equal(database.queryMisaDetails({ unitId: 'don vi b', query: '', documentKind: 'opening', page: 1, pageSize: 25 }).rows.length, 0);
}));

test('SQLite nâng schema 1 lên schema mới nhất và tạo dữ liệu tìm kiếm', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mkt-sqlite-migration-'));
  const databasePath = path.join(directory, 'schema-1.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE dataset_versions (dataset_key TEXT PRIMARY KEY, version INTEGER NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE products (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, product_group TEXT NOT NULL, unit TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE product_policies (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, customer_id TEXT NOT NULL, calculation_type TEXT NOT NULL, value REAL NOT NULL, effective_from TEXT NOT NULL, effective_to TEXT, status TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE policy_recipient_allocations (policy_id TEXT NOT NULL, recipient_id TEXT NOT NULL, amount REAL NOT NULL, sort_order INTEGER NOT NULL, PRIMARY KEY (policy_id, recipient_id));
    INSERT INTO dataset_versions VALUES ('mkt-cost.products.v7', 7, '2026-01-01T00:00:00.000Z');
    INSERT INTO products VALUES ('PRD-OLD', 'SP-OLD', 'HÓA CHẤT CŨ', 'Hóa chất', 'Hộp', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 0);
    PRAGMA user_version = 1;
  `);
  legacy.close();

  const database = openDatabase(databasePath);
  try {
    assert.deepEqual(database.status(), { backend: 'sqlite', schemaVersion: 6 });
    const result = database.queryProducts({ query: 'hóa chất cũ', group: 'all', page: 1, pageSize: 25, today: '2026-08-26', soonDate: '2026-09-25', activeCustomerCount: 0 });
    assert.deepEqual(result.products.map((product) => product.id), ['PRD-OLD']);
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
