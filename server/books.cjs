const { isDeepStrictEqual } = require('node:util');
const { isValidSalesBook, isValidReceiptLedger } = require('../src/domain/settings/business-data.rules.mjs');

const SALE = 'cong-no.misa-sales-book.v1';
const LEDGER = 'cong-no.receipt-ledger.v1';

function schema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_book (id INTEGER PRIMARY KEY CHECK (id = 1),
      file_name TEXT NOT NULL, imported_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sales_lines (
      position INTEGER PRIMARY KEY, row_number INTEGER NOT NULL, date TEXT NOT NULL,
      document_number TEXT NOT NULL, invoice_number TEXT NOT NULL, customer_name TEXT NOT NULL,
      customer_code TEXT, product_name TEXT NOT NULL, unit TEXT NOT NULL, quantity REAL,
      unit_price REAL, sales_amount REAL, payment_total REAL, origin_json TEXT, source_json TEXT
    );
    CREATE INDEX IF NOT EXISTS sales_lines_customer ON sales_lines(customer_code, date, document_number);
    CREATE INDEX IF NOT EXISTS sales_lines_date ON sales_lines(date DESC, document_number COLLATE NOCASE DESC, row_number);
    CREATE INDEX IF NOT EXISTS sales_lines_document ON sales_lines(document_number);
    CREATE TABLE IF NOT EXISTS receipt_ledger (id INTEGER PRIMARY KEY CHECK (id = 1),
      revision TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY, position INTEGER NOT NULL, number TEXT NOT NULL, date TEXT NOT NULL,
      customer_id TEXT NOT NULL, customer_name TEXT NOT NULL, customer_code TEXT NOT NULL,
      amount INTEGER NOT NULL, reference TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS receipts_customer ON receipts(customer_id, date);
    CREATE TABLE IF NOT EXISTS allocations (
      id TEXT PRIMARY KEY, position INTEGER NOT NULL, receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
      date TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS allocations_receipt ON allocations(receipt_id);
    CREATE TABLE IF NOT EXISTS allocation_lines (
      allocation_id TEXT NOT NULL REFERENCES allocations(id) ON DELETE CASCADE, position INTEGER NOT NULL,
      amount INTEGER NOT NULL, invoice_id TEXT NOT NULL, invoice_date TEXT NOT NULL,
      customer_id TEXT NOT NULL, invoice_number TEXT NOT NULL, invoice_series TEXT NOT NULL,
      document_number TEXT NOT NULL, invoice_amount INTEGER NOT NULL, source_file TEXT NOT NULL,
      PRIMARY KEY (allocation_id, position)
    );
    CREATE INDEX IF NOT EXISTS allocation_lines_document ON allocation_lines(document_number);
    CREATE TABLE IF NOT EXISTS reversals (
      receipt_id TEXT UNIQUE REFERENCES receipts(id) ON DELETE CASCADE,
      allocation_id TEXT UNIQUE REFERENCES allocations(id) ON DELETE CASCADE,
      date TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
      CHECK ((receipt_id IS NULL) <> (allocation_id IS NULL))
    );
  `);
}

function salesMetadata(db) {
  const row = db.prepare('SELECT * FROM sales_book WHERE id = 1').get();
  if (row) return { fileName: row.file_name, importedAt: row.imported_at };
}

function salesLine(row) {
  return { rowNumber: row.row_number, date: row.date, documentNumber: row.document_number,
    invoiceNumber: row.invoice_number, customerName: row.customer_name, productName: row.product_name,
    unit: row.unit, quantity: row.quantity, unitPrice: row.unit_price, salesAmount: row.sales_amount,
    paymentTotal: row.payment_total, ...(row.origin_json ? { origin: JSON.parse(row.origin_json) } : {}),
    ...(row.source_json ? { source: JSON.parse(row.source_json) } : {}) };
}

function readSales(db) {
  const metadata = salesMetadata(db);
  if (metadata) return { ...metadata, rows: db.prepare('SELECT * FROM sales_lines ORDER BY position').all().map(salesLine) };
}

function salesPage(db, match, requested, limit) {
  // Keep the same Vietnamese search semantics as the import preview.
  if (match) db.function('sales_matches', { deterministic: true, varargs: true }, match);
  const where = match ? ' WHERE sales_matches(document_number, invoice_number, customer_name, customer_code, product_name)' : '';
  const total = db.prepare('SELECT COUNT(*) total FROM sales_lines' + where).get().total;
  const page = Math.min(requested, Math.max(1, Math.ceil(total / limit)));
  const rows = db.prepare('SELECT * FROM sales_lines' + where + ' ORDER BY date DESC, document_number COLLATE NOCASE DESC, row_number, position LIMIT ? OFFSET ?')
    .all(limit, (page - 1) * limit).map(salesLine);
  return { total, rows, page, rowCount: match ? db.prepare('SELECT COUNT(*) count FROM sales_lines').get().count : total };
}

function clearSales(db) { db.exec('DELETE FROM sales_lines; DELETE FROM sales_book;'); }

function writeSales(db, book, stamp) {
  clearSales(db);
  db.prepare('INSERT INTO sales_book VALUES (1, ?, ?, ?)').run(book.fileName ?? '', book.importedAt, stamp);
  const insert = db.prepare('INSERT INTO sales_lines VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  book.rows.forEach((line, i) => insert.run(i, line.rowNumber, line.date, line.documentNumber, line.invoiceNumber,
    line.customerName, line.source?.customerCode ?? null, line.productName, line.unit, line.quantity, line.unitPrice,
    line.salesAmount, line.paymentTotal, line.origin ? JSON.stringify(line.origin) : null,
    line.source ? JSON.stringify(line.source) : null));
}

function ledgerRevision(db) {
  return db.prepare('SELECT revision FROM receipt_ledger WHERE id = 1').get()?.revision;
}

function withReversal(row) {
  return row.rev_date === null ? {} : { reversal: { date: row.rev_date, reason: row.rev_reason, createdAt: row.rev_at } };
}

function readLedger(db) {
  const revision = ledgerRevision(db);
  if (revision === undefined) return;
  const receipts = db.prepare(`SELECT r.*, v.date rev_date, v.reason rev_reason, v.created_at rev_at
    FROM receipts r LEFT JOIN reversals v ON v.receipt_id = r.id ORDER BY r.position`).all().map((row) => ({
    id: row.id, number: row.number, date: row.date, customerId: row.customer_id, customerName: row.customer_name,
    customerCode: row.customer_code, amount: row.amount, reference: row.reference, createdAt: row.created_at, ...withReversal(row),
  }));
  const linesByAllocation = new Map();
  for (const row of db.prepare('SELECT * FROM allocation_lines ORDER BY allocation_id, position').iterate()) {
    const lines = linesByAllocation.get(row.allocation_id) ?? [];
    lines.push({ amount: row.amount, invoice: {
      id: row.invoice_id, date: row.invoice_date, customerId: row.customer_id, invoiceNumber: row.invoice_number,
      invoiceSeries: row.invoice_series, documentNumber: row.document_number, amount: row.invoice_amount,
      sourceFile: row.source_file,
    } });
    linesByAllocation.set(row.allocation_id, lines);
  }
  const allocations = db.prepare(`SELECT a.*, v.date rev_date, v.reason rev_reason, v.created_at rev_at
    FROM allocations a LEFT JOIN reversals v ON v.allocation_id = a.id ORDER BY a.position`).all().map((row) => ({
    id: row.id, receiptId: row.receipt_id, date: row.date, createdAt: row.created_at,
    lines: linesByAllocation.get(row.id) ?? [], ...withReversal(row),
  }));
  return { revision, receipts, allocations };
}

function setRevision(db, revision, stamp) {
  db.prepare(`INSERT INTO receipt_ledger VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, updated_at=excluded.updated_at`).run(revision, stamp);
}

function ledgerWriter(db) {
  const receipt = db.prepare('INSERT INTO receipts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const allocation = db.prepare('INSERT INTO allocations VALUES (?, ?, ?, ?, ?)');
  const line = db.prepare('INSERT INTO allocation_lines VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const reversal = db.prepare('INSERT INTO reversals VALUES (?, ?, ?, ?, ?)');
  return {
    receipt(item, i) {
      receipt.run(item.id, i, item.number, item.date, item.customerId, item.customerName, item.customerCode,
        item.amount, item.reference, item.createdAt);
    },
    allocation(item, i) {
      allocation.run(item.id, i, item.receiptId, item.date, item.createdAt);
      item.lines.forEach(({ invoice, amount }, index) => line.run(item.id, index, amount, invoice.id, invoice.date,
        invoice.customerId, invoice.invoiceNumber, invoice.invoiceSeries, invoice.documentNumber, invoice.amount, invoice.sourceFile));
    },
    reversal(kind, id, item) {
      reversal.run(kind === 'receipt' ? id : null, kind === 'allocation' ? id : null,
        item.date, item.reason, item.createdAt);
    },
  };
}

function clearLedger(db) { db.exec('DELETE FROM receipts; DELETE FROM receipt_ledger;'); }

function writeLedger(db, data, stamp) {
  clearLedger(db);
  const writer = ledgerWriter(db);
  for (const [field, kind] of [['receipts', 'receipt'], ['allocations', 'allocation']]) {
    data[field].forEach((item, index) => {
      writer[kind](item, index);
      if (item.reversal) writer.reversal(kind, item.id, item.reversal);
    });
  }
  setRevision(db, data.revision, stamp);
}

// Thao tác trên sổ thu chỉ được thêm dòng mới hoặc thêm đảo phiếu. Sửa, xóa hay đổi thứ tự
// dòng cũ sẽ không được lưu, nên báo lỗi thay vì "lưu thành công" mà dữ liệu không đổi.
function assertAppendOnly(before, after) {
  for (const field of ['receipts', 'allocations']) {
    if (after[field].length < before[field].length) throw new Error('Không được xóa dòng trong sổ đối soát.');
    before[field].forEach((item, index) => {
      const next = after[field][index];
      if (next.id !== item.id || next.amount !== item.amount || next.date !== item.date ||
          (item.reversal && next.reversal?.date !== item.reversal.date))
        throw new Error('Không được sửa dòng đã ghi trong sổ đối soát.');
    });
  }
}

function applyLedgerChange(db, before, after, revision, stamp) {
  assertAppendOnly(before, after);
  const writer = ledgerWriter(db);
  for (const [field, kind] of [['receipts', 'receipt'], ['allocations', 'allocation']]) {
    after[field].forEach((item, index) => {
      const original = before[field][index];
      if (!original) writer[kind](item, index);
      if (item.reversal && !original?.reversal) writer.reversal(kind, item.id, item.reversal);
    });
  }
  setRevision(db, revision, stamp);
}

function stamp(db, key) {
  const table = key === SALE ? 'sales_book' : 'receipt_ledger';
  const row = db.prepare('SELECT updated_at FROM ' + table + ' WHERE id = 1').get();
  return row ? '1:' + row.updated_at : null;
}

const clean = (value) => (typeof value === 'string' ? value.toWellFormed() : value ?? null);

// Những gì quyết định số tiền và cách khớp chứng từ. Dùng để so khi bảng mới không giữ được
// nguyên văn khối JSON cũ (trường lạ do bản cũ ghi thêm, ký tự Unicode lỗi...).
function moneyView(key, data) {
  if (key === SALE) {
    return data.rows.map((row) => [row.rowNumber, clean(row.date), clean(row.documentNumber),
      clean(row.invoiceNumber), clean(row.customerName), clean(row.source?.customerCode),
      clean(row.source?.invoiceSeries), clean(row.source?.invoiceDate), clean(row.source?.postingDate),
      clean(row.source?.debitAccount), clean(row.quantity), clean(row.unitPrice), clean(row.salesAmount),
      clean(row.paymentTotal)]);
  }
  return [clean(data.revision),
    data.receipts.map((item) => [clean(item.id), clean(item.number), clean(item.date), clean(item.customerId),
      clean(item.customerCode), item.amount, clean(item.reversal?.date)]),
    data.allocations.map((item) => [clean(item.id), clean(item.receiptId), clean(item.date), clean(item.reversal?.date),
      item.lines.map((line) => [line.amount, clean(line.invoice.id), line.invoice.amount, clean(line.invoice.date),
        clean(line.invoice.documentNumber)])])];
}

const isoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

// Mã hóa đơn kiểu cũ [mã khách, số chứng từ] thành [mã khách, số chứng từ, năm], cùng quy tắc với
// migrateReceiptLedger trong src/domain, để bảng allocation_lines chỉ chứa mã kiểu mới.
function normalizeLegacyInvoiceIds(ledger) {
  let changed = false;
  const allocations = ledger.allocations.map((allocation) => {
    let lineChanged = false;
    const lines = allocation.lines.map((line) => {
      let parts;
      try { parts = JSON.parse(line.invoice.id); } catch { return line; }
      if (!Array.isArray(parts) || parts.length !== 2 || !parts.every((part) => typeof part === 'string') ||
          !isoDate(line.invoice.date)) return line;
      lineChanged = true;
      return { ...line, invoice: { ...line.invoice, id: JSON.stringify([parts[0], parts[1], line.invoice.date.slice(0, 4)]) } };
    });
    if (!lineChanged) return allocation;
    changed = true;
    return { ...allocation, lines };
  });
  return changed ? { ...ledger, allocations } : ledger;
}

// Giữ nguyên văn khối JSON cũ khi bảng mới không chép lại được y hệt, để không mất gì.
function keepLegacy(db, row, reason) {
  db.exec(`CREATE TABLE IF NOT EXISTS legacy_books (dataset_key TEXT PRIMARY KEY, version INTEGER NOT NULL,
    payload_json TEXT NOT NULL, updated_at TEXT NOT NULL, kept_at TEXT NOT NULL, reason TEXT NOT NULL)`);
  db.prepare('INSERT OR REPLACE INTO legacy_books VALUES (?, ?, ?, ?, ?, ?)')
    .run(row.dataset_key, row.version, row.payload_json, row.updated_at, new Date().toISOString(), reason);
}

function migrateBooks(db) {
  schema(db);
  for (const [key, validate, write, read] of [
    [SALE, isValidSalesBook, writeSales, readSales],
    [LEDGER, isValidReceiptLedger, writeLedger, readLedger],
  ]) {
    const row = db.prepare('SELECT * FROM app_datasets WHERE dataset_key = ?').get(key);
    if (!row) continue;
    let data;
    try { data = JSON.parse(row.payload_json); } catch {
      throw new Error('Không đọc được sổ đã lưu để nâng cấp: ' + key);
    }
    if (data === null) {
      // Bản cũ cũng không đọc được sổ rỗng kiểu này; cất lại nguyên văn và coi như chưa có sổ.
      keepLegacy(db, row, 'Sổ trống (null) ở bản cũ');
      db.prepare('DELETE FROM app_datasets WHERE dataset_key = ?').run(key);
      continue;
    }
    if (row.version !== 1 || !validate(data)) throw new Error('Không thể nâng cấp sổ không hợp lệ: ' + key);
    const expected = key === LEDGER ? normalizeLegacyInvoiceIds(data) : data;
    write(db, expected, row.updated_at);
    const stored = read(db);
    // So từng dòng và từng số tiền, kể cả đảo phiếu và thứ tự, trước khi bỏ bản JSON.
    if (!isDeepStrictEqual(stored, expected)) {
      if (JSON.stringify(moneyView(key, stored)) !== JSON.stringify(moneyView(key, expected)))
        throw new Error('Dữ liệu hoặc số tiền sổ bị lệch sau khi nâng cấp: ' + key);
      keepLegacy(db, row, 'Bảng mới không giữ được nguyên văn (trường thêm hoặc ký tự lỗi); số tiền đã khớp');
    } else if (expected !== data) {
      keepLegacy(db, row, 'Đã chuẩn hóa mã hóa đơn kiểu cũ của phân bổ');
    }
    db.prepare('DELETE FROM app_datasets WHERE dataset_key = ?').run(key);
  }
}

// Chứng từ (số và năm hạch toán) đang có phân bổ còn hiệu lực. MISA đánh lại số mỗi năm nên
// khóa theo cả năm; năm lấy từ khóa hóa đơn và ngày hóa đơn (bản sao của allocatedDocumentNumbers).
function allocatedDocuments(db) {
  const documents = new Map();
  const rows = db.prepare(`SELECT DISTINCT l.document_number, l.invoice_id, l.invoice_date FROM allocation_lines l
    LEFT JOIN reversals v ON v.allocation_id = l.allocation_id
    WHERE v.allocation_id IS NULL ORDER BY l.document_number`).all();
  for (const { document_number: documentNumber, invoice_id: id, invoice_date: date } of rows) {
    const years = new Set([date.slice(0, 4)]);
    try {
      const year = JSON.parse(id)[2];
      if (typeof year === 'string' && /^\d{4}$/.test(year)) years.add(year);
    } catch { /* Khóa kiểu cũ: chỉ dựa vào ngày hóa đơn. */ }
    for (const year of years) documents.set(JSON.stringify([documentNumber, year]), { documentNumber, year });
  }
  return [...documents.values()];
}

module.exports = { SALE, LEDGER, migrateBooks, readSales, readLedger, clearSales, clearLedger, writeSales, writeLedger,
  applyLedgerChange, stamp, ledgerRevision, salesMetadata, salesLine, salesPage, allocatedDocuments };
