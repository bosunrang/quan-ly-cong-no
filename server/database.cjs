const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { deleteBusinessGroups, makeBusinessBackup, restoreBusinessData } = require('../src/domain/settings/business-data.rules.mjs');

const books = require('./books.cjs');
const accountStore = require('./account-store.cjs');
const SCHEMA_VERSION = 14;
const DATASET_KEYS = {
  customers: 'cong-no.customers.v2',
  employees: 'cong-no.sales-employees.v2',
  settings: 'cong-no.settings.v2',
};

function snapshotBeforeUpgrade(database, databasePath, currentVersion) {
  if (!databasePath || databasePath === ':memory:' || currentVersion < 1 || currentVersion >= SCHEMA_VERSION) return;
  const directory = path.dirname(databasePath);
  const prefix = `${path.basename(databasePath)}.truoc-nang-cap-v${currentVersion}-`;
  // Nâng cấp lỗi rồi mở lại nhiều lần thì dùng lại bản sao cũ nếu tệp dữ liệu chưa đổi từ đó,
  // để không lấp đầy ổ đĩa bằng các bản sao giống hệt nhau.
  const changedAt = Math.max(...['', '-wal'].map((suffix) => {
    try { return fs.statSync(databasePath + suffix).mtimeMs; } catch { return 0; }
  }));
  const previous = fs.readdirSync(directory)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.sqlite'))
    .map((name) => path.join(directory, name))
    .find((file) => fs.statSync(file).mtimeMs >= changedAt);
  if (previous) return previous;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = `${databasePath}.truoc-nang-cap-v${currentVersion}-${stamp}.sqlite`;
  // Bản sao nhất quán (gồm cả WAL) để có thể quay lại nếu nâng cấp gặp sự cố.
  database.prepare('VACUUM INTO ?').run(target);
  return target;
}

function migrateSchema(database, databasePath, { snapshot = true } = {}) {
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  const row = database.prepare('PRAGMA user_version').get();
  const currentVersion = Number(row?.user_version ?? 0);
  if (currentVersion > SCHEMA_VERSION) throw new Error(`Cơ sở dữ liệu phiên bản ${currentVersion} mới hơn ứng dụng.`);
  const snapshotPath = snapshot ? snapshotBeforeUpgrade(database, databasePath, currentVersion) : undefined;
  try {
    upgradeSchema(database, currentVersion);
  } catch (error) {
    // Mỗi bước nâng cấp chạy trong giao dịch riêng: bước lỗi đã được hoàn tác.
    if (snapshotPath) error.message += ` Bước nâng cấp lỗi đã được hoàn tác. Bản sao trước khi nâng cấp: ${snapshotPath}`;
    throw error;
  }
}

