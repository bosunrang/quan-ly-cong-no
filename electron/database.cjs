const { DatabaseSync } = require('node:sqlite');

const SCHEMA_VERSION = 6;
const DATASET_KEYS = {
  customers: 'mkt-cost.customers.v2',
  employees: 'mkt-cost.sales-employees.v2',
  products: 'mkt-cost.products.v7',
  settings: 'mkt-cost.settings.v2',
  misaDetails: 'mkt-cost.misa-details.v1',
};

function migrateSchema(database) {
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  const row = database.prepare('PRAGMA user_version').get();
  const currentVersion = Number(row?.user_version ?? 0);
  if (currentVersion > SCHEMA_VERSION) throw new Error(`Cơ sở dữ liệu phiên bản ${currentVersion} mới hơn ứng dụng.`);
  if (currentVersion < 1) {
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
  }
  if (currentVersion < 2) {
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
  }
  if (currentVersion < 3) {
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
  }
  if (currentVersion < 4) {
    database.exec(`
      ALTER TABLE misa_details ADD COLUMN product_code TEXT NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS idx_misa_details_date_kind
        ON misa_details(transaction_date, document_kind, unit_id, row_number);
      PRAGMA user_version = 4;
    `);
  }
  if (currentVersion < 5) {
    database.exec(`
      ALTER TABLE product_policies ADD COLUMN retained_amount REAL NOT NULL DEFAULT 0;
      PRAGMA user_version = 5;
    `);
  }
  if (currentVersion < 6) {
    database.exec(`
      ALTER TABLE policy_recipient_allocations ADD COLUMN retained_amount REAL NOT NULL DEFAULT 0;
      PRAGMA user_version = 6;
    `);
  }
}

function withTransaction(database, action) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
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
  return withTransaction(database, () => {
    database.exec('DELETE FROM customer_assignments; DELETE FROM customer_recipients; DELETE FROM customers;');
    const customerStatement = database.prepare('INSERT INTO customers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const assignmentStatement = database.prepare('INSERT INTO customer_assignments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const recipientStatement = database.prepare('INSERT INTO customer_recipients VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    customers.forEach((customer, customerIndex) => {
      customerStatement.run(customer.id, customer.misaCode, customer.name, customer.group, customer.taxCode, customer.province, customer.address, customer.status, customer.createdAt, customer.updatedAt, customerIndex);
      customer.assignments.forEach((assignment, index) => assignmentStatement.run(assignment.id, customer.id, assignment.employeeId, assignment.employeeName, assignment.province, assignment.source, assignment.effectiveFrom, assignment.effectiveTo, index));
      customer.recipients.forEach((recipient, index) => recipientStatement.run(recipient.id, customer.id, recipient.fullName, recipient.position, recipient.phone, recipient.effectiveFrom, recipient.effectiveTo, recipient.isPrimary ? 1 : 0, recipient.active ? 1 : 0, index));
    });
    writeVersion(database, DATASET_KEYS.customers, version);
  });
}

function readCustomers(database, version) {
  const customers = database.prepare('SELECT * FROM customers ORDER BY sort_order').all();
  const assignments = database.prepare('SELECT * FROM customer_assignments ORDER BY customer_id, sort_order').all();
  const recipients = database.prepare('SELECT * FROM customer_recipients ORDER BY customer_id, sort_order').all();
  return { version, data: customers.map((customer) => ({
    id: customer.id, misaCode: customer.misa_code, name: customer.name, group: customer.customer_group,
    taxCode: customer.tax_code, province: customer.province, address: customer.address, status: customer.status,
    assignments: assignments.filter((item) => item.customer_id === customer.id).map((item) => ({ id: item.id, employeeId: item.employee_id, employeeName: item.employee_name, province: item.province, source: item.source, effectiveFrom: item.effective_from, effectiveTo: item.effective_to })),
    recipients: recipients.filter((item) => item.customer_id === customer.id).map((item) => ({ id: item.id, fullName: item.full_name, position: item.position, phone: item.phone, effectiveFrom: item.effective_from, effectiveTo: item.effective_to, isPrimary: Boolean(item.is_primary), active: Boolean(item.active) })),
    createdAt: customer.created_at, updatedAt: customer.updated_at,
  })) };
}

