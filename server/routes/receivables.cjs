// Công nợ phải thu theo khách hàng và hóa đơn (cả chi tiết mở từ Dashboard).
const { activityEntry, canOpen, fail } = require('../access.cjs');
const domain = require('../domain.cjs');
const { small, opts, pageOf, customerSummary, documentSummary, find, search, searchText } = require('./helpers.cjs');

const emptyInvoiceTotals = { balance: { received: 0, remaining: 0 }, unverifiedCount: 0 };
const missingInvoiceNumber = ({ invoiceNumber, openingBalance }) => !invoiceNumber && !openingBalance;

function agingFilter(query) {
  const filter = query.get('aging') ?? '';
  if (filter && filter !== 'overdue' && !domain.agingBuckets.includes(filter))
    fail(400, 'Nhóm tuổi nợ không hợp lệ.');
  return filter;
}

function register(router, db, state) {
  const { sales, ledger, opening, projected, catalog, customers, employees, dashboardScope, summary } = state;
  const catalogPrefix = 'catalog:';

  // Tìm theo tên hoặc mã thì hiện cả khách chưa có chứng từ, để điền số dư đầu kỳ cho khách đó.
  function customersWithoutDocuments(listed, q, scope) {
    const listedIds = new Set(listed.map(({ customerId }) => customerId));
    const candidates = scope.customers(customers()).filter((item) => !listedIds.has(item.id) &&
      searchText(item, 'name-code', ({ name, misaCode }) => name + ' ' + misaCode).includes(q)).slice(0, 50);
    if (!candidates.length) return [];
    const groups = domain.buildSalesReceivables([], candidates, employees(), { includeEmptyCustomers: true });
    return domain.projectReceiptReceivables(groups, '').customers;
  }
  const ageForCustomer = state.agingFor;

  router.get('/api/receivables', ({ query, scope }) => {
    const book = sales();
    const data = projected(scope);
    const people = new Map();
    const provinces = new Set();
    const q = search(query);
    const employee = query.get('employee');
    const province = query.get('province');
    const filter = agingFilter(query);
    const { todayLocal, agingBuckets, emptyAgingAmounts, summarizeCustomerAging, matchesCustomerAging, unallocatedByCustomer } = domain;
    const agingAsOf = todayLocal();
    const ages = ageForCustomer(agingAsOf);
    const agingAmounts = emptyAgingAmounts();
    // Tiền đã thu nhưng chưa phân bổ: chưa trừ vào tuổi nợ, hiện cạnh nợ quá hạn để không đòi nhầm.
    const unallocated = unallocatedByCustomer(scope.ledger(ledger()));
    let agingReductionAmount = 0;
    let agingUnallocatedAmount = 0;
    let agingOverdueAmount = 0;
    const missing = '?';
    const listed = q ? [...data.customers, ...customersWithoutDocuments(data.customers, q, scope)] : data.customers;
    const filtered = listed.filter((item) =>
      (!employee || employee === (item.employeeId || missing)) &&
      (!province || province === (item.province || missing)) &&
      (!q || searchText(item, 'name-code', ({ name, customerCode }) => name + ' ' + customerCode).includes(q)));
    const agingUnitCounts = { ...emptyAgingAmounts(), all: filtered.length, overdue: 0 };
    for (const item of data.customers) {
      if (item.employeeId) people.set(item.employeeId, item.employeeName);
      if (item.province) provinces.add(item.province);
    }
    const rows = [];
    for (const item of filtered) {
      const customerAging = summarizeCustomerAging(item.documents, ages(item.customerId));
      const { amounts, ...age } = customerAging;
      const unallocatedAmount = (item.customerId && unallocated.get(item.customerId)) || 0;
      for (const bucket of agingBuckets) {
        agingAmounts[bucket] += amounts[bucket];
        if (matchesCustomerAging(customerAging, bucket)) agingUnitCounts[bucket]++;
      }
      if (matchesCustomerAging(customerAging, 'overdue')) agingUnitCounts.overdue++;
      agingReductionAmount += age.reductionAmount;
      agingOverdueAmount += age.overdueAmount;
      agingUnallocatedAmount += unallocatedAmount;
      if (matchesCustomerAging(customerAging, filter))
        rows.push({ row: { ...customerSummary(item), ...age, unallocatedAmount }, amounts });
    }
    // Đang lọc theo tuổi nợ: khách nợ nhiều nhất trong nhóm lên đầu để biết cần đòi ai trước.
    const groupAmount = ({ row, amounts }) => filter === 'overdue' ? row.overdueAmount : filter ? amounts[filter] : 0;
    if (filter) rows.sort((a, b) => groupAmount(b) - groupAmount(a) || (b.row.maxOverdueDays ?? -1) - (a.row.maxOverdueDays ?? -1));
    return {
      hasBook: Boolean(book?.rows.length || opening()?.entries.length), fileName: book?.fileName ?? "",
      unmatchedAllocationCount: data.unmatchedCount,
      missingTotalCount: rows.reduce((sum, { row }) => sum + row.missingTotalCount, 0),
      agingAsOf, agingUnitCounts, agingAmounts, agingReductionAmount, agingUnallocatedAmount, agingOverdueAmount,
      filterOptions: {
        employees: [...people].sort((a, b) => a[1].localeCompare(b[1], 'vi')),
        provinces: [...provinces].sort((a, b) => a.localeCompare(b, 'vi')),
        unmatchedCount: data.customers.filter((item) => !item.catalogMatch).length,
      },
      rows: pageOf(rows.map(({ row }) => row), query),
    };
  }, opts(['receivables']));

  function invoiceDetails(account, query, id, scope) {
    if (!query.get('through')) {
      if (!canOpen(account, 'receivables')) fail(403, 'Cần thẻ Công nợ phải thu.');
      const group = projected(scope).customers.find((item) => item.id === id);
      if (group) return { documents: group.documents, customerId: group.customerId, invoiceCount: group.invoiceCount };
      const customerId = id.startsWith(catalogPrefix) ? id.slice(catalogPrefix.length) : '';
      if (customerId && scope.allows(customerId) && customers().some((item) => item.id === customerId))
        return { documents: [], customerId, invoiceCount: 0 };
      fail(404, 'Không tìm thấy khách hàng.');
    }
    if (!canOpen(account, 'dashboard')) fail(403, 'Cần thẻ Dashboard.');
    const current = catalog();
    const { receivables, customerTotals } = summary(query, scope, current);
    const totals = customerTotals.get(id);
    const group = receivables.find((item) => item.id === id);
    if (group) return { documents: group.documents, totals };
    const customer = current.directory.find((item) => `catalog:${item.id}` === id);
    if (!customer || !dashboardScope(query, scope, current).allows(customer.id))
      fail(404, 'Không tìm thấy khách hàng tại ngày chốt.');
    return { documents: [], totals: totals ?? emptyInvoiceTotals };
  }
  const invoices = '/api/receivables/:customerId/invoices';
  router.get(invoices, ({ query, params, account, scope }) => {
    const { documents, totals, customerId, invoiceCount } = invoiceDetails(account, query, params.customerId, scope);
    const through = query.get('through');
    const missingDocuments = through ? [] : documents.filter(missingInvoiceNumber);
    const candidates = !through && query.get('missingInvoice') === '1' ? missingDocuments : documents;
    const q = search(query);
    const rows = q ? candidates.filter((item) =>
      searchText(item, 'invoice-vouchers', ({ invoiceNumber, invoiceSeries, documentNumbers }) =>
        [invoiceNumber, invoiceSeries, ...documentNumbers].join(' ')).includes(q)) : candidates;
    if (through) {
      const page = pageOf(rows, query);
      return { ...page, items: page.items.map(documentSummary), totals };
    }
    const filter = agingFilter(query);
    const { todayLocal, matchesAging } = domain;
    const ageOf = ageForCustomer(todayLocal())(customerId);
    const page = pageOf(filter ? rows.filter((document) => matchesAging(ageOf(document).bucket, filter)) : rows, query);
    return {
      ...page, invoiceCount, missingInvoiceNumberCount: missingDocuments.length,
      items: page.items.map((document) => ({ ...documentSummary(document), aging: ageOf(document) })),
    };
  }, opts(['receivables', 'dashboard']));
  router.get(invoices + '/:documentId', ({ query, params, account, scope }) =>
    find(invoiceDetails(account, query, params.customerId, scope).documents, params.documentId, 'chứng từ'),
  opts(['receivables', 'dashboard']));
  router.patch(invoices + '/:documentId/due-date', ({ params, account, scope, body }) => {
    if (account.role === 'viewer') fail(403, 'Tài khoản chỉ xem không được sửa hạn thanh toán.');
    const group = find(projected(scope).customers, params.customerId, 'khách hàng');
    const document = find(group.documents, params.documentId, 'chứng từ');
    if (!group.customerId || !document.balance || document.reduction)
      fail(409, 'Chứng từ chưa đủ điều kiện để đặt hạn thanh toán.');
    const { dueDate, expected } = body ?? {};
    if ((dueDate !== null && !domain.isIsoDate(dueDate)) || (expected !== null && !domain.isIsoDate(expected)))
      fail(400, 'Hạn thanh toán không hợp lệ.');
    const label = document.invoiceNumber || document.documentNumbers.join(', ');
    const activity = activityEntry(account, 'data', 'Cập nhật hạn thanh toán',
      `${group.customerCode} · ${label} · ${dueDate ?? 'Dùng kỳ hạn mặc định'}`);
    if (!db.setInvoiceDueDate(group.customerId, document.id, dueDate, expected, activity))
      fail(409, 'Hạn thanh toán vừa thay đổi. Hãy mở lại chứng từ trước khi lưu.');
    return true;
  }, opts(['receivables'], small));
}

module.exports = { register };
