const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { DATASET_KEYS, SCHEMA_VERSION, openDatabase } = require('../server/database.cjs');

const testAccount = (id, extra = {}) => ({ id, username: id, name: 'Tài khoản ' + id, role: 'admin',
  active: true, mustChangePassword: false, sessionVersion: 'v-' + id, proof: { salt: 'aa', hash: 'bb' }, ...extra });

test('SQLite giữ tài khoản và nhật ký khi xóa dữ liệu nghiệp vụ', () => {
  const database = openDatabase(':memory:');
  try {
    const accounts = [testAccount('qa-admin')];
    assert.equal(database.writeAccounts([], accounts), true);
    assert.equal(database.writeAccounts([], [testAccount('stale-admin')]), false);
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

const sampleSale = { rowNumber: 2, date: '2026-01-01', documentNumber: 'BH001', invoiceNumber: '1',
  customerName: 'A', productName: 'B', unit: 'Hộp', quantity: 1, unitPrice: 100, salesAmount: 100, paymentTotal: 110 };

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

test('v16 bỏ số dư đầu kỳ nhập tay và cất nguyên văn số dư cũ', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cong-no-sqlite-v16-'));
  const databasePath = path.join(directory, 'test.sqlite');
  const time = '2026-01-01T00:00:00.000Z';
  const customer = { id: 'c-1', misaCode: 'KH1', name: 'Khách 1', group: 'unknown', taxCode: '', province: '',
    address: '', status: 'active', createdAt: time, updatedAt: time, assignments: [] };
  try {
    const created = openDatabase(databasePath);
    created.writeDataset(DATASET_KEYS.customers, 2, [customer, { ...customer, id: 'c-2', misaCode: 'KH2' }]);
    created.close();
    // Giả lập kho của bản 0.1.4 (schema 15) có số dư đầu kỳ cho một khách.
    const raw = new DatabaseSync(databasePath);
    raw.exec('ALTER TABLE customers ADD COLUMN opening_balance_json TEXT; PRAGMA user_version = 15;');
    raw.prepare("UPDATE customers SET opening_balance_json = ? WHERE id = 'c-1'")
      .run(JSON.stringify({ amount: 900, date: '2026-01-06' }));
    raw.close();

    const upgraded = openDatabase(databasePath);
    assert.equal(upgraded.status().schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(upgraded.readDataset(DATASET_KEYS.customers).data.map(({ id, openingBalance }) => [id, openingBalance]),
      [['c-1', undefined], ['c-2', undefined]]);
    upgraded.writeDataset(DATASET_KEYS.customers, 2, [customer]);
    upgraded.close();

    const check = new DatabaseSync(databasePath, { readOnly: true });
    assert.equal(check.prepare('PRAGMA table_info(customers)').all().some(({ name }) => name === 'opening_balance_json'), false);
    assert.deepEqual(check.prepare('SELECT customer_id, misa_code, payload_json FROM legacy_opening_balances').all()
      .map((row) => ({ ...row })), [{ customer_id: 'c-1', misa_code: 'KH1', payload_json: '{"amount":900,"date":"2026-01-06"}' }]);
    check.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('danh mục đọc ra được dùng lại đến khi có thay đổi, kể cả từ kết nối khác', () => withDatabase((database, databasePath) => {
  const time = '2026-01-01T00:00:00.000Z';
  const customer = (id, name) => ({ id, misaCode: id.toUpperCase(), name, group: 'unknown', taxCode: '', province: '',
    address: '', status: 'active', createdAt: time, updatedAt: time, assignments: [{ id: 'a-' + id, employeeId: 'e-1',
      employeeName: 'NV', province: '', source: 'direct', effectiveFrom: '2026-01-01', effectiveTo: null }] });
  database.writeDataset(DATASET_KEYS.customers, 2, [customer('c-1', 'Khách 1')]);
  const first = database.readDataset(DATASET_KEYS.customers);
  assert.equal(database.readDataset(DATASET_KEYS.customers), first);
  assert.ok(Object.isFrozen(first.data[0]) && Object.isFrozen(first.data[0].assignments[0]));
  // Ghi ngoài danh mục (nhật ký) vẫn làm bản nhớ hết hiệu lực: an toàn hơn là bỏ sót.
  database.appendActivity({ id: 'event-cache', time, actorId: 'a', actorName: 'A', category: 'data', action: 'x', detail: '' });
  const afterActivity = database.readDataset(DATASET_KEYS.customers);
  assert.notEqual(afterActivity, first);
  assert.deepEqual(afterActivity, first);

  database.writeDataset(DATASET_KEYS.customers, 2, [customer('c-1', 'Khách đổi tên')]);
  assert.equal(database.readDataset(DATASET_KEYS.customers).data[0].name, 'Khách đổi tên');

  // Giao dịch bị hủy: dữ liệu đọc trong giao dịch không được nhớ lại.
  assert.throws(() => database.changeDirectory((tx) => {
    tx.updateCustomer({ ...customer('c-1', 'Tên chưa lưu'), updatedAt: '2026-02-01T00:00:00.000Z' });
    assert.equal(database.readDataset(DATASET_KEYS.customers).data[0].name, 'Tên chưa lưu');
    throw new Error('hủy');
  }), /hủy/);
  assert.equal(database.readDataset(DATASET_KEYS.customers).data[0].name, 'Khách đổi tên');

  const other = new DatabaseSync(databasePath);
  other.prepare("UPDATE customers SET name = 'Kết nối khác' WHERE id = 'c-1'").run();
  other.close();
  assert.equal(database.readDataset(DATASET_KEYS.customers).data[0].name, 'Kết nối khác');
}));

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
  assert.equal(database.writeAccounts([], [testAccount('account-1')]), true);
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
    receipts: [{ id: 'receipt', number: 'PT-1', customerId: 'c1', customerName: 'A', customerCode: 'A',
      date: '2026-01-01', amount: 100, reference: '', createdAt: time }],
    allocations: [{ id: 'a1', receiptId: 'receipt', date: '2026-01-01', createdAt: time, lines: [] }],
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
  const first = { fileName: 'first.xlsx', importedAt: 'first', rows: [sampleSale] };
  const second = { fileName: 'second.xlsx', importedAt: 'second', rows: [...first.rows, { ...sampleSale, rowNumber: 3 }] };
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
  const salesBook = { fileName: 'legacy.xlsx', importedAt: timestamp, rows: [sampleSale] };
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

function schemaV12(sqlite) {
  sqlite.exec(`
    DROP TABLE reversals;
    DROP TABLE allocation_lines;
    DROP TABLE allocations;
    DROP TABLE receipts;
    DROP TABLE receipt_ledger;
    DROP TABLE sales_lines;
    DROP TABLE sales_book;
    PRAGMA user_version = 12;
  `);
}

test('v13 moves both legacy books, verifies amounts and keeps the v12 backup intact', () => withDatabase((database, location) => {
  const fixtures = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, 'fixtures/golden-backup.json'), 'utf8'));
  const { salesBook, ledger } = fixtures.data;
  const raw = new DatabaseSync(location);
  try {
    schemaV12(raw);
    const insert = raw.prepare('INSERT INTO app_datasets VALUES (?, 1, ?, ?)');
    insert.run('cong-no.misa-sales-book.v1', JSON.stringify(salesBook), fixtures.createdAt);
    insert.run('cong-no.receipt-ledger.v1', JSON.stringify(ledger), fixtures.createdAt);
  } finally { raw.close(); }
  const upgraded = openDatabase(location);
  try {
    assert.equal(upgraded.status().schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(upgraded.exportBusinessBackup().data.salesBook, salesBook);
    assert.deepEqual(upgraded.exportBusinessBackup().data.ledger, ledger);
    const sql = new DatabaseSync(location, { readOnly: true });
    try {
      assert.equal(sql.prepare('SELECT COUNT(*) n FROM app_datasets').get().n, 0);
      assert.equal(sql.prepare('SELECT SUM(payment_total) n FROM sales_lines').get().n,
        salesBook.rows.reduce((sum, row) => sum + (row.paymentTotal ?? 0), 0));
      assert.equal(sql.prepare('SELECT SUM(amount) n FROM receipts').get().n,
        ledger.receipts.reduce((sum, row) => sum + row.amount, 0));
      assert.equal(sql.prepare('SELECT SUM(amount) n FROM allocation_lines').get().n,
        ledger.allocations.flatMap((item) => item.lines).reduce((sum, row) => sum + row.amount, 0));
    } finally { sql.close(); }
    const snapshotName = fs.readdirSync(require('node:path').dirname(location)).find((name) => name.includes('truoc-nang-cap-v12'));
    assert.ok(snapshotName);
    const snapshotPath = require('node:path').join(require('node:path').dirname(location), snapshotName);
    const bytes = fs.readFileSync(snapshotPath);
    const old = openDatabase(snapshotPath, { readOnly: true });
    try { assert.deepEqual(old.exportBusinessBackup().data.ledger, ledger); } finally { old.close(); }
    assert.deepEqual(fs.readFileSync(snapshotPath), bytes);
  } finally { upgraded.close(); }
}));

test('v13 nâng cấp sổ có trường lạ của bản cũ và cất lại nguyên văn bản JSON', () => withDatabase((database, location) => {
  const raw = new DatabaseSync(location);
  const sales = { fileName: 'source.xlsx', importedAt: '2026-01-01T00:00:00.000Z',
    rows: [{ ...sampleSale, unknownLegacyAmount: 123 }] };
  schemaV12(raw);
  raw.prepare('INSERT INTO app_datasets VALUES (?, 1, ?, ?)').run('cong-no.misa-sales-book.v1', JSON.stringify(sales), sales.importedAt);
  raw.close();
  const upgraded = openDatabase(location);
  try {
    const { unknownLegacyAmount: _extra, ...line } = sales.rows[0];
    assert.deepEqual(upgraded.readDataset('cong-no.misa-sales-book.v1').data.rows, [line]);
  } finally { upgraded.close(); }
  const check = new DatabaseSync(location, { readOnly: true });
  try {
    assert.equal(check.prepare('PRAGMA user_version').get().user_version, SCHEMA_VERSION);
    assert.deepEqual(JSON.parse(check.prepare('SELECT payload_json FROM legacy_books').get().payload_json), sales);
  } finally { check.close(); }
}));

test('v13 chuẩn hóa mã hóa đơn kiểu cũ của phân bổ và cất bản gốc', () => withDatabase((database, location) => {
  const time = '2026-01-02T00:00:00.000Z';
  const invoice = { id: JSON.stringify(['KH001', 'BH001']), customerId: 'c1', invoiceNumber: '1', invoiceSeries: '',
    documentNumber: 'BH001', sourceFile: 'a.xlsx', date: '2026-01-01', amount: 110 };
  const ledger = { revision: 'r1',
    receipts: [{ id: 'r', number: 'PT-1', customerId: 'c1', customerName: 'A', customerCode: 'KH001', reference: '',
      date: '2026-01-02', createdAt: time, amount: 50 }],
    allocations: [{ id: 'a', receiptId: 'r', date: '2026-01-02', createdAt: time, lines: [{ amount: 50, invoice }] }] };
  const raw = new DatabaseSync(location);
  schemaV12(raw);
  raw.prepare('INSERT INTO app_datasets VALUES (?, 1, ?, ?)').run('cong-no.receipt-ledger.v1', JSON.stringify(ledger), time);
  raw.close();
  const upgraded = openDatabase(location);
  try {
    const stored = upgraded.readDataset('cong-no.receipt-ledger.v1').data;
    assert.equal(stored.allocations[0].lines[0].invoice.id, JSON.stringify(['KH001', 'BH001', '2026']));
    assert.equal(stored.allocations[0].lines[0].amount, 50);
  } finally { upgraded.close(); }
  const check = new DatabaseSync(location, { readOnly: true });
  try {
    assert.deepEqual(JSON.parse(check.prepare('SELECT payload_json FROM legacy_books').get().payload_json), ledger);
  } finally { check.close(); }
}));

test('v13 hủy nâng cấp khi số tiền bị lệch và không tạo thêm bản sao khi mở lại', () => withDatabase((database, location) => {
  const raw = new DatabaseSync(location);
  const sales = { fileName: 'source.xlsx', importedAt: '2026-01-01T00:00:00.000Z', rows: [sampleSale] };
  schemaV12(raw);
  raw.prepare('INSERT INTO app_datasets VALUES (?, 1, ?, ?)').run('cong-no.misa-sales-book.v1', JSON.stringify(sales), sales.importedAt);
  // Giả lập bảng mới ghi sai số tiền để kiểm tra bước so số tiền.
  raw.exec(`CREATE TABLE sales_lines (
      position INTEGER PRIMARY KEY, row_number INTEGER NOT NULL, date TEXT NOT NULL,
      document_number TEXT NOT NULL, invoice_number TEXT NOT NULL, customer_name TEXT NOT NULL,
      customer_code TEXT, product_name TEXT NOT NULL, unit TEXT NOT NULL, quantity REAL,
      unit_price REAL, sales_amount REAL, payment_total REAL, origin_json TEXT, source_json TEXT);
    CREATE TRIGGER wrong_money AFTER INSERT ON sales_lines BEGIN
      UPDATE sales_lines SET payment_total = payment_total + 1 WHERE position = NEW.position; END;`);
  raw.close();
  assert.throws(() => openDatabase(location), /bị lệch.*Bản sao trước khi nâng cấp/s);
  assert.throws(() => openDatabase(location), /bị lệch/);
  const snapshots = fs.readdirSync(path.dirname(location)).filter((name) => name.includes('.truoc-nang-cap-v12-'));
  assert.equal(snapshots.length, 1);
  const unchanged = new DatabaseSync(location, { readOnly: true });
  try {
    assert.equal(unchanged.prepare('PRAGMA user_version').get().user_version, 12);
    assert.deepEqual(JSON.parse(unchanged.prepare('SELECT payload_json FROM app_datasets').get().payload_json), sales);
    assert.equal(unchanged.prepare('SELECT COUNT(*) AS n FROM sales_lines').get().n, 0);
  } finally { unchanged.close(); }
}));

test('v14 chuyển tài khoản từ khối JSON sang bảng users/user_pages, giữ trường lạ', () => withDatabase((database, location) => {
  const accounts = [testAccount('admin'),
    testAccount('ketoan', { role: 'editor', pages: ['dashboard', 'payments'], linkedNote: 'giữ nguyên' }),
    testAccount('xem', { role: 'viewer', active: false })];
  const raw = new DatabaseSync(location);
  raw.exec('DELETE FROM user_pages; DELETE FROM users; PRAGMA user_version = 13;');
  raw.prepare('INSERT INTO app_datasets VALUES (?, 1, ?, ?)').run('cong-no.accounts.v1', JSON.stringify(accounts), '2026-01-01T00:00:00.000Z');
  raw.close();
  const upgraded = openDatabase(location);
  try {
    assert.deepEqual(upgraded.readDataset('cong-no.accounts.v1').data, accounts);
  } finally { upgraded.close(); }
  const check = new DatabaseSync(location, { readOnly: true });
  try {
    assert.equal(check.prepare('PRAGMA user_version').get().user_version, SCHEMA_VERSION);
    assert.equal(check.prepare("SELECT COUNT(*) AS n FROM app_datasets WHERE dataset_key = 'cong-no.accounts.v1'").get().n, 0);
    assert.deepEqual(check.prepare("SELECT page FROM user_pages WHERE user_id = 'ketoan' ORDER BY position").all().map(({ page }) => page),
      ['dashboard', 'payments']);
  } finally { check.close(); }
}));

test('lưu lại tài khoản giữ phiên của tài khoản khác và đổi được tên đăng nhập hai tài khoản cho nhau', () => withDatabase((database) => {
  const a = testAccount('a');
  const b = testAccount('b');
  assert.equal(database.writeAccounts([], [a, b]), true);
  database.saveSession('token-a', 'a', a.sessionVersion, Date.now() + 60_000);
  const swapped = [{ ...a, username: 'b' }, { ...b, username: 'a' }];
  assert.equal(database.writeAccounts([a, b], swapped), true);
  assert.deepEqual(database.readDataset('cong-no.accounts.v1').data, swapped);
  assert.equal(database.findSession('token-a').id, 'a');
  // Xóa tài khoản thì xóa luôn phiên của tài khoản đó.
  assert.equal(database.writeAccounts(swapped, [swapped[1]]), true);
  assert.equal(database.findSession('token-a'), undefined);
}));
