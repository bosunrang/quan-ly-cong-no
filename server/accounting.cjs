const { createHmac, randomBytes, randomUUID } = require('node:crypto');
const { DATASET_KEYS } = require('../electron/database.cjs');
const { SALE, LEDGER } = require('../electron/books.cjs');
const { activityEntry, canOpen, fail } = require('./access.cjs');
const { isValidSalesBook } = require('../src/domain/settings/business-data.rules.mjs');
const domain = require('./domain.cjs');

const small = 64 * 1024;
const large = 64 * 1024 * 1024;
const opts = (pages, maxBodyBytes = 0) => ({ pages, maxBodyBytes });
const normalize = domain.normalizeVietnamese;
const docOrder = new Intl.Collator('vi-VN', { numeric: true });

function paging(query, defaultSize = 20) {
  const positive = (value, fallback, max) => {
    if (value === null) return fallback;
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(+value) || +value < 1 || +value > max)
      fail(400, 'Thông số phân trang không hợp lệ.');
    return +value;
  };
  return { page: positive(query.get('page'), 1, 1_000_000), limit: positive(query.get('limit'), defaultSize, 100) };
}

function pageOf(items, query, size) {
  const { page: requested, limit } = paging(query, size);
  const page = Math.min(requested, Math.max(1, Math.ceil(items.length / limit)));
  return { items: items.slice((page - 1) * limit, page * limit), total: items.length, page, limit };
}

const customerSummary = ({ documents, ...item }) => ({ ...item, documentCount: documents.length });
const documentSummary = ({ lines, ...item }) => item;
const find = (items, id, label) => items.find((item) => item.id === id) ?? fail(404, 'Không tìm thấy ' + label + '.');
const search = (query) => normalize(query.get('q') ?? '');

function period(query) {
  const from = query.get('from');
  const through = query.get('through');
  if (!domain.isIsoDate(from) || !domain.isIsoDate(through) || from > through)
    fail(400, 'Khoảng ngày không hợp lệ.');
  return [from, through];
}

// Lỗi có mã (400 dữ liệu nhập sai, 404, 409...) giữ nguyên; lỗi lập trình (TypeError...) để thành
// 500 và được ghi log; còn lại là xung đột nghiệp vụ với sổ hiện tại (409).
const programmingErrors = [TypeError, ReferenceError, RangeError, SyntaxError];
function domainChange(action) {
  try { return action(); }
  catch (error) {
    if (error.status || programmingErrors.some((type) => error instanceof type)) throw error;
    fail(409, error.message);
  }
}

function salesPreview(body) {
  const { book, duplicateOf = [], customerAddresses = [] } = body;
  if (!isValidSalesBook(book) || !book.rows.length ||
      new Set(book.rows.map(({ rowNumber }) => rowNumber)).size !== book.rows.length ||
      !Array.isArray(duplicateOf) || duplicateOf.some((pair) => !Array.isArray(pair) ||
        !Number.isSafeInteger(pair[0]) || !Number.isSafeInteger(pair[1])) ||
      !Array.isArray(customerAddresses) || customerAddresses.some((pair) => !Array.isArray(pair) ||
        !Number.isSafeInteger(pair[0]) || typeof pair[1] !== 'string'))
    fail(400, 'Dữ liệu xem trước MISA không hợp lệ.');
  return { book, duplicateOf: new Map(duplicateOf), customerAddresses: new Map(customerAddresses) };
}

