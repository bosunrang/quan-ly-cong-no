const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { openDatabase, DATASET_KEYS } = require('../server/database.cjs');
const { initializeAdministrator } = require('../server/access.cjs');
const { startDevelopmentServer } = require('../server/development.cjs');
const { SALE } = require('../server/books.cjs');

test('nhân viên phải liên kết và chỉ đọc, đối soát khách đang được phân công qua HTTP', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cong-no-scope-'));
  const db = openDatabase(join(directory, 'cong-no.sqlite'));
  const password = 'scope-password-123';
  const time = '2026-01-01T00:00:00.000Z';
  await initializeAdministrator(db, password);
  const [initial] = db.readDataset('cong-no.accounts.v1').data;
  const admin = { ...initial, mustChangePassword: false };
  const staff = ['one', 'two', 'empty', 'unlinked', 'inactive'].map((id) => ({ ...admin,
    id, username: id, role: id === 'two' ? 'viewer' : 'editor',
    pages: id === 'two' ? ['dashboard', 'receivables', 'reports'] : ['dashboard', 'receivables', 'payments', 'reports', 'sales', 'customers'],
  }));
  db.writeAccounts([initial], [admin, ...staff]);
  const employees = staff.filter(({ id }) => id !== 'unlinked').map(({ id }) => ({
    id: 'e-' + id, code: id, name: id, phone: '', email: '', status: id === 'inactive' ? 'inactive' : 'active',
    createdAt: time, linkedAccountId: id,
  }));
  const customers = ['one', 'two', 'unassigned', 'ended'].map((id) => ({
    id: 'c-' + id, misaCode: id, name: 'Khách ' + id, group: 'unknown', taxCode: '', address: '',
    province: id, status: 'active', createdAt: time, updatedAt: time,
    ...(id === 'one' ? { paymentTermDays: 30 } : {}),
    assignments: id === 'unassigned' ? [] : [{ id: 'a-' + id, employeeId: 'e-' + (id === 'ended' ? 'one' : id),
      employeeName: id, province: id, source: 'direct', effectiveFrom: '2026-01-01',
      effectiveTo: id === 'ended' ? '2026-01-02' : null }],
  }));
  db.writeDataset(DATASET_KEYS.employees, 2, employees);
  db.writeDataset(DATASET_KEYS.customers, 2, customers);
  const rows = [...customers, { name: 'Khách chưa có danh mục', misaCode: 'missing' }].map((customer, index) => ({
    rowNumber: index + 1, date: '2026-01-02', documentNumber: 'BH-' + index, invoiceNumber: String(index + 1),
    customerName: customer.name, productName: 'Hàng', unit: 'Hộp', quantity: 1, unitPrice: 200,
    salesAmount: 200, paymentTotal: 200,
    source: { customerCode: customer.misaCode, invoiceSeries: '', invoiceDate: '' },
  }));
  db.writeDataset(SALE, 1, { fileName: 'scope.xlsx', importedAt: time, rows });
  db.close();
  const backend = await startDevelopmentServer(directory);
  t.after(async () => { await backend.stop(); await rm(directory, { recursive: true, force: true }); });
  async function call(cookie, method, resource, payload) {
    const response = await fetch(backend.target + '/api/' + resource, { method,
      headers: { 'x-cong-no-lan': '1', cookie, ...(payload ? { 'content-type': 'application/json' } : {}) },
      body: payload ? JSON.stringify(payload) : undefined });
    return { status: response.status, ...(await response.json()), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const login = (username) => call('', 'POST', 'session', { username, password });
  const unlinked = await login('unlinked');
  assert.equal(unlinked.status, 403);
  assert.match(unlinked.error, /chưa liên kết/);
  assert.equal(unlinked.cookie, undefined);
  assert.equal((await login('inactive')).status, 403);
  const cookies = {};
  for (const username of ['admin', 'one', 'two', 'empty']) {
    const result = await login(username);
    assert.equal(result.status, 200);
    cookies[username] = result.cookie;
  }
  const read = (user, resource) => call(cookies[user], 'GET', resource);
  const write = (user, method, resource, payload) => call(cookies[user], method, resource, payload);
  const period = 'from=2026-01-01&through=2026-12-31';

  // Có phân bổ thật ở cả hai khách để kiểm tra tổng và chi tiết không lẫn dữ liệu.
  for (const id of ['one', 'two']) {
    const receiptId = 'receipt-' + id;
    assert.equal((await write('admin', 'POST', 'receipts', { id: receiptId, customerId: 'c-' + id,
      customerCode: id, date: '2026-01-02', amount: 100, reference: '' })).status, 200);
    const detail = (await read('admin', 'receipts/' + receiptId)).value;
    const candidate = (await read('admin', 'receipts/' + receiptId + '/candidates')).value.items[0];
    assert.equal((await write('admin', 'POST', 'receipts/' + receiptId + '/allocations', {
      revision: detail.revision, bookStamp: detail.bookStamp, date: '2026-01-02',
      lines: [{ invoice: candidate.invoice, amount: 50 }],
    })).status, 200);
  }
  const ownInvoicePath = 'receivables/catalog%3Ac-one/invoices';
  const ownInvoice = (await read('one', ownInvoicePath)).value.items[0];
  assert.equal(ownInvoice.aging.dueDate, '2026-02-01');
  const otherInvoices = 'receivables/catalog%3Ac-two/invoices';
  const otherInvoice = (await read('two', otherInvoices)).value.items[0];
  assert.equal(otherInvoice.aging.bucket, 'no-due-date');
  const ownDueDate = ownInvoicePath + '/' + encodeURIComponent(ownInvoice.id) + '/due-date';
  const otherDueDate = otherInvoices + '/' + encodeURIComponent(otherInvoice.id) + '/due-date';
  const asOf = (await read('one', 'receivables')).value.agingAsOf;
  const dueDate = new Date(Date.parse(asOf) - 31 * 86_400_000).toISOString().slice(0, 10);
  assert.equal((await write('two', 'PATCH', otherDueDate, { dueDate, expected: null })).status, 403);
  assert.equal((await write('one', 'PATCH', otherDueDate, { dueDate, expected: null })).status, 404);
  assert.equal((await write('one', 'PATCH', ownDueDate, { dueDate: '2026-02-30', expected: null })).status, 400);
  assert.equal((await write('one', 'PATCH', ownDueDate, { dueDate, expected: null })).status, 200);
  assert.equal((await write('one', 'PATCH', ownDueDate, { dueDate: asOf, expected: null })).status, 409);
  const aged = (await read('one', 'receivables?aging=overdue')).value;
  assert.equal(aged.agingAmounts['31-60'], 150);
  assert.deepEqual(aged.agingUnitCounts, {
    all: 1, overdue: 1, current: 0, '1-30': 0, '31-60': 1, '61-90': 0, '90+': 0, 'no-due-date': 0,
  });
  assert.equal(aged.rows.items[0].earliestDueDate, dueDate);
  assert.equal(aged.rows.items[0].maxOverdueDays, 31);
  assert.equal(aged.rows.items[0].overdueAmount, 150);
  const otherAging = (await read('two', 'receivables?aging=overdue')).value;
  assert.equal(otherAging.rows.total, 0);
  assert.equal(otherAging.agingUnitCounts.overdue, 0);
  assert.equal(otherAging.agingUnitCounts['no-due-date'], 1);
  assert.equal(otherAging.agingUnitCounts.all, 1);
  assert.equal((await read('one', 'receivables?aging=overdue&province=two')).value.agingUnitCounts.all, 0);
  assert.equal((await read('two', 'receivables?aging=no-due-date')).value.agingAmounts['no-due-date'], 150);
  const agedInvoice = (await read('one', ownInvoicePath + '?aging=31-60')).value.items[0];
  assert.deepEqual(agedInvoice.aging, { dueDate, overrideDueDate: dueDate, daysOverdue: 31, bucket: '31-60' });
  assert.equal((await read('one', ownInvoicePath + '?aging=1-30')).value.total, 0);
  const backup = (await read('admin', 'business-backup')).value;
  const restored = openDatabase(':memory:');
  try {
    restored.changeBusinessData({ type: 'restore', backup });
    assert.equal(restored.readDataset(DATASET_KEYS.customers).data[0].paymentTermDays, 30);
    assert.equal(restored.readInvoiceDueDates()[0].dueDate, dueDate);
  } finally {
    restored.close();
  }
  const customer = (await read('admin', 'customers')).value.find(({ id }) => id === 'c-one');
  const patchTerm = (current, days) => write('admin', 'PATCH', 'customers/' + current.id,
    { expected: current.updatedAt, customer: { ...current, paymentTermDays: days } });
  assert.equal((await patchTerm(customer, -1)).status, 400);
  const changed = await patchTerm(customer, 0);
  assert.equal(changed.value.paymentTermDays, 0);
  assert.equal((await read('one', ownInvoicePath)).value.items[0].aging.dueDate, dueDate);
  assert.equal((await write('one', 'PATCH', ownDueDate, { dueDate: null, expected: dueDate })).status, 200);
  assert.equal((await read('one', ownInvoicePath)).value.items[0].aging.dueDate, '2026-01-02');
  assert.equal((await patchTerm(changed.value, null)).status, 200);
  assert.equal((await read('one', ownInvoicePath)).value.items[0].aging.bucket, 'no-due-date');
  // Xen kẽ quản trị và các nhân viên cùng kỳ: bộ nhớ đệm không được làm lộ tổng của người khác.
  for (const user of ['admin', 'one', 'two', 'empty', 'admin', 'two', 'one']) {
    const result = await read(user, 'dashboard?' + period);
    assert.equal(result.status, 200);
    const expected = user === 'admin' ? 700 : user === 'empty' ? 0 : 150;
    assert.equal(result.value.remaining, expected, user);
    assert.equal(result.value.periodReceived, user === 'admin' ? 200 : user === 'empty' ? 0 : 100);
    assert.equal(result.value.unallocated, user === 'admin' ? 100 : user === 'empty' ? 0 : 50);
    assert.equal(result.value.salesRowCount, user === 'admin' ? 5 : user === 'empty' ? 0 : 1);
    assert.equal(result.value.receiptTrend.buckets.reduce((sum, bucket) => sum + bucket.amount, 0), result.value.periodReceived);
    assert.equal(result.value.receiptTrend.buckets[0].from, '2026-01-01');
    assert.equal(result.value.receiptTrend.buckets.at(-1).through, '2026-12-31');
    assert.deepEqual(result.value.topDebtors.map(({ id }) => id), user === 'admin'
      ? result.value.rows.items.map(({ id }) => id) : user === 'empty' ? [] : ['catalog:c-' + user]);
    if (user !== 'admin') assert.ok(result.value.rows.items.every(({ id }) => id === 'catalog:c-' + user));
  }
  for (const view of ['period', 'unallocated']) {
    const result = (await read('one', 'dashboard?' + period + '&view=' + view)).value;
    assert.equal(result.rows.total, 1);
    assert.equal(result.rows.items[0].customerId, 'c-one');
    assert.deepEqual(result.topDebtors.map(({ id }) => id), ['catalog:c-one']);
  }
  const dailyTrend = (await read('one', 'dashboard?from=2026-01-01&through=2026-01-03')).value.receiptTrend;
  assert.equal(dailyTrend.daysPerBucket, 1);
  assert.deepEqual(dailyTrend.buckets.map(({ amount, count }) => [amount, count]), [[0, 0], [100, 1], [0, 0]]);
  for (const employee of ['e-one', 'e-two']) {
    const ownId = 'c-' + employee.slice(2);
    const target = 'dashboard?' + period + '&employee=' + employee;
    const detail = (await read('admin', target)).value;
    assert.deepEqual([detail.remaining, detail.periodReceived, detail.unallocated], [150, 100, 50]);
    assert.deepEqual(detail.topDebtors.map(({ id }) => id), ['catalog:' + ownId]);
    assert.deepEqual(detail.rows.items.map(({ id }) => id), ['catalog:' + ownId]);
    assert.equal(detail.receiptTrend.buckets.reduce((sum, bucket) => sum + bucket.amount, 0), 100);
    for (const view of ['period', 'unallocated'])
      assert.deepEqual((await read('admin', target + '&view=' + view)).value.rows.items.map(({ customerId }) => customerId), [ownId]);
  }
  const filteredInvoiceList = 'receivables/catalog%3Ac-one/invoices?' + period + '&employee=';
  assert.equal((await read('admin', filteredInvoiceList + 'e-one')).status, 200);
  assert.equal((await read('admin', filteredInvoiceList + 'e-two')).status, 404);
  const selectedByStaff = (await read('one', 'dashboard?' + period + '&employee=e-two')).value;
  assert.deepEqual(selectedByStaff.topDebtors.map(({ id }) => id), ['catalog:c-one']);
  assert.deepEqual(selectedByStaff.provinceOptions, ['one']);
  const region = (await read('admin', 'dashboard?' + period + '&province=two')).value;
  assert.deepEqual(region.topDebtors.map(({ id }) => id), ['catalog:c-two']);
  assert.deepEqual([region.remaining, region.periodReceived, region.unallocated], [150, 100, 50]);
  assert.ok(region.provinceOptions.includes('one') && region.provinceOptions.includes('two'));
  const combined = (await read('admin', 'dashboard?' + period + '&employee=e-one&province=two')).value;
  assert.deepEqual([combined.remaining, combined.periodReceived, combined.unallocated], [0, 0, 0]);
  const outsideRegion = (await read('one', 'dashboard?' + period + '&province=two')).value;
  assert.deepEqual(outsideRegion.rows.items, []);
  assert.deepEqual(outsideRegion.provinceOptions, ['one']);
  assert.equal((await read('admin', filteredInvoiceList + 'e-one&province=two')).status, 404);
  const lookup = 'dashboard/customers?' + period;
  const foundCustomer = { id: 'catalog:c-one', name: 'Khách one', customerCode: 'one' };
  assert.deepEqual((await read('admin', lookup + '&employee=e-one&province=one&q=khach+one')).value, [foundCustomer]);
  assert.deepEqual((await read('admin', lookup + '&employee=e-one&province=two&q=one')).value, []);
  assert.deepEqual((await read('one', lookup + '&q=two')).value, []);
  assert.deepEqual((await read('one', lookup + '&employee=e-two&q=one')).value, [foundCustomer]);
  const earlyPeriod = 'from=2026-01-01&through=2026-01-01';
  assert.deepEqual((await read('one', 'dashboard/customers?' + earlyPeriod + '&q=one')).value, [foundCustomer]);
  const noDebt = await read('one', 'receivables/catalog%3Ac-one/invoices?' + earlyPeriod);
  assert.equal(noDebt.status, 200);
  assert.deepEqual(noDebt.value.items, []);
  assert.deepEqual(noDebt.value.totals, { balance: { received: 0, remaining: 0 }, unverifiedCount: 0 });
  const filteredInvoices = (await read('one', 'receivables/catalog%3Ac-one/invoices?' + period + '&q=khong-co')).value;
  assert.deepEqual(filteredInvoices.items, []);
  assert.deepEqual(filteredInvoices.totals, { balance: { received: 50, remaining: 150 }, unverifiedCount: 0 });
  assert.deepEqual((await read('one', 'customers')).value.map(({ id }) => id), ['c-one']);
  // Sửa, xóa khách ngoài phạm vi (chưa phân công hoặc của người khác) bị từ chối như khi đọc.
  for (const other of (await read('admin', 'customers')).value.filter(({ id }) => id !== 'c-one')) {
    assert.equal((await write('one', 'PATCH', 'customers/' + other.id,
      { expected: other.updatedAt, customer: { ...other, name: 'Đổi trộm' } })).status, 404);
    assert.equal((await write('one', 'DELETE', 'customers/' + other.id, { expected: other.updatedAt })).status, 404);
  }
  assert.ok((await read('admin', 'customers')).value.every(({ name }) => name !== 'Đổi trộm'));
  const receivables = (await read('one', 'receivables')).value;
  assert.equal(receivables.rows.total, 1);
  assert.deepEqual(receivables.filterOptions.provinces, ['one']);
  assert.equal(receivables.filterOptions.unmatchedCount, 0);
  assert.equal((await read('one', 'receivables?employee=e-two')).value.rows.total, 0);
  assert.equal((await read('empty', 'receivables')).value.rows.total, 0);
  assert.equal((await read('one', 'reports/statements/c-one?' + period)).status, 200);
  // Số dư đầu kỳ nhập tay đã bỏ khỏi nghiệp vụ: không còn route ghi số dư.
  assert.equal((await write('admin', 'PUT', 'receivables/opening-balances/c-two', {
    expected: null, amount: 450, date: '2026-01-01',
  })).status, 404);
  const ownInvoices = (await read('one', 'receivables/catalog%3Ac-one/invoices')).value.items;
  assert.equal(ownInvoices.length, 1);
  assert.equal((await read('one', 'receivables/catalog%3Ac-one/invoices/' + encodeURIComponent(ownInvoices[0].id))).status, 200);
  for (const resource of [
    'receivables/catalog%3Ac-two/invoices', 'receivables/catalog%3Ac-two/invoices?' + period,
    'receivables/catalog%3Ac-two/invoices/' + encodeURIComponent(ownInvoices[0].id),
    'reports/statements/c-two?' + period, 'reports/statements/c-unassigned?' + period,
    'receipts/receipt-two', 'receipts/receipt-two/candidates',
    'receipts/receipt-two/candidates/matches?date=2026-01-02', 'receipts/receipt-two/candidates/guess',
  ]) assert.equal((await read('one', resource)).status, 404, resource);
  const receipts = (await read('one', 'receipts')).value;
  assert.equal(receipts.count, 1);
  assert.equal(receipts.items[0].receipt.customerId, 'c-one');
  assert.equal((await read('one', 'receipts?q=two')).value.total, 0);
  assert.equal((await read('one', 'receipts/receipt-one/candidates')).status, 200);
  const other = (await read('admin', 'receipts/receipt-two')).value;
  const revision = other.revision;
  assert.equal((await write('one', 'POST', 'receipts', { id: 'forbidden-receipt', customerId: 'c-two',
    customerCode: 'two', date: '2026-01-02', amount: 1, reference: '' })).status, 404);
  assert.equal((await write('one', 'POST', 'receipts/receipt-two/allocations', {
    lines: [{ invoice: { id: 'guess' }, amount: 1 }], revision, date: '2026-01-02',
  })).status, 404);
  for (const resource of ['receipts/receipt-two/reversal', 'allocations/' + other.allocations[0].id + '/reversal'])
    assert.equal((await write('one', 'POST', resource, { date: '2026-01-02', reason: 'Thử quyền', revision })).status, 404);
  assert.equal((await read('admin', 'receipts/receipt-two')).value.revision, revision);
  assert.equal((await write('one', 'POST', 'receipts', { id: 'own-new-receipt', customerId: 'c-one',
    customerCode: 'one', date: '2026-01-02', amount: 1, reference: '' })).status, 200);

  // Tự nhận rồi bỏ phân công: cả bốn màn hình cập nhật trong cùng phiên.
  const available = (await read('empty', 'assignments')).value.customers.find(({ id }) => id === 'c-unassigned');
  assert.equal((await write('admin', 'POST', 'receipts', { id: 'receipt-unassigned', customerId: available.id,
    customerCode: available.misaCode, date: '2026-01-02', amount: 80, reference: '' })).status, 200);
  async function checkClaim(visible) {
    const dashboard = (await read('empty', 'dashboard?' + period)).value;
    assert.equal(dashboard.remaining, visible ? 200 : 0);
    assert.equal(dashboard.periodReceived, visible ? 80 : 0);
    assert.deepEqual(dashboard.rows.items.map(({ id }) => id), visible ? ['catalog:c-unassigned'] : []);
    const debts = (await read('empty', 'receivables')).value;
    assert.deepEqual(debts.rows.items.map(({ customerId }) => customerId), visible ? [available.id] : []);
    const payments = (await read('empty', 'receipts')).value;
    assert.deepEqual(payments.items.map(({ receipt }) => receipt.customerId), visible ? [available.id] : []);
    const statement = await read('empty', 'reports/statements/c-unassigned?' + period);
    assert.equal(statement.status, visible ? 200 : 404);
    if (visible) assert.equal(statement.value.customer.id, available.id);
    assert.deepEqual((await read('empty', 'customers')).value.map(({ id }) => id), visible ? [available.id] : []);
  }
  await checkClaim(false);
  const claimed = await write('empty', 'POST', 'assignments', { employeeId: 'e-empty', employeeName: 'empty',
    effectiveFrom: '2026-01-03', customers: [{ id: available.id, expected: available.updatedAt }] });
  assert.equal(claimed.status, 200);
  await checkClaim(true);
  const [assignedCustomer] = claimed.value;
  assert.equal((await write('empty', 'PATCH', 'assignments/' + assignedCustomer.assignments[0].id, {
    expected: assignedCustomer.updatedAt, effectiveTo: '2026-01-04',
  })).status, 200);
  await checkClaim(false);

  // Chuyển khách cho người khác có hiệu lực ngay, không phải đăng nhập lại.
  const own = (await read('admin', 'customers')).value.find(({ id }) => id === 'c-one');
  assert.equal((await write('admin', 'POST', 'assignments', { employeeId: 'e-two', employeeName: 'two',
    effectiveFrom: '2026-01-03', customers: [{ id: own.id, expected: own.updatedAt }] })).status, 200);
  assert.equal((await read('one', 'dashboard?' + period)).value.remaining, 0);
  assert.equal((await read('one', 'receipts')).value.count, 0);
  assert.equal((await read('two', 'dashboard?' + period)).value.remaining, 300);
  assert.equal((await read('one', 'reports/statements/c-one?' + period)).status, 404);

  const employee = (await read('admin', 'employees')).value.find(({ id }) => id === 'e-one');
  assert.equal((await write('admin', 'PATCH', 'employees/e-one', {
    expected: employee, employee: { ...employee, linkedAccountId: undefined },
  })).status, 200);
  assert.equal((await read('one', 'session')).status, 401);
  assert.equal((await read('one', 'dashboard?' + period)).status, 401);
  assert.equal((await login('one')).status, 403);
  const unlinkedEmployee = (await read('admin', 'employees')).value.find(({ id }) => id === 'e-one');
  assert.equal((await write('admin', 'PATCH', 'employees/e-one', {
    expected: unlinkedEmployee, employee: { ...unlinkedEmployee, linkedAccountId: 'one' },
  })).status, 200);
  assert.equal((await read('one', 'session')).status, 401);
  const restoredOne = await login('one');
  assert.equal(restoredOne.status, 200);
  cookies.one = restoredOne.cookie;
  const empty = (await read('admin', 'employees')).value.find(({ id }) => id === 'e-empty');
  assert.equal((await write('admin', 'PATCH', 'employees/e-empty', {
    expected: empty, employee: { ...empty, status: 'inactive' },
  })).status, 200);
  assert.equal((await read('empty', 'session')).status, 401);

  const finalReceipt = 'receipt-two-final';
  assert.equal((await write('admin', 'POST', 'receipts', { id: finalReceipt, customerId: 'c-two',
    customerCode: 'two', date: '2026-01-04', amount: 150, reference: '' })).status, 200);
  const finalDetail = (await read('admin', 'receipts/' + finalReceipt)).value;
  const finalInvoice = (await read('admin', 'receipts/' + finalReceipt + '/candidates')).value.items[0].invoice;
  assert.equal((await write('admin', 'POST', 'receipts/' + finalReceipt + '/allocations', {
    revision: finalDetail.revision, bookStamp: finalDetail.bookStamp, date: '2026-01-04',
    lines: [{ invoice: finalInvoice, amount: 150 }],
  })).status, 200);
  const paid = await read('two', 'receivables/catalog%3Ac-two/invoices?from=2026-01-04&through=2026-01-04');
  assert.equal(paid.status, 200);
  assert.deepEqual(paid.value.items, []);
  assert.deepEqual(paid.value.totals, { balance: { received: 200, remaining: 0 }, unverifiedCount: 0 });

  const deleted = (await read('admin', 'employees')).value.find(({ id }) => id === 'e-two');
  assert.equal((await write('admin', 'DELETE', 'employees/e-two', {
    expected: deleted, effectiveTo: '2026-01-04',
  })).status, 200);
  assert.equal((await read('two', 'session')).status, 401);
  assert.equal((await login('two')).status, 403);

  const before = (await read('admin', 'customers')).value;
  assert.equal((await write('one', 'DELETE', 'accounts/one')).status, 403);
  assert.equal((await write('admin', 'DELETE', 'accounts/' + admin.id)).status, 400);
  const removed = await write('admin', 'DELETE', 'accounts/one');
  assert.equal(removed.status, 200);
  assert.equal(removed.value.accounts.some(({ id }) => id === 'one'), false);
  assert.equal((await read('one', 'session')).status, 401);
  assert.equal((await login('one')).status, 401);
  assert.equal((await write('admin', 'DELETE', 'accounts/one')).status, 404);
  const formerLink = (await read('admin', 'employees')).value.find(({ id }) => id === 'e-one');
  assert.deepEqual(formerLink, unlinkedEmployee);
  assert.deepEqual((await read('admin', 'customers')).value, before);
  assert.ok((await read('admin', 'activities/export')).value.some(({ action, detail }) => action === 'Xóa tài khoản' && detail === 'one'));
});