function upgradeSchema(database, currentVersion) {
  if (currentVersion < 1) {
    withTransaction(database, () => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS dataset_versions (
          dataset_key TEXT PRIMARY KEY,
          version INTEGER NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_datasets (
          dataset_key TEXT PRIMARY KEY,
          version INTEGER NOT NULL,
          payload_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS customers (
          id TEXT PRIMARY KEY,
          misa_code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          customer_group TEXT NOT NULL CHECK (customer_group IN ('state','private')),
          tax_code TEXT NOT NULL,
          province TEXT NOT NULL,
          address TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('active','paused')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          sort_order INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS customer_assignments (
          id TEXT PRIMARY KEY,
          customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          employee_id TEXT NOT NULL,
          employee_name TEXT NOT NULL,
          province TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source = 'direct'),
          effective_from TEXT NOT NULL,
          effective_to TEXT,
          sort_order INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS customer_recipients (
          id TEXT PRIMARY KEY,
          customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          full_name TEXT NOT NULL,
          position TEXT NOT NULL,
          phone TEXT NOT NULL,
          effective_from TEXT NOT NULL,
          effective_to TEXT,
          is_primary INTEGER NOT NULL CHECK (is_primary IN (0,1)),
          active INTEGER NOT NULL CHECK (active IN (0,1)),
          sort_order INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sales_employees (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('active','inactive')),
          created_at TEXT NOT NULL,
          sort_order INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          product_group TEXT NOT NULL,
          unit TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('active','paused')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          sort_order INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS product_policies (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          customer_id TEXT NOT NULL,
          calculation_type TEXT NOT NULL CHECK (calculation_type IN ('fixed','percent')),
          value REAL NOT NULL,
          effective_from TEXT NOT NULL,
          effective_to TEXT,
          status TEXT NOT NULL CHECK (status IN ('active','paused')),
          note TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          sort_order INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS policy_recipient_allocations (
          policy_id TEXT NOT NULL REFERENCES product_policies(id) ON DELETE CASCADE,
          recipient_id TEXT NOT NULL,
          amount REAL NOT NULL,
          sort_order INTEGER NOT NULL,
          PRIMARY KEY (policy_id, recipient_id)
        );
        CREATE TABLE IF NOT EXISTS app_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          company_name TEXT NOT NULL,
          company_address TEXT NOT NULL,
          display_name TEXT NOT NULL,
          tagline TEXT NOT NULL,
          logo_data_url TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_customer_assignments_customer ON customer_assignments(customer_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_customer_recipients_customer ON customer_recipients(customer_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_product_policies_product ON product_policies(product_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_product_policies_customer ON product_policies(customer_id);
        PRAGMA user_version = 1;
      `);
    });
  }
  if (currentVersion < 2) {
    withTransaction(database, () => {
      database.exec(`
        ALTER TABLE products ADD COLUMN search_text TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_products_group_sort ON products(product_group, sort_order);
        CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
        CREATE INDEX IF NOT EXISTS idx_product_policies_effective
          ON product_policies(status, effective_from, effective_to, product_id, customer_id);
      `);
      const updateSearch = database.prepare('UPDATE products SET search_text = ? WHERE id = ?');
      for (const product of database.prepare('SELECT id, code, name FROM products').all()) {
        updateSearch.run(`${product.code} ${product.name}`.toLocaleLowerCase('vi-VN'), product.id);
      }
      database.exec('PRAGMA user_version = 2;');
    });
  }
  if (currentVersion < 3) {
    withTransaction(database, () => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS misa_details (
          id TEXT PRIMARY KEY,
          unit_id TEXT NOT NULL,
          row_number INTEGER NOT NULL,
          transaction_date TEXT,
          document_number TEXT NOT NULL,
          description TEXT NOT NULL,
          unit TEXT NOT NULL,
          quantity REAL,
          unit_price REAL,
          general_description TEXT NOT NULL,
          debt_account TEXT NOT NULL,
          contra_account TEXT NOT NULL,
          debit REAL,
          credit REAL,
          balance_debit REAL,
          balance_credit REAL,
          document_kind TEXT NOT NULL CHECK (document_kind IN ('sale','receipt','adjustment','opening')),
          search_text TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_misa_details_unit_row ON misa_details(unit_id, row_number);
        CREATE INDEX IF NOT EXISTS idx_misa_details_unit_kind ON misa_details(unit_id, document_kind, row_number);
        PRAGMA user_version = 3;
      `);
    });
  }
  if (currentVersion < 4) {
    withTransaction(database, () => {
      database.exec(`
        ALTER TABLE misa_details ADD COLUMN product_code TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_misa_details_date_kind
          ON misa_details(transaction_date, document_kind, unit_id, row_number);
        PRAGMA user_version = 4;
      `);
    });
  }
  if (currentVersion < 5) {
    withTransaction(database, () => {
      database.exec(`
        ALTER TABLE product_policies ADD COLUMN retained_amount REAL NOT NULL DEFAULT 0;
        PRAGMA user_version = 5;
      `);
    });
  }
  if (currentVersion < 6) {
    withTransaction(database, () => {
      database.exec(`
        ALTER TABLE policy_recipient_allocations ADD COLUMN retained_amount REAL NOT NULL DEFAULT 0;
        PRAGMA user_version = 6;
      `);
    });
  }
  if (currentVersion < 7) {
    database.exec('PRAGMA secure_delete = ON;');
    withTransaction(database, () => {
      database.exec(`
        DELETE FROM policy_recipient_allocations;
        DELETE FROM product_policies;
        DELETE FROM customer_recipients;
        DELETE FROM app_datasets WHERE dataset_key IN ('mkt-cost.reconciliation.v1', 'mkt-cost.reconciliation.v2');
        DELETE FROM dataset_versions WHERE dataset_key IN ('mkt-cost.reconciliation.v1', 'mkt-cost.reconciliation.v2');
        PRAGMA user_version = 7;
      `);
    });
    database.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  }
  if (currentVersion < 8) {
    // Keep the child tables and their foreign keys while extending customer_group.
    database.exec('PRAGMA foreign_keys = OFF;');
    try {
      withTransaction(database, () => {
        database.exec(`
          CREATE TABLE customers_new (
            id TEXT PRIMARY KEY,
            misa_code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            customer_group TEXT NOT NULL CHECK (customer_group IN ('state','private','unknown')),
            tax_code TEXT NOT NULL,
            province TEXT NOT NULL,
            address TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('active','paused')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            sort_order INTEGER NOT NULL
          );
          INSERT INTO customers_new SELECT * FROM customers;
          DROP TABLE customers;
          ALTER TABLE customers_new RENAME TO customers;
          PRAGMA user_version = 8;
        `);
      });
    } finally {
      database.exec('PRAGMA foreign_keys = ON;');
    }
  }
  if (currentVersion < 9) {
    withTransaction(database, () => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS activity_log (
          id TEXT PRIMARY KEY,
          occurred_at TEXT NOT NULL,
          payload_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS activity_log_by_time ON activity_log(occurred_at DESC, id DESC);
        PRAGMA user_version = 9;
      `);
    });
  }
  if (currentVersion < 10) {
    withTransaction(database, () => {
      database.exec(`
        ALTER TABLE sales_employees ADD COLUMN linked_account_id TEXT;
        CREATE UNIQUE INDEX sales_employees_linked_account
          ON sales_employees(linked_account_id) WHERE linked_account_id IS NOT NULL;
        PRAGMA user_version = 10;
      `);
    });
  }
  if (currentVersion < 11) {
    withTransaction(database, () => {
      // Idempotent: an interrupted or partially created schema can be migrated again.
      database.exec(`
        CREATE TABLE IF NOT EXISTS app_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          company_name TEXT NOT NULL,
          company_address TEXT NOT NULL,
          display_name TEXT NOT NULL,
          tagline TEXT NOT NULL,
          logo_data_url TEXT
        );
      `);
      const columns = database.prepare('PRAGMA table_info(app_settings)').all();
      if (!columns.some(({ name }) => name === 'seller_json'))
        database.exec('ALTER TABLE app_settings ADD COLUMN seller_json TEXT;');
      database.exec('PRAGMA user_version = 11;');
    });
  }
  if (currentVersion < 12) {
    // Bỏ hẳn bảng của app chiết khấu cũ và đổi tiền tố khóa dữ liệu mkt-cost.* sang cong-no.*.
    withTransaction(database, () => {
      database.exec(`
        DROP TABLE IF EXISTS policy_recipient_allocations;
        DROP TABLE IF EXISTS product_policies;
        DROP TABLE IF EXISTS products;
        DROP TABLE IF EXISTS misa_details;
        DROP TABLE IF EXISTS customer_recipients;
      `);
      const keys = ['customers.v2', 'sales-employees.v2', 'settings.v2', 'accounts.v1', 'misa-sales-book.v1', 'receipt-ledger.v1'];
      for (const table of ['app_datasets', 'dataset_versions']) {
        const rename = database.prepare(`UPDATE ${table} SET dataset_key = ? WHERE dataset_key = ?`);
        for (const key of keys) rename.run(`cong-no.${key}`, `mkt-cost.${key}`);
        // Các khóa mkt-cost còn lại là dữ liệu app cũ (sản phẩm, tổng hợp MISA cũ...).
        database.exec(`DELETE FROM ${table} WHERE dataset_key LIKE 'mkt-cost.%'`);
      }
      database.exec('PRAGMA user_version = 12;');
    });
  }
  if (currentVersion < 13) {
    withTransaction(database, () => {
      books.migrateBooks(database);
      database.exec('PRAGMA user_version = 13;');
    });
  }
  if (currentVersion < 14) {
    // Tài khoản vào bảng users/user_pages; thêm bảng sessions để phiên còn sau khi khởi động lại.
    withTransaction(database, () => {
      accountStore.migrateAccounts(database);
      database.exec('PRAGMA user_version = 14;');
    });
  }
}

function withTransaction(database, action) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    // Keep the original failure even if SQLite already rolled the transaction back.
    try { database.exec('ROLLBACK'); } catch { /* no active transaction */ }
    throw error;
  }
}

function writeVersion(database, key, version) {
  database.prepare(`INSERT INTO dataset_versions (dataset_key, version, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(dataset_key) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at`)
    .run(key, version, new Date().toISOString());
}

function readVersion(database, key) {
  return database.prepare('SELECT version FROM dataset_versions WHERE dataset_key = ?').get(key);
}

function writeCustomers(database, version, customers) {
    database.exec('DELETE FROM customer_assignments; DELETE FROM customers;');
    const customerStatement = database.prepare('INSERT INTO customers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const assignmentStatement = database.prepare('INSERT INTO customer_assignments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    customers.forEach((customer, customerIndex) => {
      customerStatement.run(customer.id, customer.misaCode, customer.name, customer.group, customer.taxCode, customer.province, customer.address, customer.status, customer.createdAt, customer.updatedAt, customerIndex);
      customer.assignments.forEach((assignment, index) => assignmentStatement.run(assignment.id, customer.id, assignment.employeeId, assignment.employeeName, assignment.province, assignment.source, assignment.effectiveFrom, assignment.effectiveTo, index));
    });
    writeVersion(database, DATASET_KEYS.customers, version);
}

function groupByCustomer(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const values = grouped.get(row.customer_id) ?? [];
    values.push(row);
    grouped.set(row.customer_id, values);
  }
  return grouped;
}

function customerFromRow(customer, assignments) {
  return {
    id: customer.id, misaCode: customer.misa_code, name: customer.name, group: customer.customer_group,
    taxCode: customer.tax_code, province: customer.province, address: customer.address, status: customer.status,
    assignments: assignments.map((item) => ({ id: item.id, employeeId: item.employee_id, employeeName: item.employee_name,
      province: item.province, source: item.source, effectiveFrom: item.effective_from, effectiveTo: item.effective_to })),
    createdAt: customer.created_at, updatedAt: customer.updated_at,
  };
}

function readCustomers(database, version) {
  const customers = database.prepare('SELECT * FROM customers ORDER BY sort_order, rowid').all();
  const assignments = database.prepare('SELECT * FROM customer_assignments ORDER BY customer_id, sort_order').all();
  const grouped = groupByCustomer(assignments);
  return { version, data: customers.map((row) => customerFromRow(row, grouped.get(row.id) ?? [])) };
}

function readCustomer(database, id) {
  const row = database.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (row) return customerFromRow(row, database.prepare(
    'SELECT * FROM customer_assignments WHERE customer_id = ? ORDER BY sort_order').all(id));
}

function writeEmployees(database, version, employees) {
  const links = employees.map((employee) => employee.linkedAccountId).filter((id) => id !== undefined);
  if (links.length) {
    const accounts = accountStore.readAccounts(database);
    const accountIds = new Set(accounts.map(({ id }) => id));
    if (links.some((id) => !accountIds.has(id))) {
      throw Object.assign(new Error('Tài khoản liên kết không còn tồn tại.'), { status: 400 });
    }
    if (new Set(links).size !== links.length) {
      throw Object.assign(new Error('Tài khoản này đã liên kết với nhân viên khác.'), { status: 409 });
    }
  }
  database.exec('DELETE FROM sales_employees;');
  const statement = database.prepare(`
    INSERT INTO sales_employees
      (id, code, name, phone, email, status, created_at, sort_order, linked_account_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  employees.forEach((employee, index) => statement.run(
    employee.id, employee.code, employee.name, employee.phone, employee.email,
    employee.status, employee.createdAt, index, employee.linkedAccountId ?? null,
  ));
  writeVersion(database, DATASET_KEYS.employees, version);
}

function employeeFromRow(item) {
  return {
    id: item.id, code: item.code, name: item.name, phone: item.phone, email: item.email,
    status: item.status, createdAt: item.created_at,
    ...(item.linked_account_id ? { linkedAccountId: item.linked_account_id } : {}),
  };
}

function readEmployees(database, version) {
  return { version, data: database.prepare('SELECT * FROM sales_employees ORDER BY sort_order, rowid').all().map(employeeFromRow) };
}

function nextUpdatedAt(previous) {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
}

// Each route makes its checks and writes in one SQLite transaction.
function directoryTransaction(database, work, transaction = true) {
  function touchCustomer(id) {
    const row = database.prepare('SELECT updated_at FROM customers WHERE id = ?').get(id);
    database.prepare('UPDATE customers SET updated_at = ? WHERE id = ?').run(nextUpdatedAt(row.updated_at), id);
  }
  const apply = () => work({
    customer: (id) => readCustomer(database, id),
    employee(id) {
      const row = database.prepare('SELECT * FROM sales_employees WHERE id = ?').get(id);
      if (row) return employeeFromRow(row);
    },
    customerHasReceipts(id) {
      return Boolean(database.prepare('SELECT 1 FROM receipts WHERE customer_id = ? LIMIT 1').get(id));
    },
    insertCustomer(item, order) {
      database.prepare('INSERT INTO customers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        item.id, item.misaCode, item.name, item.group, item.taxCode, item.province, item.address,
        item.status, item.createdAt, item.updatedAt, order);
      writeVersion(database, DATASET_KEYS.customers, 2);
    },
    customerCodes() {
      return database.prepare('SELECT id, misa_code, tax_code FROM customers').all();
    },
    employeeCodes() {
      return database.prepare('SELECT id, code FROM sales_employees').all();
    },
    customerOrder(prepend) {
      const row = database.prepare('SELECT MIN(sort_order) AS first, MAX(sort_order) AS last FROM customers').get();
      return prepend ? (row.first ?? 0) - 1 : (row.last ?? -1) + 1;
    },
    updateCustomer(item) {
      database.prepare(`UPDATE customers SET misa_code=?, name=?, customer_group=?, tax_code=?,
        province=?, address=?, status=?, updated_at=? WHERE id=?`).run(
        item.misaCode, item.name, item.group, item.taxCode, item.province, item.address, item.status, item.updatedAt, item.id);
    },
    deleteCustomer(id) {
      database.prepare('DELETE FROM customers WHERE id = ?').run(id);
    },
    saveEmployee(item) {
      const link = item.linkedAccountId ?? null;
      if (link && !accountStore.readAccounts(database).some(({ id }) => id === link))
        throw Object.assign(new Error('Tài khoản liên kết không còn tồn tại.'), { status: 400 });
      database.prepare(`INSERT INTO sales_employees
        (id, code, name, phone, email, status, created_at, sort_order, linked_account_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM sales_employees), ?)
        ON CONFLICT(id) DO UPDATE SET code=excluded.code, name=excluded.name, phone=excluded.phone,
        email=excluded.email, status=excluded.status, linked_account_id=excluded.linked_account_id`).run(
        item.id, item.code, item.name, item.phone, item.email, item.status, item.createdAt, link);
      writeVersion(database, DATASET_KEYS.employees, 2);
    },
    deleteEmployee(id) {
      database.prepare('DELETE FROM sales_employees WHERE id = ?').run(id);
    },
    employeeAssignments(id, openOnly) {
      return database.prepare(`SELECT id, customer_id, effective_from FROM customer_assignments
        WHERE employee_id = ?${openOnly ? ' AND effective_to IS NULL' : ''}`).all(id);
    },
    renameEmployeeAssignments(id, name) {
      const rows = database.prepare(`UPDATE customer_assignments SET employee_name = ?
        WHERE employee_id = ? AND employee_name <> ? RETURNING customer_id`).all(name, id, name);
      for (const customerId of new Set(rows.map((row) => row.customer_id))) touchCustomer(customerId);
    },
    assignment(id) {
      return database.prepare('SELECT * FROM customer_assignments WHERE id = ?').get(id);
    },
    endAssignment(id, date, customerId) {
      database.prepare('UPDATE customer_assignments SET effective_to = ? WHERE id = ?').run(date, id);
      touchCustomer(customerId);
    },
    insertAssignment(item, customerId) {
      database.prepare(`INSERT INTO customer_assignments VALUES (?, ?, ?, ?, ?, 'direct', ?, NULL,
        (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM customer_assignments WHERE customer_id = ?))`)
        .run(item.id, customerId, item.employeeId, item.employeeName, item.province, item.effectiveFrom, customerId);
      touchCustomer(customerId);
    },
  });
  return transaction ? withTransaction(database, apply) : apply();
}

const sellerText = (value) => (typeof value === 'string' ? value.slice(0, 500) : '');

function sellerJson(settings) {
  const fields = ['bankAccounts', 'accountingContact', 'signatoryName', 'signatoryTitle'];
  // Dữ liệu cũ chưa có trường bên bán: giữ NULL để giao diện điền giá trị chuyển đổi.
  if (fields.every((field) => settings[field] === undefined)) return null;
  return JSON.stringify({
    bankAccounts: Array.isArray(settings.bankAccounts)
      ? settings.bankAccounts.filter((item) => typeof item === 'string').slice(0, 3).map(sellerText)
      : [],
    accountingContact: sellerText(settings.accountingContact),
    signatoryName: sellerText(settings.signatoryName),
    signatoryTitle: sellerText(settings.signatoryTitle),
  });
}

function insertSettings(database, settings) {
  database.prepare(`INSERT INTO app_settings
    (id, company_name, company_address, display_name, tagline, logo_data_url, seller_json)
    VALUES (1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET company_name = excluded.company_name, company_address = excluded.company_address,
      display_name = excluded.display_name, tagline = excluded.tagline, logo_data_url = excluded.logo_data_url,
      seller_json = excluded.seller_json`)
    .run(settings.companyName, settings.companyAddress, settings.displayName, settings.tagline,
      settings.logoDataUrl, sellerJson(settings));
}

function writeSettings(database, version, settings) {
  insertSettings(database, settings);
  writeVersion(database, DATASET_KEYS.settings, version);
}

function readSettings(database, version) {
  const item = database.prepare('SELECT * FROM app_settings WHERE id = 1').get();
  let seller = {};
  try {
    if (item.seller_json) seller = JSON.parse(item.seller_json);
  } catch {
    seller = {};
  }
  return { version, data: { companyName: item.company_name, companyAddress: item.company_address, ...seller, displayName: item.display_name, tagline: item.tagline, logoDataUrl: item.logo_data_url } };
}

let lastDatasetStamp = 0;

// updated_at tăng nghiêm ngặt cho mỗi lần ghi để máy trạm dùng làm dấu "dữ liệu đã đổi"
// mà không phải tải lại toàn bộ sổ (xem datasetStamp).
function nextDatasetStamp(database, key) {
  const row = database.prepare('SELECT updated_at FROM app_datasets WHERE dataset_key = ?').get(key);
  lastDatasetStamp = Math.max(Date.now(), (Date.parse(row?.updated_at ?? '') || 0) + 1, lastDatasetStamp + 1);
  return new Date(lastDatasetStamp).toISOString();
}

function writeGeneric(database, key, version, data) {
  database.prepare(`INSERT INTO app_datasets (dataset_key, version, payload_json, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(dataset_key) DO UPDATE SET version = excluded.version, payload_json = excluded.payload_json, updated_at = excluded.updated_at`)
    .run(key, version, JSON.stringify(data), nextDatasetStamp(database, key));
}

function bookStamp(database, key) {
  lastDatasetStamp = Math.max(Date.now(), (Date.parse(books.stamp(database, key)?.slice(2) ?? '') || 0) + 1, lastDatasetStamp + 1);
  return new Date(lastDatasetStamp).toISOString();
}

function datasetStamp(database, key) {
  if (key === books.SALE || key === books.LEDGER) return books.stamp(database, key);
  const row = database.prepare('SELECT version, updated_at FROM app_datasets WHERE dataset_key = ?').get(key);
  return row ? `${row.version}:${row.updated_at}` : null;
}

function readGeneric(database, key) {
  const row = database.prepare('SELECT version, payload_json FROM app_datasets WHERE dataset_key = ?').get(key);
  return row ? { version: row.version, data: JSON.parse(row.payload_json) } : undefined;
}

function clearAllData(database, branding) {
  return withTransaction(database, () => {
    database.exec(`
      DELETE FROM customer_assignments;
      DELETE FROM customers;
      DELETE FROM sales_employees;
      DELETE FROM app_settings;
      DELETE FROM app_datasets WHERE dataset_key <> 'cong-no.accounts.v1';
      DELETE FROM dataset_versions;
    `);
    books.clearSales(database);
    books.clearLedger(database);
    if (branding) {
      insertSettings(database, {
        companyName: '', companyAddress: '', displayName: branding.displayName,
        tagline: branding.tagline, logoDataUrl: branding.logoDataUrl,
      });
      writeVersion(database, DATASET_KEYS.settings, 2);
    }
    return true;
  });
}

function readBusinessData(database) {
  function directory(key, read, fallback) {
    const version = readVersion(database, key);
    return version ? read(database, version.version).data : fallback;
  }
  return {
    customers: directory(DATASET_KEYS.customers, readCustomers, []),
    employees: directory(DATASET_KEYS.employees, readEmployees, []),
    salesBook: books.readSales(database) ?? null,
    ledger: books.readLedger(database) ?? null,
    settings: directory(DATASET_KEYS.settings, readSettings, null),
  };
}

function changeBusinessData(database, change, companyId, expected, onChange) {
  return withTransaction(database, () => {
    const current = readBusinessData(database);
    if (expected !== undefined && JSON.stringify(current) !== expected) {
      throw Object.assign(new Error('Dữ liệu vừa thay đổi. Kiểm tra lại rồi thử lại.'), { status: 409 });
    }
    let next;
    if (change?.type === 'restore') {
      const accounts = accountStore.readAccounts(database);
      next = restoreBusinessData(change.backup, current, companyId, new Set(accounts.map(({ id }) => id)));
    } else if (change?.type === 'delete') {
      next = deleteBusinessGroups(current, change.groups);
    } else {
      throw Object.assign(new Error('Thao tác dữ liệu không hợp lệ.'), { status: 400 });
    }
    if (next.customers !== current.customers) writeCustomers(database, 2, next.customers);
    if (next.employees !== current.employees) writeEmployees(database, 2, next.employees);
    if (next.salesBook !== current.salesBook) {
      if (next.salesBook === null) books.clearSales(database);
      else books.writeSales(database, next.salesBook, bookStamp(database, books.SALE));
    }
    if (next.ledger !== current.ledger) {
      if (next.ledger === null) books.clearLedger(database);
      else books.writeLedger(database, next.ledger, bookStamp(database, books.LEDGER));
    }
    if (next.settings !== current.settings) {
      if (next.settings) writeSettings(database, 2, next.settings);
      else {
        database.exec('DELETE FROM app_settings');
        database.prepare('DELETE FROM dataset_versions WHERE dataset_key = ?').run(DATASET_KEYS.settings);
      }
    }
    onChange?.();
    return true;
  });
}

// Bản sao lưu từ phiên bản cũ được nâng cấp trên một bản chép tạm rồi mới đọc,
// để khóa dữ liệu và cấu trúc khớp phiên bản hiện tại; tệp sao lưu gốc giữ nguyên.
function openUpgradedCopy(databasePath) {
  const copy = path.join(os.tmpdir(), `cong-no-sao-luu-${randomUUID()}.sqlite`);
  fs.copyFileSync(databasePath, copy);
  let opened;
  try {
    opened = openDatabase(copy, { snapshot: false });
  } catch (error) {
    fs.rmSync(copy, { force: true });
    throw error;
  }
  const close = opened.close;
  opened.close = () => {
    close();
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(copy + suffix, { force: true });
  };
  return opened;
}

function openDatabase(databasePath, { readOnly = false, snapshot = true } = {}) {
  if (readOnly) {
    const probe = new DatabaseSync(databasePath, { readOnly: true });
    let version;
    try { ({ user_version: version } = probe.prepare('PRAGMA user_version').get()); } finally { probe.close(); }
    if (version < 8 || version > SCHEMA_VERSION) throw new Error('Phiên bản bản sao lưu SQLite không tương thích.');
    if (version < SCHEMA_VERSION) return openUpgradedCopy(databasePath);
  }
  const database = new DatabaseSync(databasePath, { readOnly });
  try {
    if (!readOnly) migrateSchema(database, databasePath, { snapshot });
  } catch (error) {
    database.close();
    throw error;
  }
  return {
    datasetStamp(key) { return datasetStamp(database, key); },
    readDataset(key) {
      if (key === accountStore.ACCOUNTS_KEY) {
        const accounts = accountStore.readAccounts(database);
        return accounts.length ? { version: 1, data: accounts } : undefined;
      }
      if (key === books.SALE || key === books.LEDGER) {
        const data = key === books.SALE ? books.readSales(database) : books.readLedger(database);
        if (data) return { version: 1, data };
        return undefined;
      }
      const versionRow = readVersion(database, key);
      if (key === DATASET_KEYS.customers && versionRow) return readCustomers(database, versionRow.version);
      if (key === DATASET_KEYS.employees && versionRow) return readEmployees(database, versionRow.version);
      if (key === DATASET_KEYS.settings && versionRow) return readSettings(database, versionRow.version);
      return readGeneric(database, key);
    },
    writeDataset(key, version, data) {
      if (!Number.isInteger(version) || version < 1) throw new Error('Phiên bản dataset không hợp lệ.');
      if (key === DATASET_KEYS.customers) withTransaction(database, () => writeCustomers(database, version, data));
      else if (key === DATASET_KEYS.employees) withTransaction(database, () => writeEmployees(database, version, data));
      else if (key === DATASET_KEYS.settings) withTransaction(database, () => writeSettings(database, version, data));
      else if (key === books.SALE || key === books.LEDGER) {
        if (version !== 1) throw new Error('Phiên bản sổ không hợp lệ.');
        const write = key === books.SALE ? books.writeSales : books.writeLedger;
        withTransaction(database, () => write(database, data, bookStamp(database, key)));
      } else writeGeneric(database, key, version, data);
      return true;
    },
    exportBusinessBackup(companyId = null) {
      return makeBusinessBackup(readBusinessData(database), companyId);
    },
    changeBusinessData(change, companyId = null, expected, onChange) {
      return changeBusinessData(database, change, companyId, expected, onChange);
    },
    changeDirectory(work) { return directoryTransaction(database, work); },
    writeAccounts(expected, accounts) {
      return withTransaction(database, () => {
        if (JSON.stringify(accountStore.readAccounts(database)) !== JSON.stringify(expected)) return false;
        accountStore.writeAccounts(database, accounts);
        return true;
      });
    },
    saveSession(tokenHash, userId, sessionVersion, expiresAt) {
      accountStore.saveSession(database, tokenHash, userId, sessionVersion, expiresAt);
    },
    findSession(tokenHash) { return accountStore.findSession(database, tokenHash); },
    deleteSession(tokenHash) { accountStore.deleteSession(database, tokenHash); },
    writeReceiptLedger(revision, data, salesBookImportedAt, { checkNewCustomers = false } = {}) {
      return withTransaction(database, () => {
        const current = books.readLedger(database);
        if ((current?.revision ?? '') !== revision) return false;
        if (salesBookImportedAt !== undefined &&
            books.salesMetadata(database)?.importedAt !== salesBookImportedAt) return false;
        if (checkNewCustomers) {
          const previous = new Set((current?.receipts ?? []).map(({ id }) => id));
          const lookup = database.prepare('SELECT misa_code FROM customers WHERE id = ?');
          for (const receipt of data.receipts) {
            if (previous.has(receipt.id)) continue;
            const customer = lookup.get(receipt.customerId);
            if (!customer || customer.misa_code !== receipt.customerCode)
              throw Object.assign(new Error('Khách hàng hoặc mã MISA vừa thay đổi. Hãy tải lại danh mục.'), { status: 409 });
          }
        }
        books.writeLedger(database, data, bookStamp(database, books.LEDGER));
        return true;
      });
    },
    writeMisaSalesBook(expectedImportedAt, data) {
      return withTransaction(database, () => {
        if ((books.salesMetadata(database)?.importedAt ?? null) !== expectedImportedAt) return false;
        books.writeSales(database, data, bookStamp(database, books.SALE));
        return true;
      });
    },
    salesMetadata() { return books.salesMetadata(database); },
    salesPage(query, page, limit) { return books.salesPage(database, query, page, limit); },
    allocatedDocuments() { return books.allocatedDocuments(database); },
    /**
     * Ghi một thao tác vào sổ thu trong một giao dịch. `cached` ({ stamp, value }) là bản sổ đã đọc:
     * nếu dấu trong SQLite vẫn khớp thì dùng lại, khỏi đọc toàn bộ sổ trong lúc giữ khóa ghi.
     * Sau khi ghi, `cached.onWrite(stamp, after)` nhận bản mới để không phải giải mã lại.
     */
    changeLedger(work, cached) {
      return withTransaction(database, () => {
        const current = books.stamp(database, books.LEDGER);
        const before = cached && cached.stamp === current && cached.value
          ? cached.value
          : books.readLedger(database) ?? { revision: '', receipts: [], allocations: [] };
        const { after, audit } = work(before);
        const revision = randomUUID();
        const stamp = bookStamp(database, books.LEDGER);
        books.applyLedgerChange(database, before, after, revision, stamp);
        if (audit) database.prepare('INSERT INTO activity_log VALUES (?, ?, ?)').run(audit.id, audit.time, JSON.stringify(audit));
        cached?.onWrite?.(`1:${stamp}`, { ...after, revision });
        return revision;
      });
    },
    changeSales(work) {
      return withTransaction(database, () => {
        const { book, audit } = work(books.readSales(database) ?? null, (apply) => directoryTransaction(database, apply, false));
        if (book) books.writeSales(database, book, bookStamp(database, books.SALE));
        if (audit) database.prepare('INSERT INTO activity_log VALUES (?, ?, ?)').run(audit.id, audit.time, JSON.stringify(audit));
        return books.salesMetadata(database) ?? null;
      });
    },
    clearAllData(branding) { return clearAllData(database, branding); },
    appendActivity(entry) {
      database.prepare('INSERT INTO activity_log VALUES (?, ?, ?)')
        .run(entry.id, entry.time, JSON.stringify(entry));
      return true;
    },
    readActivities() {
      return database.prepare('SELECT payload_json FROM activity_log ORDER BY occurred_at DESC, id DESC')
        .all().map((row) => JSON.parse(row.payload_json));
    },
    status() {
      const row = database.prepare('PRAGMA user_version').get();
      return { backend: 'sqlite', schemaVersion: Number(row?.user_version ?? 0) };
    },
    close() { database.close(); },
  };
}

module.exports = { DATASET_KEYS, SCHEMA_VERSION, openDatabase };