function registerAccountingRoutes(router, db) {
  const previewSecret = randomBytes(32);
  // Reuse decoded SQLite rows on this server until the corresponding book changes.
  const bookReader = (key, decode) => {
    let current;
    const read = () => {
      const stamp = db.datasetStamp(key);
      if (!current || current.stamp !== stamp) current = { stamp, value: decode(db.readDataset(key)?.data) };
      return current.value;
    };
    read.peek = () => current;
    read.remember = (stamp, value) => { current = { stamp, value }; };
    return read;
  };
  const sales = bookReader(SALE, (data) => data ?? null);
  const ledger = bookReader(LEDGER, (data) => domain.migrateReceiptLedger(data ?? domain.emptyReceiptLedger));
  const customers = () => db.readDataset(DATASET_KEYS.customers)?.data ?? [];
  const employees = () => db.readDataset(DATASET_KEYS.employees)?.data ?? [];
  // Danh mục đọc lại mỗi lần (nhỏ); khóa nội dung dùng để biết kết quả đã dựng còn dùng được không.
  function catalog() {
    const directory = customers();
    const staff = employees();
    return { directory, staff, key: JSON.stringify([directory, staff]) };
  }

  // Dựng sổ theo khách hàng là bước tốn nhất (đọc toàn bộ dòng bán hàng). Chỉ dựng lại khi sổ
  // hoặc danh mục đổi; tìm hóa đơn cho khoản thu, biên bản và trang công nợ dùng chung kết quả.
  let lastGroups;
  function groupsFor(book, current) {
    if (!lastGroups || lastGroups.book !== book || lastGroups.key !== current.key) {
      lastGroups = { book, key: current.key,
        groups: domain.buildSalesReceivables(book?.rows ?? [], current.directory, current.staff) };
    }
    return lastGroups.groups;
  }
  function sourcesFor(book, receipt, current = catalog()) {
    return book ? domain.receiptInvoiceSourcesFromGroups(groupsFor(book, current), book.fileName, receipt) : [];
  }

  // Nhóm khách tính đến một ngày chốt chỉ phụ thuộc sổ bán hàng và danh mục, không phụ thuộc sổ thu:
  // ghi khoản thu hay phân bổ không phải dựng lại. Nếu ngày chốt bao trọn sổ thì dùng luôn nhóm đầy đủ.
  const throughGroups = new Map();
  function groupsThrough(book, current, through) {
    const rows = domain.salesRowsThrough(book?.rows ?? [], through);
    if (rows.length === (book?.rows.length ?? 0)) return groupsFor(book, current);
    const cached = throughGroups.get(through);
    if (cached && cached.book === book && cached.key === current.key) return cached.groups;
    const groups = domain.buildSalesReceivables(rows, current.directory, current.staff);
    throughGroups.delete(through);
    throughGroups.set(through, { book, key: current.key, groups });
    while (throughGroups.size > 6) throughGroups.delete(throughGroups.keys().next().value);
    return groups;
  }

  let lastView;
  function projected() {
    const book = sales();
    const data = ledger();
    const groups = groupsFor(book, catalog());
    if (!lastView || lastView.groups !== groups || lastView.data !== data)
      lastView = { groups, data, result: domain.projectReceiptReceivables(groups, book?.fileName ?? '', data) };
    return lastView.result;
  }

  // Nhớ vài kỳ Dashboard gần nhất: nhiều người xem các kỳ khác nhau không phải tính lại liên tục.
  const summaries = new Map();
  function summary(query) {
    const book = sales();
    const data = ledger();
    const current = catalog();
    const [from, through] = period(query);
    const key = JSON.stringify([current.key, from, through]);
    const cached = summaries.get(key);
    if (cached && cached.book === book && cached.data === data) {
      summaries.delete(key);
      summaries.set(key, cached);
      return cached.result;
    }
    const result = domain.buildDashboardSummary(book, data, current.directory, current.staff, from, through,
      groupsThrough(book, current, through));
    summaries.delete(key);
    summaries.set(key, { book, data, result });
    while (summaries.size > 12) summaries.delete(summaries.keys().next().value);
    return result;
  }

  router.get('/api/sales-book', ({ query }) => {
    const { page, limit } = paging(query, 25);
    const book = db.salesMetadata() ?? null;
    const needle = search(query);
    const match = needle ? (...fields) => Number(normalize(fields.join(' ')).includes(needle)) : null;
    const result = db.salesPage(match, page, limit);
    return { book, ...result, limit };
  }, opts(['misa']));
  router.get('/api/sales-book/status', () => db.salesMetadata() ?? null,
    opts(['misa', 'reports', 'payments']));

  function plan(body, saved) {
    const source = salesPreview(body);
    if (body.mode === 'supplement') {
      if (!saved) fail(409, 'Chưa có sổ bán hàng MISA để bổ sung khách hàng.');
      const { book, ...counts } = domainChange(() => domain.planMisaCustomerSupplement(saved, source, customers()));
      return { book, counts };
    }
    if (body.mode !== 'import') fail(400, 'Chế độ nhập MISA không hợp lệ.');
    const { book, issues, missing, ...counts } = domain.planMisaSalesImport(saved, source, {
      applyChanges: body.applyChanges === true, removeMissing: body.removeMissing === true,
      allocatedDocuments: db.allocatedDocuments(),
    });
    const { rows, ...missingCounts } = missing;
    return { book, missingRows: rows, counts: { ...counts, issues: [...issues],
      missing: { ...missingCounts, rowCount: rows.length,
        total: rows.reduce((sum, row) => sum + (row.paymentTotal ?? 0), 0) } } };
  }

  function previewToken(body, result) {
    return createHmac('sha256', previewSecret).update(JSON.stringify([
      db.datasetStamp(SALE), db.datasetStamp(LEDGER), body.mode,
      body.applyChanges === true, body.removeMissing === true, body.book, body.duplicateOf, body.customerAddresses,
      body.mode === 'supplement' ? result.counts : null,
    ])).digest('hex');
  }

  // Giữ danh sách "dòng không còn trong tệp" của vài bản xem trước gần nhất theo mã xem trước,
  // để chuyển trang hay tìm kiếm không phải gửi lại cả tệp Excel và tính lại kế hoạch nhập.
  const previews = new Map();
  const PREVIEW_TTL = 30 * 60 * 1000;
  const bookStamps = () => JSON.stringify([db.datasetStamp(SALE), db.datasetStamp(LEDGER)]);
  router.post('/api/sales-imports/preview', ({ body }) => {
    const result = plan(body, sales());
    const token = previewToken(body, result);
    if (result.missingRows) {
      const now = Date.now();
      for (const [key, item] of previews) if (item.expires <= now) previews.delete(key);
      previews.delete(token);
      previews.set(token, { rows: result.missingRows, stamps: bookStamps(), expires: now + PREVIEW_TTL });
      while (previews.size > 4) previews.delete(previews.keys().next().value);
    }
    return { ...result.counts, token };
  }, opts(['misa'], large));
  router.post('/api/sales-imports/missing', ({ body, query }) => {
    if (typeof body.token !== 'string') fail(400, 'Thiếu mã bản xem trước.');
    const saved = previews.get(body.token);
    if (!saved || saved.expires <= Date.now()) fail(409, 'Bản xem trước đã hết hạn. Hãy chọn lại tệp MISA.');
    if (saved.stamps !== bookStamps()) fail(409, 'Sổ vừa thay đổi. Hãy xem lại bản xem trước.');
    const needle = search(query);
    const rows = saved.rows.filter((row) =>
      normalize([row.documentNumber, row.invoiceNumber, row.customerName, row.productName].join(' ')).includes(needle));
    return pageOf(rows, query, 25);
  }, opts(['misa'], small));
  router.post('/api/sales-imports', ({ body, account }) => {
    let counts;
    const book = db.changeSales((saved, changeDirectory) => {
      const planned = plan(body, saved);
      if (body.token !== previewToken(body, planned))
        fail(409, 'Sổ hoặc danh mục vừa thay đổi. Hãy xem lại bản xem trước.');
      counts = planned.counts;
      const supplement = body.mode === 'supplement';
      if (supplement && counts.additions.length) {
        changeDirectory((tx) => {
          let order = tx.customerOrder(false);
          for (const draft of counts.additions) {
            const now = new Date().toISOString();
            tx.insertCustomer({ ...draft, id: randomUUID(), taxCode: '', status: 'active',
              updatedAt: now, createdAt: now }, order++);
          }
        });
      }
      const changed = supplement ? counts.linkedRows > 0 : counts.hasChanges;
      const importedAt = new Date(Math.max(Date.now(), (Date.parse(saved?.importedAt ?? '') || 0) + 1)).toISOString();
      return {
        book: changed ? { ...planned.book, importedAt } : null,
        audit: changed || counts.additions?.length ? activityEntry(account, 'data',
          supplement ? 'Bổ sung khách hàng từ MISA' : 'Nhập sổ bán hàng MISA',
          planned.book.fileName + ' · ' + (supplement ? counts.additions.length + ' khách hàng' : counts.addedCount + ' dòng')) : undefined,
      };
    });
    return { book, counts };
  }, opts(['misa'], large));

  router.get('/api/dashboard', ({ query }) => {
    const { receivables, periodReceipts, unallocatedReceipts, ...totals } = summary(query);
    const view = query.get('view');
    const q = search(query);
    const rows = view === 'period' ? periodReceipts : view === 'unallocated' ? unallocatedReceipts :
      receivables.filter((item) => normalize(item.name + ' ' + item.customerCode).includes(q)).map(customerSummary);
    return { ...totals, receivablesCount: receivables.length, periodCount: periodReceipts.length,
      unallocatedCount: unallocatedReceipts.length, rows: pageOf(rows, query, 10) };
  }, opts(['dashboard']));

  router.get('/api/receivables', ({ query }) => {
    const book = sales();
    const data = projected();
    const people = new Map();
    const provinces = new Set();
    const q = search(query);
    const employee = query.get('employee');
    const province = query.get('province');
    const missing = '?';
    const filtered = data.customers.filter((item) =>
      (!employee || employee === (item.employeeId || missing)) &&
      (!province || province === (item.province || missing)) &&
      normalize(item.name + ' ' + item.customerCode).includes(q));
    for (const item of data.customers) {
      if (item.employeeId) people.set(item.employeeId, item.employeeName);
      if (item.province) provinces.add(item.province);
    }
    return {
      hasBook: Boolean(book?.rows.length), fileName: book?.fileName ?? "",
      unmatchedAllocationCount: data.unmatchedCount,
      missingTotalCount: filtered.reduce((sum, item) => sum + item.missingTotalCount, 0),
      filterOptions: {
        employees: [...people].sort((a, b) => a[1].localeCompare(b[1], 'vi')),
        provinces: [...provinces].sort((a, b) => a.localeCompare(b, 'vi')),
        unmatchedCount: data.customers.filter((item) => !item.catalogMatch).length,
      },
      rows: pageOf(filtered.map(customerSummary), query),
    };
  }, opts(['receivables']));

  function invoiceGroup(account, query, id) {
    if (query.get('through')) {
      if (!canOpen(account, 'dashboard')) fail(403, 'Cần thẻ Dashboard.');
      return find(summary(query).receivables, id, 'khách hàng tại ngày chốt');
    }
    if (!canOpen(account, 'receivables')) fail(403, 'Cần thẻ Công nợ phải thu.');
    return find(projected().customers, id, 'khách hàng');
  }
  const invoices = '/api/receivables/:customerId/invoices';
  router.get(invoices, ({ query, params, account }) => {
    const group = invoiceGroup(account, query, params.customerId);
    const q = search(query);
    const rows = group.documents.filter((item) =>
      normalize([item.invoiceNumber, item.invoiceSeries, ...item.documentNumbers].join(' ')).includes(q));
    return pageOf(rows.map(documentSummary), query);
  }, opts(['receivables', 'dashboard']));
  router.get(invoices + '/:documentId', ({ query, params, account }) =>
    find(invoiceGroup(account, query, params.customerId).documents, params.documentId, 'chứng từ'),
  opts(['receivables', 'dashboard']));
  router.get('/api/reports/statements/:customerId', ({ query, params }) => {
    const book = sales();
    if (!book) return null;
    const current = catalog();
    const customer = find(current.directory, params.customerId, 'khách hàng');
    // Biên bản chỉ cần dòng bán hàng của đúng khách này (đã gom sẵn), giữ nguyên thứ tự trong sổ.
    const group = groupsFor(book, current).find((item) => item.customerId === customer.id);
    const lines = new Set(group?.documents.flatMap((document) => document.lines) ?? []);
    const own = { ...book, rows: book.rows.filter((row) => lines.has(row)) };
    return domain.buildReceivableStatement(own, ledger(), current.directory, customer, ...period(query));
  }, opts(['reports']));

  function receiptRows(data, query) {
    const allocated = domain.totalsByReceipt(data);
    const needle = search(query);
    const status = query.get('status') || 'active';
    return data.receipts.map((receipt) => {
      const remaining = receipt.reversal ? 0 : receipt.amount - (allocated.get(receipt.id) ?? 0);
      const state = receipt.reversal ? 'reversed' : remaining === 0 ? 'closed' : remaining === receipt.amount ? 'open' : 'partial';
      return { receipt, remaining, state };
    }).filter(({ receipt, state, remaining }) =>
      (status === 'active' ? state !== 'reversed' : status === 'open' ? remaining > 0 : status === state) &&
      normalize([receipt.number, receipt.customerName, receipt.customerCode, receipt.reference].join(' ')).includes(needle))
      .sort((a, b) => b.receipt.date.localeCompare(a.receipt.date) || b.receipt.createdAt.localeCompare(a.receipt.createdAt));
  }
  router.get('/api/receipts', ({ query }) => {
    const data = ledger();
    return { ...pageOf(receiptRows(data, query), query), count: data.receipts.length };
  }, opts(['payments']));
  router.get('/api/receipts/next-number', ({ query }) => {
    const date = query.get('date');
    if (!domain.isIsoDate(date)) fail(400, 'Ngày hạch toán không hợp lệ.');
    return domain.nextReceiptNumber(ledger().receipts, date);
  }, opts(['payments']));
  router.get('/api/receipts/:id', ({ params }) => {
    const data = ledger();
    const receipt = find(data.receipts, params.id, 'khoản thu');
    const book = sales();
    return { receipt, allocated: domain.receiptAllocated(data, receipt.id), revision: data.revision,
      bookStamp: db.datasetStamp(SALE),
      hasInvoices: Boolean(!receipt.reversal && sourcesFor(book, receipt).length),
      allocations: data.allocations.filter((item) => item.receiptId === receipt.id).reverse() };
  }, opts(['payments']));

  function candidates(id) {
    const data = ledger();
    const receipt = find(data.receipts, id, 'khoản thu');
    const sources = sourcesFor(sales(), receipt);
    const index = domain.activeInvoiceAllocations(data);
    const reference = receipt.reference.trim().toUpperCase();
    const matching = sources.filter(({ invoice }) => reference &&
      [invoice.invoiceNumber, invoice.documentNumber].some((number) => number.toUpperCase() === reference));
    const rows = sources.map((source) => ({ ...source, ...domain.invoiceBalance(data, source.invoice, index),
      suggested: matching.length === 1 && matching[0].invoice.id === source.invoice.id }));
    return { data, receipt, rows };
  }
  const candidatePath = '/api/receipts/:id/candidates';
  const withoutDocument = ({ document, ...item }) => item;
  router.get(candidatePath, ({ query, params }) => {
    const { rows } = candidates(params.id);
    const q = search(query);
    const list = rows.filter(({ invoice, remaining, changed }) => (remaining > 0 || changed) &&
      normalize([invoice.invoiceNumber, invoice.invoiceSeries, invoice.documentNumber].join(' ')).includes(q))
      .sort((a, b) => b.invoice.date.localeCompare(a.invoice.date) || docOrder.compare(b.invoice.documentNumber, a.invoice.documentNumber));
    return pageOf(list.map(withoutDocument), query);
  }, opts(['payments']));
  router.get(candidatePath + '/matches', ({ query, params }) => {
    const { data, receipt, rows } = candidates(params.id);
    const date = query.get('date');
    const today = domain.todayLocal();
    if (!domain.isIsoDate(date) || date < receipt.date || date > today) fail(400, 'Ngày phân bổ không hợp lệ.');
    const remaining = receipt.amount - domain.receiptAllocated(data, receipt.id);
    if (date < today && domain.receiptAvailableOn(data, receipt, date) < remaining)
      return { unavailable: true, matches: [], incomplete: false };
    const list = rows.filter((item) => !item.changed && item.remaining > 0 && item.remaining <= remaining &&
      item.invoice.date <= date && (date === today || domain.invoiceAvailableOn(data, item.invoice, date) >= item.remaining))
      .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.invoice.date.localeCompare(b.invoice.date));
    const groups = domain.findReceiptMatches(list.map(withoutDocument), remaining);
    return { ...groups, unavailable: false };
  }, opts(['payments']));
  router.get(candidatePath + '/:invoiceId', ({ params }) => {
    const item = candidates(params.id).rows.find(({ invoice }) => invoice.id === params.invoiceId);
    if (!item) fail(404, 'Không tìm thấy chứng từ.');
    return { ...item.document, balance: item.changed ? null : { received: item.received, remaining: item.remaining },
      allocationMismatch: item.changed };
  }, opts(['payments']));

  function apply(account, operation, work) {
    // Dùng sổ đã giải mã nếu chưa đổi; sau khi ghi, giữ luôn bản mới để lần đọc sau không phải giải mã lại.
    const revision = db.changeLedger((before) => {
      const result = domainChange(() => work(domain.migrateReceiptLedger(before)));
      return { after: result.after, audit: activityEntry(account, 'payments', operation, result.detail) };
    }, { ...ledger.peek(), onWrite: ledger.remember });
    return revision;
  }
  const text = (value, max) => typeof value === 'string' && value.length <= max;
  const requestId = /^[A-Za-z0-9_-]{8,64}$/;
  router.post('/api/receipts', ({ body, account }) => {
    const { id, customerId, customerCode, number, date, amount, reference } = body;
    if (typeof id !== 'string' || !requestId.test(id) || !text(reference, 500) ||
        (number !== undefined && !text(number, 64)))
      fail(400, 'Thông tin khoản thu không hợp lệ.');
    // Gửi lại cùng mã (bấm hai lần, lỗi mạng): trả kết quả cũ, không ghi thêm khoản thu.
    const same = (receipt) => receipt.customerId === customerId && receipt.amount === amount && receipt.date === date;
    const existing = ledger().receipts.find((receipt) => receipt.id === id);
    if (existing) {
      if (!same(existing)) fail(409, 'Mã khoản thu đã được dùng cho khoản thu khác.');
      return ledger().revision;
    }
    return apply(account, 'Ghi khoản thu', (current) => {
      if (current.receipts.some((receipt) => receipt.id === id)) fail(409, 'Khoản thu này đã được ghi.');
      const customer = find(customers(), customerId, 'khách hàng');
      if (customer.misaCode !== customerCode) fail(409, 'Mã khách hàng vừa thay đổi.');
      const after = domain.recordReceipt(current, customer, { id, number, date, amount, reference });
      return { after, detail: after.receipts.at(-1).number + ' · ' + customer.name };
    });
  }, opts(['payments'], small));
  router.post('/api/receipts/:id/allocations', ({ body, params, account }) => {
    if (!Array.isArray(body.lines) || !body.lines.length || body.lines.some((line) => typeof line?.invoice?.id !== 'string'))
      fail(400, 'Danh sách phân bổ không hợp lệ.');
    return apply(account, 'Lưu phân bổ', (current) => {
      const receipt = find(current.receipts, params.id, 'khoản thu');
      const book = sales();
      if (!book || body.bookStamp !== db.datasetStamp(SALE) || body.revision !== current.revision)
        fail(409, 'Sổ bán hàng hoặc phân bổ vừa thay đổi. Hãy mở lại phân bổ.');
      const lookup = new Map(sourcesFor(book, receipt).map(({ invoice }) => [invoice.id, invoice]));
      const lines = body.lines.map(({ invoice, amount }) => {
        const candidate = lookup.get(invoice.id);
        if (!candidate || !domain.sameInvoice(candidate, invoice)) fail(409, 'Chứng từ MISA đã thay đổi.');
        return { invoice: candidate, amount };
      });
      return { after: domain.allocateReceipt(current, receipt.id, body.date, lines),
        detail: receipt.number + ' · ' + lines.length + ' chứng từ' };
    });
  }, opts(['payments'], 1024 * 1024));
  for (const [path, label, change] of [
    ['/api/receipts/:id/reversal', 'Hủy khoản thu', domain.reverseReceipt],
    ['/api/allocations/:id/reversal', 'Hoàn tác phân bổ', domain.reverseAllocation],
  ]) router.post(path, ({ body, params, account }) => {
    if (!text(body.reason, 500)) fail(400, 'Nhập lý do hoàn tác (tối đa 500 ký tự).');
    if (typeof body.revision !== 'string') fail(400, 'Thiếu phiên bản sổ đối soát.');
    return apply(account, label, (current) => {
      // Hủy theo đúng sổ người dùng đang xem: nếu người khác vừa phân bổ hay hủy thì phải mở lại.
      if (body.revision !== current.revision) fail(409, 'Sổ đối soát vừa thay đổi. Hãy mở lại khoản thu.');
      return { after: change(current, params.id, body.date, body.reason), detail: body.date + ' · ' + body.reason };
    });
  }, opts(['payments'], small));
}

module.exports = { registerAccountingRoutes };
