const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { DATASET_KEYS, SCHEMA_VERSION, openDatabase } = require('../electron/database.cjs');

test('SQLite giữ tài khoản và nhật ký khi xóa dữ liệu nghiệp vụ', () => {
  const database = openDatabase(':memory:');
  try {
    const accounts = [{ id: 'qa-admin' }];
    assert.equal(database.writeAccounts([], accounts), true);
    assert.equal(database.writeAccounts([], [{ id: 'stale-admin' }]), false);
    const entry = { id: 'event-1', time: '2026-06-01T01:00:00.000Z', actorId: 'qa-admin',
      actorName: 'Tài khoản thử', category: 'data', action: 'Nhập dữ liệu', detail: '' };
    assert.equal(database.appendActivity(entry), true);
    assert.equal(database.writeDataset('cong-no.qa-business.v1', 1, { test: true }), true);
    assert.equal(database.clearAllData(), true);
    assert.deepEqual(database.readDataset('cong-no.accounts.v1'), { version: 1, data: accounts });
    assert.equal(database.readDataset('cong-no.qa-business.v1'), undefined);
    assert.deepEqual(database.readActivities(), [entry]);
  } finally {
    database.close();
  }
});

function withDatabase(action) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cong-no-sqlite-test-'));
  const databasePath = path.join(directory, 'test.sqlite');
  const database = openDatabase(databasePath);
  try { action(database, databasePath); }
  finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('SQLite tạo bản sao trước khi nâng cấp schema và nâng cấp lại an toàn', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cong-no-sqlite-upgrade-'));
  const databasePath = path.join(directory, 'test.sqlite');
  try {
    openDatabase(databasePath).close();
    const raw = new DatabaseSync(databasePath);
    // Giả lập cơ sở dữ liệu bản trước: cột mới đã có nhưng phiên bản chưa được ghi.
    raw.exec(`PRAGMA user_version = ${SCHEMA_VERSION - 1};`);
    raw.close();
    const upgraded = openDatabase(databasePath);
    assert.deepEqual(upgraded.status(), { backend: 'sqlite', schemaVersion: SCHEMA_VERSION });
    upgraded.close();
    const snapshots = fs.readdirSync(directory)
      .filter((name) => name.startsWith(`test.sqlite.truoc-nang-cap-v${SCHEMA_VERSION - 1}-`));
    assert.equal(snapshots.length, 1);
    const copy = new DatabaseSync(path.join(directory, snapshots[0]), { readOnly: true });
    assert.equal(copy.prepare('PRAGMA user_version').get().user_version, SCHEMA_VERSION - 1);
    copy.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('SQLite đổi dấu thay đổi sau mỗi lần ghi sổ, kể cả ghi liên tiếp', () => withDatabase((database) => {
  const key = 'cong-no.misa-sales-book.v1';
  assert.equal(database.datasetStamp(key), null);
  const stamps = new Set();
  let expected = null;
  for (let index = 0; index < 5; index++) {
    const importedAt = `2026-11-0${index + 1}T00:00:00.000Z`;
    assert.equal(database.writeMisaSalesBook(expected, { fileName: 'a.xlsx', importedAt, rows: [] }), true);
    expected = importedAt;
    stamps.add(database.datasetStamp(key));
  }
  assert.equal(stamps.size, 5);
}));

test('SQLite lưu và gỡ liên kết tài khoản của nhân viên', () => withDatabase((database) => {
  const employee = {
    id: 'EMP-1', code: 'NV-1', name: 'Nhân viên', status: 'active',
    phone: '0901', email: 'employee@example.test', createdAt: '2026-01-01T00:00:00.000Z',
  };
  const key = DATASET_KEYS.employees;
  assert.equal(database.writeAccounts([], [{ id: 'account-1' }]), true);
  const linked = { ...employee, linkedAccountId: 'account-1' };
  database.writeDataset(key, 2, [linked]);
  assert.deepEqual(database.readDataset(key).data, [linked]);
  assert.throws(() => database.writeDataset(key, 2, [
    linked, { ...linked, id: 'EMP-2', code: 'NV-2' },
  ]), /đã liên kết/);
  assert.throws(() => database.writeDataset(key, 2, [
    { ...employee, linkedAccountId: 'unknown' },
  ]), /không còn tồn tại/);
  assert.deepEqual(database.readDataset(key).data, [linked]);
  database.writeDataset(key, 2, [employee]);
  assert.deepEqual(database.readDataset(key).data, [employee]);
}));

test('từ chối xóa riêng dữ liệu đang được sổ đối soát sử dụng', () => withDatabase((database) => {
  const time = '2026-01-01T00:00:00.000Z';
  const key = 'cong-no.receipt-ledger.v1';
  database.writeDataset(key, 1, {
    revision: 'original',
    receipts: [{ id: 'receipt' }],
    allocations: [{ receiptId: 'receipt' }],
  });
  database.writeDataset('cong-no.misa-sales-book.v1', 1, { fileName: 'misa.xlsx', importedAt: time, rows: [] });
  assert.throws(() => database.changeBusinessData({ type: 'delete', groups: ['salesBook'] }), /đối soát/);
  assert.throws(() => database.changeBusinessData({ type: 'delete', groups: ['customers'] }), /khoản thu/);
  assert.equal(database.readDataset(key).data.revision, 'original');
  assert.equal(database.changeBusinessData({ type: 'delete', groups: ['salesBook', 'ledger'] }), true);
  assert.equal(database.readDataset(key), undefined);
}));
test('SQLite lưu khách hàng theo các bảng quan hệ và đọc lại đúng cấu trúc', () => withDatabase((database) => {
  const customers = [{
    id: 'CUS-1', misaCode: 'KH-001', name: 'Đơn vị A', group: 'state', taxCode: '0101', province: 'Hà Nội', address: 'Địa chỉ', status: 'active',
    assignments: [{ id: 'ASN-1', employeeId: 'EMP-1', employeeName: 'Nguyễn An', province: 'Hà Nội', source: 'direct', effectiveFrom: '2026-01-01', effectiveTo: null }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }];
  assert.equal(database.writeDataset(DATASET_KEYS.customers, 2, customers), true);
  assert.deepEqual(database.readDataset(DATASET_KEYS.customers), { version: 2, data: customers });
}));

test('SQLite lưu dataset chưa chuẩn hóa bằng JSON có phiên bản', () => withDatabase((database) => {
  const data = { periodLabel: 'Quý II/2026', entries: [{ id: 'REC-1' }] };
  assert.equal(database.writeDataset('cong-no.reconciliation.v2', 2, data), true);
  assert.deepEqual(database.readDataset('cong-no.reconciliation.v2'), { version: 2, data });
  assert.deepEqual(database.status(), { backend: 'sqlite', schemaVersion: SCHEMA_VERSION });
}));

test('SQLite chỉ ghi đối soát khi phiên bản sổ thu và sổ bán hàng còn khớp', () => withDatabase((database, databasePath) => {
  const salesKey = 'cong-no.misa-sales-book.v1';
  const ledgerKey = 'cong-no.receipt-ledger.v1';
  const data = { revision: 'one', receipts: [], allocations: [] };
  database.writeDataset(salesKey, 1, { importedAt: 'first', rows: [] });
  const peer = openDatabase(databasePath);
  try {
    assert.equal(database.writeReceiptLedger('', data, 'first'), true);
    assert.equal(peer.writeReceiptLedger('', { ...data, revision: 'stale' }, 'first'), false);
    peer.writeDataset(salesKey, 1, { importedAt: 'second', rows: [] });
    assert.equal(database.writeReceiptLedger('one', { ...data, revision: 'two' }, 'first'), false);
    assert.deepEqual(peer.readDataset(ledgerKey), { version: 1, data });
    assert.equal(database.writeReceiptLedger('one', { ...data, revision: 'two' }, 'second'), true);
  } finally {
    peer.close();
  }
}));

test('SQLite từ chối lưu sổ bán hàng dựa trên bản xem trước cũ', () => withDatabase((database, databasePath) => {
  const key = 'cong-no.misa-sales-book.v1';
  const first = { fileName: 'first.xlsx', importedAt: 'first', rows: [{ rowNumber: 2 }] };
  const second = { fileName: 'second.xlsx', importedAt: 'second', rows: [...first.rows, { rowNumber: 3 }] };
  const peer = openDatabase(databasePath);
  try {
    assert.equal(database.writeMisaSalesBook(null, first), true);
    assert.equal(peer.writeMisaSalesBook('first', second), true);
    assert.equal(database.writeMisaSalesBook(null, first), false);
    assert.equal(database.writeMisaSalesBook('first', first), false);
    assert.deepEqual(database.readDataset(key), { version: 1, data: second });
  } finally {
    peer.close();
  }
}));

test('SQLite xóa sạch toàn bộ dữ liệu ứng dụng', () => withDatabase((database) => {
  database.writeDataset(DATASET_KEYS.employees, 2, [{
    id: 'EMP-1', code: 'NV-01', name: 'Nguyễn An', phone: '', email: '', status: 'active', createdAt: '2026-01-01T00:00:00.000Z',
  }]);
  database.writeDataset('cong-no.reconciliation.v2', 2, { entries: [{ id: 'REC-1' }] });
  database.writeMisaSalesBook(null, { fileName: 'a.xlsx', importedAt: '2026-01-01T00:00:00.000Z', rows: [] });

  const branding = { displayName: 'NAVIVA GROUP', tagline: 'Quản lý công nợ', logoDataUrl: 'data:image/png;base64,logo' };
  assert.equal(database.clearAllData(branding), true);
  assert.equal(database.readDataset(DATASET_KEYS.employees), undefined);
  assert.equal(database.readDataset('cong-no.reconciliation.v2'), undefined);
  assert.equal(database.readDataset('cong-no.misa-sales-book.v1'), undefined);
  assert.deepEqual(database.readDataset(DATASET_KEYS.settings), {
    version: 2,
    data: { companyName: '', companyAddress: '', ...branding },
  });
}));

test('SQLite lưu thông tin bên bán của biên bản trong cài đặt', () => withDatabase((database) => {
  const base = { companyName: 'Công ty A', companyAddress: 'Hà Nội', displayName: 'A', tagline: 'Công nợ', logoDataUrl: null };
  database.writeDataset(DATASET_KEYS.settings, 2, base);
  // Cài đặt cũ chưa có trường bên bán: không tự thêm giá trị rỗng.
  assert.deepEqual(database.readDataset(DATASET_KEYS.settings).data, base);
  const seller = {
    bankAccounts: ['001 tại VCB', '002 tại BIDV', '003 tại ACB', '004 bị bỏ'],
    accountingContact: 'Kế toán 0909',
    signatoryName: 'NGUYỄN VĂN A',
    signatoryTitle: 'Giám đốc',
  };
  database.writeDataset(DATASET_KEYS.settings, 2, { ...base, ...seller });
  assert.deepEqual(database.readDataset(DATASET_KEYS.settings).data, {
    ...base, ...seller, bankAccounts: seller.bankAccounts.slice(0, 3),
  });
}));

test('SQLite nâng schema 1 lên schema mới nhất và bỏ bảng của app chiết khấu cũ', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cong-no-sqlite-migration-'));
  const databasePath = path.join(directory, 'schema-1.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE dataset_versions (dataset_key TEXT PRIMARY KEY, version INTEGER NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE app_datasets (dataset_key TEXT PRIMARY KEY, version INTEGER NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE customers (id TEXT PRIMARY KEY, misa_code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, customer_group TEXT NOT NULL, tax_code TEXT NOT NULL, province TEXT NOT NULL, address TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sort_order INTEGER NOT NULL);
    CREATE TABLE customer_recipients (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, full_name TEXT NOT NULL);
    CREATE TABLE sales_employees (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, sort_order INTEGER NOT NULL);
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
    assert.deepEqual(database.status(), { backend: 'sqlite', schemaVersion: SCHEMA_VERSION });
  } finally {
    database.close();
  }
  const raw = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(({ name }) => name);
    for (const table of ['products', 'product_policies', 'policy_recipient_allocations', 'misa_details', 'customer_recipients'])
      assert.equal(tables.includes(table), false, table);
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM dataset_versions WHERE dataset_key LIKE 'mkt-cost.%'").get().n, 0);
  } finally {
    raw.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('nâng từ schema 6 của app cũ: đổi khóa sang cong-no, giữ khách hàng, nhân viên và sổ bán hàng', () => withDatabase((database, databasePath) => {
  const timestamp = '2026-01-01T00:00:00.000Z';
  const employee = { id: 'EMP-1', code: 'NV-1', name: 'Nhân viên', phone: '', email: '', status: 'active', createdAt: timestamp };
  const assignment = { id: 'ASN-1', employeeId: employee.id, employeeName: employee.name, province: 'Hà Nội', source: 'direct', effectiveFrom: '2026-01-01', effectiveTo: null };
  const customer = { id: 'CUS-1', misaCode: 'KH-001', name: 'Khách hàng', group: 'state', taxCode: '0101', province: assignment.province, address: 'Địa chỉ', status: 'active', assignments: [assignment], createdAt: timestamp, updatedAt: timestamp };
  const salesBook = { rows: [{ documentNumber: 'BH001' }] };
  const misaSummary = { units: [{ customerCode: customer.misaCode }] };
  database.writeDataset(DATASET_KEYS.customers, 2, [customer]);
  database.writeDataset(DATASET_KEYS.employees, 2, [employee]);
  database.writeDataset('mkt-cost.reconciliation.v1', 1, { entries: ['old'] });
  database.writeDataset('mkt-cost.reconciliation.v2', 2, { entries: ['old'] });
  database.writeDataset('mkt-cost.misa-sales-book.v1', 1, salesBook);
  database.writeDataset('mkt-cost.misa-summary.v5', 5, misaSummary);

  const legacy = new DatabaseSync(databasePath);
  // Dựng lại tệp như bản cũ: khóa mkt-cost.*, còn bảng chiết khấu và người nhận.
  legacy.exec(`
    DROP INDEX sales_employees_linked_account;
    ALTER TABLE sales_employees DROP COLUMN linked_account_id;
    UPDATE dataset_versions SET dataset_key = replace(dataset_key, 'cong-no.', 'mkt-cost.');
    UPDATE app_datasets SET dataset_key = replace(dataset_key, 'cong-no.', 'mkt-cost.');
    CREATE TABLE customer_recipients (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, full_name TEXT NOT NULL);
    INSERT INTO customer_recipients VALUES ('RCP-1', 'CUS-1', 'Người nhận');
    CREATE TABLE products (id TEXT PRIMARY KEY);
    CREATE TABLE product_policies (id TEXT PRIMARY KEY);
    CREATE TABLE policy_recipient_allocations (policy_id TEXT NOT NULL, recipient_id TEXT NOT NULL);
    CREATE TABLE misa_details (id TEXT PRIMARY KEY);
    PRAGMA user_version = 6;
  `);
  legacy.close();
  const upgraded = openDatabase(databasePath);
  try {
    assert.deepEqual(upgraded.status(), { backend: 'sqlite', schemaVersion: SCHEMA_VERSION });
    assert.deepEqual(upgraded.readDataset(DATASET_KEYS.customers), { version: 2, data: [customer] });
    const added = { ...customer, id: 'CUS-NEW', misaCode: 'MISA-NEW', group: 'unknown', assignments: [] };
    upgraded.writeDataset(DATASET_KEYS.customers, 2, [customer, added]);
    assert.deepEqual(upgraded.readDataset(DATASET_KEYS.customers), { version: 2, data: [customer, added] });
    assert.deepEqual(upgraded.readDataset(DATASET_KEYS.employees), { version: 2, data: [employee] });
    assert.deepEqual(upgraded.readDataset('cong-no.misa-sales-book.v1'), { version: 1, data: salesBook });
    // Dữ liệu chỉ của app cũ bị bỏ hẳn.
    for (const key of ['mkt-cost.reconciliation.v1', 'mkt-cost.reconciliation.v2', 'mkt-cost.misa-summary.v5', 'mkt-cost.misa-sales-book.v1'])
      assert.equal(upgraded.readDataset(key), undefined, key);
  } finally {
    upgraded.close();
  }
}));

test('đọc bản sao lưu SQLite cũ (khóa mkt-cost) mà không sửa tệp sao lưu', () => withDatabase((database, databasePath) => {
  const customer = { id: 'CUS-1', misaCode: 'KH-001', name: 'Khách hàng', group: 'state', taxCode: '', province: 'Hà Nội', address: '', status: 'active', assignments: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  const salesBook = { fileName: 'a.xlsx', importedAt: '2026-01-02T00:00:00.000Z', rows: [] };
  database.writeDataset(DATASET_KEYS.customers, 2, [customer]);
  database.writeMisaSalesBook(null, salesBook);
  const snapshot = `${databasePath}.v11.sqlite`;
  const raw = new DatabaseSync(databasePath);
  raw.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
  raw.close();
  const old = new DatabaseSync(snapshot);
  old.exec(`
    UPDATE dataset_versions SET dataset_key = replace(dataset_key, 'cong-no.', 'mkt-cost.');
    UPDATE app_datasets SET dataset_key = replace(dataset_key, 'cong-no.', 'mkt-cost.');
    PRAGMA user_version = 11;
  `);
  old.close();
  const temporary = () => fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('cong-no-sao-luu-')).length;
  const before = temporary();
  const saved = openDatabase(snapshot, { readOnly: true });
  try {
    const backup = saved.exportBusinessBackup('kiem-thu');
    assert.deepEqual(backup.data.customers, [customer]);
    assert.equal(backup.data.salesBook.fileName, salesBook.fileName);
  } finally {
    saved.close();
  }
  assert.equal(temporary(), before);
  const untouched = new DatabaseSync(snapshot, { readOnly: true });
  assert.equal(untouched.prepare('PRAGMA user_version').get().user_version, 11);
  untouched.close();
}));
