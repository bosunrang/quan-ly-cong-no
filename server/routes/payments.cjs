// Khoản thu: ghi thu, tìm hóa đơn, phân bổ, hủy và hoàn tác.
const { SALE } = require('../books.cjs');
const { activityEntry, fail } = require('../access.cjs');
const domain = require('../domain.cjs');
const { small, opts, normalize, docOrder, pageOf, find, search, domainChange } = require('./helpers.cjs');

function register(router, db, state) {
  const { sales, ledger, customers, sourcesFor } = state;
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

module.exports = { register };
