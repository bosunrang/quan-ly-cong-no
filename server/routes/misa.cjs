// Sổ bán hàng MISA: xem sổ, xem trước và xác nhận nhập lại, bổ sung khách hàng.
const { createHmac, randomBytes, randomUUID } = require('node:crypto');
const { SALE, LEDGER } = require('../books.cjs');
const { activityEntry, fail } = require('../access.cjs');
const { isValidSalesBook } = require('../../src/domain/settings/business-data.rules.mjs');
const domain = require('../domain.cjs');
const { small, large, opts, normalize, paging, pageOf, search, domainChange } = require('./helpers.cjs');

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

function salesChange(book, saved, account, action, description) {
  const importedAt = new Date(Math.max(Date.now(), (Date.parse(saved?.importedAt ?? '') || 0) + 1)).toISOString();
  return { book: { ...book, importedAt }, audit: activityEntry(account, 'data', action, book.fileName + ' · ' + description) };
}

function register(router, db, state) {
  const { sales, customers } = state;
  const previewSecret = randomBytes(32);
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

  const bookStamps = () => JSON.stringify([db.datasetStamp(SALE), db.datasetStamp(LEDGER)]);
  function previewToken(body, result, accountId, stamps) {
    return createHmac('sha256', previewSecret).update(JSON.stringify([
      stamps, accountId, body.mode,
      body.applyChanges === true, body.removeMissing === true, body.book, body.duplicateOf, body.customerAddresses,
      body.mode === 'supplement' ? result.counts : null,
    ])).digest('hex');
  }

  // Giữ một số bản xem trước để xem dòng bị gỡ và lưu theo đúng kế hoạch đã tính.
  const previews = new Map();
  const PREVIEW_TTL = 30 * 60 * 1000;
  function readPreview(token, account) {
    if (typeof token !== 'string') fail(400, 'Thiếu mã bản xem trước.');
    const saved = previews.get(token);
    if (!saved || saved.accountId !== account.id || saved.expires <= Date.now())
      fail(409, 'Bản xem trước đã hết hạn. Hãy xem lại bản xem trước.');
    return saved;
  }
  const checkStamps = (stamps) => {
    if (stamps !== bookStamps()) fail(409, 'Sổ vừa thay đổi. Hãy xem lại bản xem trước.');
  };

  router.post('/api/sales-imports/preview', ({ body, account }) => {
    const stamps = bookStamps();
    const result = plan(body, sales());
    checkStamps(stamps);
    const token = previewToken(body, result, account.id, stamps);
    if (result.missingRows) {
      const now = Date.now();
      for (const [key, item] of previews) if (item.expires <= now || item.stamps !== stamps) previews.delete(key);
      previews.delete(token);
      previews.set(token, { accountId: account.id, stamps, expires: now + PREVIEW_TTL,
        rows: result.missingRows, book: result.counts.hasChanges ? result.book : null,
        addedCount: result.counts.addedCount });
      while (previews.size > 4) previews.delete(previews.keys().next().value);
    }
    return { ...result.counts, token };
  }, opts(['misa'], large));
  router.post('/api/sales-imports/missing', ({ body, query, account }) => {
    const saved = readPreview(body.token, account);
    checkStamps(saved.stamps);
    const needle = search(query);
    const rows = saved.rows.filter((row) =>
      normalize([row.documentNumber, row.invoiceNumber, row.customerName, row.productName].join(' ')).includes(needle));
    return pageOf(rows, query, 25);
  }, opts(['misa'], small));
  router.post('/api/sales-imports/confirm', ({ body, account }) => {
    const saved = readPreview(body.token, account);
    const book = db.changeSales((current) => {
      checkStamps(saved.stamps);
      return saved.book ? salesChange(saved.book, current, account, 'Nhập sổ bán hàng MISA', saved.addedCount + ' dòng') : {};
    }, { readRows: false });
    previews.delete(body.token);
    return { book };
  }, opts(['misa'], small));
  router.post('/api/sales-imports', ({ body, account }) => {
    let counts;
    const book = db.changeSales((saved, changeDirectory) => {
      const planned = plan(body, saved);
      if (body.token !== previewToken(body, planned, account.id, bookStamps()))
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
      if (!changed && !counts.additions?.length) return {};
      const record = salesChange(planned.book, saved, account,
        supplement ? 'Bổ sung khách hàng từ MISA' : 'Nhập sổ bán hàng MISA',
        supplement ? counts.additions.length + ' khách hàng' : counts.addedCount + ' dòng');
      return changed ? record : { audit: record.audit };
    });
    return { book, counts };
  }, opts(['misa'], large));
}

module.exports = { register };
