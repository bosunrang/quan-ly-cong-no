// Công nợ phải thu theo khách hàng và hóa đơn (cả chi tiết mở từ Dashboard).
const { canOpen, fail } = require('../access.cjs');
const { opts, normalize, pageOf, customerSummary, documentSummary, find, search } = require('./helpers.cjs');

function register(router, db, state) {
  const { sales, projected, summary } = state;
  router.get('/api/receivables', ({ query, scope }) => {
    const book = sales();
    const data = projected(scope);
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

  function invoiceGroup(account, query, id, scope) {
    if (query.get('through')) {
      if (!canOpen(account, 'dashboard')) fail(403, 'Cần thẻ Dashboard.');
      return find(summary(query, scope).receivables, id, 'khách hàng tại ngày chốt');
    }
    if (!canOpen(account, 'receivables')) fail(403, 'Cần thẻ Công nợ phải thu.');
    return find(projected(scope).customers, id, 'khách hàng');
  }
  const invoices = '/api/receivables/:customerId/invoices';
  router.get(invoices, ({ query, params, account, scope }) => {
    const group = invoiceGroup(account, query, params.customerId, scope);
    const q = search(query);
    const rows = group.documents.filter((item) =>
      normalize([item.invoiceNumber, item.invoiceSeries, ...item.documentNumbers].join(' ')).includes(q));
    return pageOf(rows.map(documentSummary), query);
  }, opts(['receivables', 'dashboard']));
  router.get(invoices + '/:documentId', ({ query, params, account, scope }) =>
    find(invoiceGroup(account, query, params.customerId, scope).documents, params.documentId, 'chứng từ'),
  opts(['receivables', 'dashboard']));
}

module.exports = { register };
