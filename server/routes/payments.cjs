// Khoản thu: ghi thu, tìm hóa đơn, phân bổ, hủy và hoàn tác.
const { SALE } = require('../books.cjs');
const { activityEntry, fail } = require('../access.cjs');
const domain = require('../domain.cjs');
const { small, opts, normalize, docOrder, pageOf, find, search, domainChange } = require('./helpers.cjs');

function allocatedInvoiceDetails(allocations, sources) {
  const active = allocations.filter((item) => !item.reversal);
  if (!active.length) return [];

  const { sameInvoice } = domain;
  const byId = new Map(sources.map((source) => [source.invoice.id, source]));
  const details = new Map();
  for (const allocation of active) {
    for (const { invoice, amount } of allocation.lines) {
      const source = byId.get(invoice.id);
      const matches = source && sameInvoice(source.invoice, invoice);
      const detail = details.get(invoice.id);
      if (detail) {
        detail.amount += amount;
        if (!matches) detail.lines = null;
        continue;
      }
      const lines = matches ? source.document.lines.map(({ rowNumber, productName, unit, quantity, unitPrice, paymentTotal }) =>
        ({ rowNumber, productName, unit, quantity, unitPrice, paymentTotal })) : null;
      details.set(invoice.id, { invoice, amount, lines });
    }
  }
  return Array.from(details.values());
}