function writeEmployees(database, version, employees) {
  return withTransaction(database, () => {
    database.exec('DELETE FROM sales_employees;');
    const statement = database.prepare('INSERT INTO sales_employees VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    employees.forEach((employee, index) => statement.run(employee.id, employee.code, employee.name, employee.phone, employee.email, employee.status, employee.createdAt, index));
    writeVersion(database, DATASET_KEYS.employees, version);
  });
}

function readEmployees(database, version) {
  const data = database.prepare('SELECT * FROM sales_employees ORDER BY sort_order').all().map((item) => ({ id: item.id, code: item.code, name: item.name, phone: item.phone, email: item.email, status: item.status, createdAt: item.created_at }));
  return { version, data };
}

function writeProducts(database, version, catalog) {
  return withTransaction(database, () => {
    database.exec('DELETE FROM policy_recipient_allocations; DELETE FROM product_policies; DELETE FROM products;');
    const productStatement = database.prepare(`INSERT INTO products
      (id, code, name, product_group, unit, status, created_at, updated_at, sort_order, search_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const policyStatement = database.prepare(`INSERT INTO product_policies
      (id, product_id, customer_id, calculation_type, value, effective_from, effective_to, status, note, created_at, updated_at, sort_order, retained_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const allocationStatement = database.prepare(`INSERT INTO policy_recipient_allocations
      (policy_id, recipient_id, amount, sort_order, retained_amount)
      VALUES (?, ?, ?, ?, ?)`);
    catalog.products.forEach((product, index) => productStatement.run(
      product.id, product.code, product.name, product.group, product.unit, product.status,
      product.createdAt, product.updatedAt, index,
      `${product.code} ${product.name}`.toLocaleLowerCase('vi-VN'),
    ));
    catalog.policies.forEach((policy, policyIndex) => {
      policyStatement.run(policy.id, policy.productId, policy.customerId, policy.calculationType, policy.value, policy.effectiveFrom, policy.effectiveTo, policy.status, policy.note, policy.createdAt, policy.updatedAt, policyIndex, policy.retainedAmount ?? 0);
      policy.recipientAllocations.forEach((allocation, index) => allocationStatement.run(policy.id, allocation.recipientId, allocation.amount, index, allocation.retainedAmount ?? 0));
    });
    writeVersion(database, DATASET_KEYS.products, version);
  });
}

function mapProduct(item) {
  return {
    id: item.id, code: item.code, name: item.name, group: item.product_group, unit: item.unit,
    status: item.status, createdAt: item.created_at, updatedAt: item.updated_at,
  };
}

function mapPolicy(item, allocationsByPolicy) {
  return {
    id: item.id, productId: item.product_id, customerId: item.customer_id,
    recipientAllocations: allocationsByPolicy.get(item.id) ?? [],
    calculationType: item.calculation_type, value: item.value, retainedAmount: item.retained_amount ?? 0, effectiveFrom: item.effective_from,
    effectiveTo: item.effective_to, status: item.status, note: item.note,
    createdAt: item.created_at, updatedAt: item.updated_at,
  };
}

function readProducts(database, version) {
  const products = database.prepare('SELECT * FROM products ORDER BY sort_order').all().map(mapProduct);
  const allocations = database.prepare('SELECT * FROM policy_recipient_allocations ORDER BY policy_id, sort_order').all();
  const allocationsByPolicy = new Map();
  for (const allocation of allocations) {
    const values = allocationsByPolicy.get(allocation.policy_id) ?? [];
    values.push({ recipientId: allocation.recipient_id, amount: allocation.amount, retainedAmount: allocation.retained_amount ?? 0 });
    allocationsByPolicy.set(allocation.policy_id, values);
  }
  const policies = database.prepare('SELECT * FROM product_policies ORDER BY sort_order').all()
    .map((item) => mapPolicy(item, allocationsByPolicy));
  return { version, data: { products, policies } };
}

function normalizeProductQuery(options = {}) {
  const pageSize = [25, 50, 100].includes(Number(options.pageSize)) ? Number(options.pageSize) : 25;
  return {
    query: typeof options.query === 'string' ? options.query.trim().slice(0, 200).toLocaleLowerCase('vi-VN') : '',
    group: typeof options.group === 'string' && options.group !== 'all' ? options.group.slice(0, 200) : null,
    page: Math.max(1, Math.trunc(Number(options.page) || 1)),
    pageSize,
    today: /^\d{4}-\d{2}-\d{2}$/.test(options.today) ? options.today : new Date().toISOString().slice(0, 10),
    soonDate: /^\d{4}-\d{2}-\d{2}$/.test(options.soonDate) ? options.soonDate : new Date().toISOString().slice(0, 10),
    activeCustomerCount: Math.max(0, Math.trunc(Number(options.activeCustomerCount) || 0)),
  };
}

function queryProducts(database, options) {
  if (!readVersion(database, DATASET_KEYS.products)) return { initialized: false };
  const normalized = normalizeProductQuery(options);
  const filterSql = `(? = '' OR instr(search_text, ?) > 0)
    AND (? IS NULL OR product_group = ?)`;
  const filterParams = [normalized.query, normalized.query, normalized.group, normalized.group];
  const filteredCount = Number(database.prepare(`SELECT COUNT(*) AS count FROM products WHERE ${filterSql}`).get(...filterParams).count);
  const pageCount = Math.max(1, Math.ceil(filteredCount / normalized.pageSize));
  const page = Math.min(normalized.page, pageCount);
  const offset = (page - 1) * normalized.pageSize;
  const rows = database.prepare(`
    SELECT products.*, COALESCE(current_policy.coverage_count, 0) AS coverage_count
    FROM products
    LEFT JOIN (
      SELECT product_id, COUNT(DISTINCT customer_id) AS coverage_count
      FROM product_policies
      WHERE status = 'active' AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
      GROUP BY product_id
    ) AS current_policy ON current_policy.product_id = products.id
    WHERE ${filterSql}
    ORDER BY products.sort_order
    LIMIT ? OFFSET ?
  `).all(normalized.today, normalized.today, ...filterParams, normalized.pageSize, offset);

  const productTotals = database.prepare(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active FROM products`).get();
  const policyTotals = database.prepare(`SELECT COUNT(*) AS total,
    COUNT(DISTINCT customer_id) AS customers,
    SUM(CASE WHEN effective_to IS NOT NULL AND effective_to BETWEEN ? AND ? THEN 1 ELSE 0 END) AS expiring
    FROM product_policies
    WHERE status = 'active' AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)`)
    .get(normalized.today, normalized.soonDate, normalized.today, normalized.today);
  const coverageRows = database.prepare(`SELECT products.id, COUNT(DISTINCT product_policies.customer_id) AS coverage
    FROM products
    LEFT JOIN product_policies ON product_policies.product_id = products.id
      AND product_policies.status = 'active'
      AND product_policies.effective_from <= ?
      AND (product_policies.effective_to IS NULL OR product_policies.effective_to >= ?)
    WHERE products.status = 'active'
    GROUP BY products.id`).all(normalized.today, normalized.today);
  const missingAssignments = coverageRows.reduce(
    (sum, row) => sum + Math.max(0, normalized.activeCustomerCount - Number(row.coverage)), 0,
  );
  const groups = database.prepare(`SELECT DISTINCT product_group FROM products
    WHERE product_group <> '' ORDER BY product_group COLLATE NOCASE`).all().map((row) => row.product_group);

  return {
    initialized: true,
    products: rows.map(mapProduct),
    coverageByProduct: Object.fromEntries(rows.map((row) => [row.id, Number(row.coverage_count)])),
    groups,
    filteredCount,
    totalCount: Number(productTotals.total),
    page,
    pageCount,
    firstVisible: filteredCount === 0 ? 0 : offset + 1,
    lastVisible: Math.min(offset + normalized.pageSize, filteredCount),
    summary: {
      activeProducts: Number(productTotals.active ?? 0),
      currentPolicies: Number(policyTotals.total ?? 0),
      currentCustomers: Number(policyTotals.customers ?? 0),
      missingAssignments,
      expiringSoon: Number(policyTotals.expiring ?? 0),
    },
  };
}

function readProductDetail(database, productId) {
  if (typeof productId !== 'string' || productId.length > 160) throw new Error('Mã định danh sản phẩm không hợp lệ.');
  const productRow = database.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!productRow) return null;
  const policyRows = database.prepare('SELECT * FROM product_policies WHERE product_id = ? ORDER BY sort_order').all(productId);
  const allocationsByPolicy = new Map();
  if (policyRows.length) {
    const allocationStatement = database.prepare('SELECT * FROM policy_recipient_allocations WHERE policy_id = ? ORDER BY sort_order');
    for (const policy of policyRows) {
      allocationsByPolicy.set(policy.id, allocationStatement.all(policy.id).map((item) => ({ recipientId: item.recipient_id, amount: item.amount, retainedAmount: item.retained_amount ?? 0 })));
    }
  }
  return { products: [mapProduct(productRow)], policies: policyRows.map((item) => mapPolicy(item, allocationsByPolicy)) };
}

function writeSettings(database, version, settings) {
  return withTransaction(database, () => {
    database.prepare(`INSERT INTO app_settings VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET company_name = excluded.company_name, company_address = excluded.company_address, display_name = excluded.display_name, tagline = excluded.tagline, logo_data_url = excluded.logo_data_url`)
      .run(settings.companyName, settings.companyAddress, settings.displayName, settings.tagline, settings.logoDataUrl);
    writeVersion(database, DATASET_KEYS.settings, version);
  });
}

function readSettings(database, version) {
  const item = database.prepare('SELECT * FROM app_settings WHERE id = 1').get();
  return { version, data: { companyName: item.company_name, companyAddress: item.company_address, displayName: item.display_name, tagline: item.tagline, logoDataUrl: item.logo_data_url } };
}

function normalizeSearch(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function writeMisaDetails(database, version, rows) {
  if (!Array.isArray(rows)) throw new Error('Dữ liệu chi tiết MISA không hợp lệ.');
  return withTransaction(database, () => {
    database.exec('DELETE FROM misa_details;');
    const statement = database.prepare(`INSERT INTO misa_details (
      id, unit_id, row_number, transaction_date, document_number, product_code, description, unit,
      quantity, unit_price, general_description, debt_account, contra_account,
      debit, credit, balance_debit, balance_credit, document_kind, search_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const row of rows) {
      statement.run(
        row.id, row.unitId, row.rowNumber, row.date, row.documentNumber, row.productCode ?? '', row.description,
        row.unit, row.quantity, row.unitPrice, row.generalDescription, row.debtAccount,
        row.contraAccount, row.debit, row.credit, row.balanceDebit, row.balanceCredit,
        row.documentKind,
        normalizeSearch(`${row.documentNumber} ${row.description} ${row.generalDescription}`),
      );
    }
    writeVersion(database, DATASET_KEYS.misaDetails, version);
    return true;
  });
}

function mapMisaDetail(row) {
  return {
    id: row.id, unitId: row.unit_id, rowNumber: Number(row.row_number),
    date: row.transaction_date, documentNumber: row.document_number,
    productCode: row.product_code ?? '', description: row.description, unit: row.unit, quantity: row.quantity,
    unitPrice: row.unit_price, generalDescription: row.general_description,
    debtAccount: row.debt_account, contraAccount: row.contra_account,
    debit: row.debit, credit: row.credit,
    balanceDebit: row.balance_debit, balanceCredit: row.balance_credit,
    documentKind: row.document_kind,
  };
}

function queryMisaDetails(database, options = {}) {
  const unitId = typeof options.unitId === 'string' ? options.unitId.slice(0, 600) : '';
  if (!unitId) throw new Error('Chưa chọn đơn vị MISA.');
  const kinds = ['all', 'sale', 'receipt', 'adjustment'];
  const documentKind = kinds.includes(options.documentKind) ? options.documentKind : 'all';
  const query = normalizeSearch(typeof options.query === 'string' ? options.query.slice(0, 200) : '');
  const pageSize = [25, 50, 100].includes(Number(options.pageSize)) ? Number(options.pageSize) : 25;
  const requestedPage = Math.max(1, Math.trunc(Number(options.page) || 1));
  const filterSql = `unit_id = ? AND document_kind <> 'opening' AND (? = 'all' OR document_kind = ?)
    AND (? = '' OR instr(search_text, ?) > 0)`;
  const params = [unitId, documentKind, documentKind, query, query];
  const filteredCount = Number(database.prepare(`SELECT COUNT(*) AS count FROM misa_details WHERE ${filterSql}`).get(...params).count);
  const pageCount = Math.max(1, Math.ceil(filteredCount / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const offset = (page - 1) * pageSize;
  const rows = database.prepare(`SELECT * FROM misa_details WHERE ${filterSql}
    ORDER BY row_number LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  return {
    rows: rows.map(mapMisaDetail), filteredCount, page, pageCount,
    firstVisible: filteredCount ? offset + 1 : 0,
    lastVisible: Math.min(offset + pageSize, filteredCount),
  };
}

function queryMisaRange(database, options = {}) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const dateFrom = typeof options.dateFrom === 'string' && datePattern.test(options.dateFrom) ? options.dateFrom : '';
  const dateTo = typeof options.dateTo === 'string' && datePattern.test(options.dateTo) ? options.dateTo : '';
  if (!dateFrom || !dateTo || dateTo < dateFrom) throw new Error('Khoảng ngày đối soát không hợp lệ.');
  return database.prepare(`SELECT * FROM misa_details
    WHERE transaction_date BETWEEN ? AND ? AND document_kind <> 'opening'
    ORDER BY transaction_date, row_number`).all(dateFrom, dateTo).map(mapMisaDetail);
}

function writeGeneric(database, key, version, data) {
  database.prepare(`INSERT INTO app_datasets (dataset_key, version, payload_json, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(dataset_key) DO UPDATE SET version = excluded.version, payload_json = excluded.payload_json, updated_at = excluded.updated_at`)
    .run(key, version, JSON.stringify(data), new Date().toISOString());
}

function readGeneric(database, key) {
  const row = database.prepare('SELECT version, payload_json FROM app_datasets WHERE dataset_key = ?').get(key);
  return row ? { version: row.version, data: JSON.parse(row.payload_json) } : undefined;
}

function openDatabase(databasePath) {
  const database = new DatabaseSync(databasePath);
  migrateSchema(database);
  return {
    readDataset(key) {
      const versionRow = readVersion(database, key);
      if (key === DATASET_KEYS.customers && versionRow) return readCustomers(database, versionRow.version);
      if (key === DATASET_KEYS.employees && versionRow) return readEmployees(database, versionRow.version);
      if (key === DATASET_KEYS.products && versionRow) return readProducts(database, versionRow.version);
      if (key === DATASET_KEYS.settings && versionRow) return readSettings(database, versionRow.version);
      return readGeneric(database, key);
    },
    writeDataset(key, version, data) {
      if (!Number.isInteger(version) || version < 1) throw new Error('Phiên bản dataset không hợp lệ.');
      if (key === DATASET_KEYS.customers) writeCustomers(database, version, data);
      else if (key === DATASET_KEYS.employees) writeEmployees(database, version, data);
      else if (key === DATASET_KEYS.products) writeProducts(database, version, data);
      else if (key === DATASET_KEYS.settings) writeSettings(database, version, data);
      else writeGeneric(database, key, version, data);
      return true;
    },
    queryProducts(options) { return queryProducts(database, options); },
    readProductDetail(productId) { return readProductDetail(database, productId); },
    writeMisaDetails(version, rows) { return writeMisaDetails(database, version, rows); },
    queryMisaDetails(options) { return queryMisaDetails(database, options); },
    queryMisaRange(options) { return queryMisaRange(database, options); },
    status() {
      const row = database.prepare('PRAGMA user_version').get();
      return { backend: 'sqlite', schemaVersion: Number(row?.user_version ?? 0) };
    },
    close() { database.close(); },
  };
}

module.exports = { DATASET_KEYS, SCHEMA_VERSION, openDatabase };
