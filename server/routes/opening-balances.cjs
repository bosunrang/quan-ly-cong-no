// Số dư đầu kỳ: số dư công nợ 131 của từng khách tại ngày chốt chuyển sổ, nhập từ báo cáo MISA.
const { createHmac, randomBytes, randomUUID } = require('node:crypto');
const { SALE, LEDGER } = require('../books.cjs');
const { activityEntry, fail } = require('../access.cjs');
const domain = require('../domain.cjs');
const { small, opts, find, domainChange } = require('./helpers.cjs');

const SOURCE_LIMIT = 8 * 1024 * 1024;
const pages = ['misa'];
const formatDate = (date) => date.split('-').reverse().join('/');

// Mốc lần ghi: tăng nghiêm ngặt để máy khác phát hiện số dư đã đổi.
const nextStamp = (current) =>
  new Date(Math.max(Date.now(), (Date.parse(current?.importedAt ?? '') || 0) + 1)).toISOString();

function register(router, db, state) {
  const { sales, ledger, opening, catalog, customers } = state;
  const previewSecret = randomBytes(32);

  function plan(source) {
    if (!domain.isOpeningBalanceSource(source)) fail(400, 'Dữ liệu số dư đầu kỳ không hợp lệ.');
    const current = catalog();
    return domainChange(() => domain.planOpeningBalanceImport(source, {
      customers: current.directory, current: current.opening, ledger: ledger(),
      salesRows: sales()?.rows ?? [], newId: randomUUID,
    }));
  }
  // Mã bản xem trước gắn với tệp đã đọc và trạng thái sổ: sổ, danh mục hay số dư đổi thì phải xem lại.
  const previewToken = (source) => createHmac('sha256', previewSecret).update(JSON.stringify([
    db.datasetStamp(SALE), db.datasetStamp(LEDGER), catalog().version, source,
  ])).digest('hex');

  router.get('/api/opening-balances', () => {
    const balances = opening();
    if (!balances) return null;
    let debitTotal = 0;
    let creditTotal = 0;
    for (const { amount } of balances.entries) {
      if (amount > 0) debitTotal += amount;
      else creditTotal -= amount;
    }
    const rows = sales()?.rows ?? [];
    const { salesRowInOpeningBalance } = domain;
    return {
      date: balances.date, fileName: balances.fileName, importedAt: balances.importedAt,
      customerCount: balances.entries.length, debitTotal, creditTotal,
      manualCount: balances.entries.filter(({ source }) => source === 'manual').length,
      excludedSalesRows: rows.filter((row) => salesRowInOpeningBalance(row, balances)).length,
      allocatedCustomers: domain.openingAllocationsByCustomer(ledger()).size,
    };
  }, opts(pages));

  router.post('/api/opening-balances/preview', ({ body }) => {
    const { additions, issues, counts, balances } = plan(body.source);
    return {
      ...counts, date: balances.date, issues,
      additionCount: additions.length,
      additions: additions.slice(0, 100).map(({ misaCode, name }) => ({ misaCode, name })),
      token: previewToken(body.source),
    };
  }, opts(pages, SOURCE_LIMIT));

  router.post('/api/opening-balances', ({ body, account }) => {
    const saved = db.changeOpeningBalances((_current, changeDirectory) => {
      const planned = plan(body.source);
      if (body.token !== previewToken(body.source))
        fail(409, 'Sổ, danh mục hoặc số dư vừa thay đổi. Hãy xem lại bản xem trước.');
      if (planned.issues.length) fail(409, planned.issues[0]);
      if (planned.additions.length) {
        changeDirectory((tx) => {
          let order = tx.customerOrder(false);
          const now = new Date().toISOString();
          for (const draft of planned.additions)
            tx.insertCustomer({ ...draft, taxCode: '', status: 'active', createdAt: now, updatedAt: now }, order++);
        });
      }
      return {
        balances: { ...planned.balances, importedAt: nextStamp(opening()) },
        audit: activityEntry(account, 'data', 'Nhập số dư đầu kỳ MISA',
          `${planned.balances.fileName} · ngày chốt ${formatDate(planned.balances.date)} · ` +
          `${planned.counts.customerCount} khách hàng` +
          (planned.additions.length ? ` · thêm ${planned.additions.length} khách vào danh mục` : '')),
      };
    });
    return { date: saved.date, importedAt: saved.importedAt, customerCount: saved.entries.length };
  }, opts(pages, SOURCE_LIMIT));

  // Ngày chốt chung để nhân viên điền tay số dư; chỉ đặt được khi chưa có số dư nào.
  router.put('/api/opening-balances/date', ({ body, account, scope }) => {
    if (!scope.unrestricted) fail(403, 'Chỉ tài khoản xem toàn bộ khách hàng mới đặt được ngày chốt số dư.');
    const { date, expected } = body ?? {};
    if (typeof date !== 'string' || (expected !== null && typeof expected !== 'string'))
      fail(400, 'Ngày chốt số dư không hợp lệ.');
    const saved = db.changeOpeningBalances((current) => {
      if ((current?.importedAt ?? null) !== expected) fail(409, 'Số dư đầu kỳ vừa thay đổi. Hãy tải lại.');
      const next = domainChange(() => domain.setOpeningBalanceDate(current, date, ledger()));
      return {
        balances: { ...next, importedAt: nextStamp(current) },
        audit: activityEntry(account, 'data', 'Đặt ngày chốt số dư đầu kỳ', formatDate(date)),
      };
    });
    return { date: saved.date, importedAt: saved.importedAt };
  }, opts(pages, small));

  // Số dư của một khách ở màn Công nợ phải thu: nhân viên điền tay theo ngày chốt chung.
  const customerPath = '/api/opening-balances/customers/:customerId';
  router.get(customerPath, ({ params, scope }) => {
    scope.requireCustomer(params.customerId);
    const balances = opening();
    const entry = balances?.entries.find(({ customerId }) => customerId === params.customerId);
    return {
      date: balances?.date ?? null,
      amount: entry?.amount ?? 0,
      source: entry ? entry.source ?? 'file' : null,
      fileName: balances?.fileName ?? '',
      locked: domain.openingAllocationsByCustomer(ledger()).has(params.customerId),
    };
  }, opts(['receivables']));
  router.put(customerPath, ({ params, body, account, scope }) => {
    if (account.role === 'viewer') fail(403, 'Tài khoản chỉ xem không được sửa số dư đầu kỳ.');
    scope.requireCustomer(params.customerId);
    const { amount, expected } = body ?? {};
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(expected)) fail(400, 'Số dư phải là số nguyên (đồng).');
    let previous = 0;
    db.changeOpeningBalances((current) => {
      if (!current) fail(409, 'Chưa có ngày chốt số dư đầu kỳ. Quản trị cần đặt ngày chốt ở màn Dữ liệu MISA.');
      const customer = find(customers(), params.customerId, 'khách hàng');
      previous = current.entries.find(({ customerId }) => customerId === customer.id)?.amount ?? 0;
      if (previous !== expected) fail(409, 'Số dư đầu kỳ của khách vừa thay đổi. Hãy mở lại khách hàng.');
      if (previous === amount) return { unchanged: true };
      const next = domainChange(() => domain.setOpeningBalanceEntry(current, customer, amount, ledger()));
      return {
        balances: { ...next, importedAt: nextStamp(current) },
        audit: activityEntry(account, 'data', 'Cập nhật số dư đầu kỳ',
          `${customer.misaCode} · ${customer.name} · ${previous} → ${amount} đ · ngày chốt ${formatDate(current.date)}`),
      };
    });
    return true;
  }, opts(['receivables'], small));

  router.delete('/api/opening-balances', ({ body, account }) => {
    db.changeOpeningBalances((current) => {
      if (!current) fail(404, 'Chưa có số dư đầu kỳ.');
      if (current.importedAt !== body.expected) fail(409, 'Số dư đầu kỳ vừa thay đổi. Hãy tải lại.');
      const lock = domain.openingBalanceRemovalLock(ledger());
      if (lock) fail(409, lock);
      return {
        balances: null,
        audit: activityEntry(account, 'data', 'Xóa số dư đầu kỳ MISA',
          `${current.fileName} · ngày chốt ${formatDate(current.date)} · ${current.entries.length} khách hàng`),
      };
    });
    return true;
  }, opts(pages, small));
}

module.exports = { register };