function register(router, db, state) {
  const { sales, ledger, customers, employees, sourcesFor } = state;
  function receiptRows(data, query, directory) {
    const allocated = domain.totalsByReceipt(data);
    const assignments = new Map(directory.map((customer) =>
      [customer.id, customer.assignments.find(({ effectiveTo }) => !effectiveTo)]));
    const employeeNames = new Map(employees().map(({ id, name }) => [id, name]));
    const people = new Map();
    const needle = search(query);
    const status = query.get('status') || 'active';
    const employee = query.get('employee');
    const rows = data.receipts.map((receipt) => {
      const remaining = receipt.reversal ? 0 : receipt.amount - (allocated.get(receipt.id) ?? 0);
      const state = receipt.reversal ? 'reversed' : remaining === 0 ? 'closed' : remaining === receipt.amount ? 'open' : 'partial';
      const assignment = assignments.get(receipt.customerId);
      const employeeId = assignment?.employeeId ?? '';
      const employeeName = assignment ? employeeNames.get(employeeId) ?? assignment.employeeName : '';
      if (employeeId) people.set(employeeId, employeeName);
      return { receipt, remaining, state, employeeId, employeeName };
    }).filter(({ receipt, state, remaining, employeeId }) =>
      (!employee || employee === (employeeId || '?')) &&
      (status === 'active' ? state !== 'reversed' : status === 'open' ? remaining > 0 : status === state) &&
      normalize([receipt.number, receipt.customerName, receipt.customerCode, receipt.reference].join(' ')).includes(needle))
      .sort((a, b) => b.receipt.date.localeCompare(a.receipt.date) || b.receipt.createdAt.localeCompare(a.receipt.createdAt));
    return { rows, employees: [...people].sort((a, b) => a[1].localeCompare(b[1], 'vi')) };
  }
  router.get('/api/receipts', ({ query, scope }) => {
    const data = scope.ledger(ledger());
    const { rows, employees } = receiptRows(data, query, scope.customers(customers()));
    return { ...pageOf(rows, query), count: data.receipts.length, employees };
  }, opts(['payments']));
  router.get('/api/receipts/next-number', ({ query }) => {
    const date = query.get('date');
    if (!domain.isIsoDate(date)) fail(400, 'Ngày hạch toán không hợp lệ.');
    return domain.nextReceiptNumber(ledger().receipts, date);
  }, opts(['payments']));
  // Khoản thu cùng khách, cùng số tiền, gần ngày: hộp ghi khoản thu cảnh báo có thể ghi trùng.
  router.get('/api/receipts/similar', ({ query, scope }) => {
    const customerId = query.get('customerId') ?? '';
    const amount = Number(query.get('amount'));
    const date = query.get('date');
    scope.requireCustomer(customerId);
    if (!Number.isSafeInteger(amount) || amount <= 0 || !domain.isIsoDate(date)) fail(400, 'Thông tin khoản thu không hợp lệ.');
    return domain.similarReceipts(ledger().receipts, { customerId, amount, date }, query.get('exclude') ?? undefined)
      .map(({ id, number, date, amount, reference }) => ({ id, number, date, amount, reference }));
  }, opts(['payments']));
  router.get('/api/receipts/:id', ({ params, scope }) => {
    const data = ledger();
    const receipt = scope.receipt(data, params.id);
    const book = sales();
    const sources = receipt.reversal ? [] : sourcesFor(book, receipt);
    const allocations = data.allocations.filter((item) => item.receiptId === receipt.id).reverse();
    return { receipt, allocated: domain.receiptAllocated(data, receipt.id), revision: data.revision,
      bookStamp: db.datasetStamp(SALE),
      hasInvoices: sources.length > 0,
      allocations,
      allocatedInvoices: receipt.reversal ? [] : allocatedInvoiceDetails(allocations, sources) };
  }, opts(['payments']));

  function candidates(id, scope) {
    const data = ledger();
    const receipt = scope.receipt(data, id);
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
  // Mặc định chỉ chứng từ đến ngày hạch toán khoản thu; advance=1 khi người dùng xác nhận khách trả trước.
  const advanceOf = (query) => query.get('advance') === '1';
  router.get(candidatePath, ({ query, params, scope }) => {
    const { receipt, rows } = candidates(params.id, scope);
    const q = search(query);
    const advance = advanceOf(query);
    const open = rows.filter(({ remaining, changed }) => remaining > 0 || changed);
    const list = open.filter(({ invoice }) => (advance || invoice.date <= receipt.date) &&
      normalize([invoice.invoiceNumber, invoice.invoiceSeries, invoice.documentNumber].join(' ')).includes(q))
      .sort((a, b) => b.invoice.date.localeCompare(a.invoice.date) || docOrder.compare(b.invoice.documentNumber, a.invoice.documentNumber));
    const later = open.filter(({ invoice }) => invoice.date > receipt.date).length;
    return { ...pageOf(list.map(withoutDocument), query), later };
  }, opts(['payments']));
  router.get(candidatePath + '/matches', ({ query, params, scope }) => {
    const { data, receipt, rows } = candidates(params.id, scope);
    const date = query.get('date');
    const today = domain.todayLocal();
    if (!domain.isIsoDate(date) || date < receipt.date || date > today) fail(400, 'Ngày phân bổ không hợp lệ.');
    const remaining = receipt.amount - domain.receiptAllocated(data, receipt.id);
    if (date < today && domain.receiptAvailableOn(data, receipt, date) < remaining)
      return { unavailable: true, matches: [], nearMatches: [], incomplete: false };
    const lastInvoiceDate = advanceOf(query) ? date : receipt.date;
    const eligible = rows.filter((item) => !item.changed && item.remaining > 0 && item.invoice.date <= lastInvoiceDate)
      .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.invoice.date.localeCompare(b.invoice.date));
    const datedBalances = new Map();
    const available = (item) => {
      if (date === today) return item.remaining;
      if (!datedBalances.has(item.invoice.id))
        datedBalances.set(item.invoice.id, domain.invoiceAvailableOn(data, item.invoice, date));
      return datedBalances.get(item.invoice.id);
    };
    const exact = eligible.filter((item) => item.remaining <= remaining && available(item) >= item.remaining);
    const groups = domain.findReceiptMatches(exact.map(withoutDocument), remaining);
    const nearby = domain.findNearReceiptMatches(eligible, remaining, available);
    const nearMatches = nearby.nearMatches.map(({ difference, lines }) => ({
      difference,
      lines: lines.map(({ item, amount }) => ({ ...withoutDocument(item), amount })),
    }));
    return { ...groups, nearMatches, incomplete: groups.incomplete || nearby.incomplete, unavailable: false };
  }, opts(['payments']));
  router.get(candidatePath + '/:invoiceId', ({ params, scope }) => {
    const item = candidates(params.id, scope).rows.find(({ invoice }) => invoice.id === params.invoiceId);
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
  router.post('/api/receipts', ({ body, account, scope }) => {
    const { id, customerId, customerCode, number, date, amount, reference, allowDuplicate } = body;
    scope.requireCustomer(customerId);
    if (typeof id !== 'string' || !requestId.test(id) || !text(reference, 500) ||
        (number !== undefined && !text(number, 64)) ||
        (allowDuplicate !== undefined && typeof allowDuplicate !== 'boolean'))
      fail(400, 'Thông tin khoản thu không hợp lệ.');
    // Gửi lại cùng mã (bấm hai lần, lỗi mạng): trả kết quả cũ, không ghi thêm khoản thu.
    const same = (receipt) => receipt.customerId === customerId && receipt.amount === amount && receipt.date === date;
    const existing = ledger().receipts.find((receipt) => receipt.id === id);
    if (existing) {
      scope.requireCustomer(existing.customerId);
      if (!same(existing)) fail(409, 'Mã khoản thu đã được dùng cho khoản thu khác.');
      return ledger().revision;
    }
    return apply(account, 'Ghi khoản thu', (current) => {
      if (current.receipts.some((receipt) => receipt.id === id)) fail(409, 'Khoản thu này đã được ghi.');
      const customer = find(customers(), customerId, 'khách hàng');
      if (customer.misaCode !== customerCode) fail(409, 'Mã khách hàng vừa thay đổi.');
      // Chặn ở máy chủ (cả khi hộp thoại chưa kịp tải cảnh báo, hoặc máy khác vừa ghi cùng lúc).
      const similar = domain.similarReceipts(current.receipts, { customerId, amount, date });
      const numbers = similar.map((receipt) => receipt.number + ' (' + receipt.date.split('-').reverse().join('/') + ')').join(', ');
      if (similar.length && allowDuplicate !== true)
        fail(409, 'Khách hàng đã có khoản thu cùng số tiền trong vòng ' + domain.similarReceiptDays + ' ngày: ' + numbers +
          '. Kiểm tra lại; nếu không phải ghi trùng, tích xác nhận rồi lưu lại.');
      const after = domain.recordReceipt(current, customer, { id, number, date, amount, reference });
      return { after, detail: after.receipts.at(-1).number + ' · ' + customer.name +
        (similar.length ? ' · xác nhận không trùng ' + numbers : '') };
    });
  }, opts(['payments'], small));
  router.post('/api/receipts/:id/allocations', ({ body, params, account, scope }) => {
    if (!Array.isArray(body.lines) || !body.lines.length || body.lines.some((line) => typeof line?.invoice?.id !== 'string') ||
        (body.advance !== undefined && typeof body.advance !== 'boolean'))
      fail(400, 'Danh sách phân bổ không hợp lệ.');
    const allowAdvance = body.advance === true;
    return apply(account, 'Lưu phân bổ', (current) => {
      const receipt = scope.receipt(current, params.id);
      const book = sales();
      if (body.bookStamp !== db.datasetStamp(SALE) || body.revision !== current.revision)
        fail(409, 'Sổ bán hàng hoặc phân bổ vừa thay đổi. Hãy mở lại phân bổ.');
      const lookup = new Map(sourcesFor(book, receipt).map(({ invoice }) => [invoice.id, invoice]));
      const lines = body.lines.map(({ invoice, amount }) => {
        const candidate = lookup.get(invoice.id);
        if (!candidate || !domain.sameInvoice(candidate, invoice)) fail(409, 'Chứng từ MISA đã thay đổi.');
        return { invoice: candidate, amount };
      });
      const advanceLines = lines.filter(({ invoice }) => invoice.date > receipt.date).length;
      return { after: domain.allocateReceipt(current, receipt.id, body.date, lines, { allowAdvance }),
        detail: receipt.number + ' · ' + lines.length + ' chứng từ' +
          (advanceLines ? ' · trả trước ' + advanceLines + ' chứng từ sau ngày thu' : '') };
    });
  }, opts(['payments'], 1024 * 1024));
  for (const [path, label, change] of [
    ['/api/receipts/:id/reversal', 'Hủy khoản thu', domain.reverseReceipt],
    ['/api/allocations/:id/reversal', 'Hoàn tác phân bổ', domain.reverseAllocation],
  ]) router.post(path, ({ body, params, account, scope }) => {
    if (!text(body.reason, 500)) fail(400, 'Nhập lý do hoàn tác (tối đa 500 ký tự).');
    if (typeof body.revision !== 'string') fail(400, 'Thiếu phiên bản sổ đối soát.');
    return apply(account, label, (current) => {
      const receiptId = path.startsWith('/api/allocations/')
        ? find(current.allocations, params.id, 'phân bổ').receiptId : params.id;
      scope.receipt(current, receiptId);
      // Hủy theo đúng sổ người dùng đang xem: nếu người khác vừa phân bổ hay hủy thì phải mở lại.
      if (body.revision !== current.revision) fail(409, 'Sổ đối soát vừa thay đổi. Hãy mở lại khoản thu.');
      return { after: change(current, params.id, body.date, body.reason), detail: body.date + ' · ' + body.reason };
    });
  }, opts(['payments'], small));
}

module.exports = { register };
