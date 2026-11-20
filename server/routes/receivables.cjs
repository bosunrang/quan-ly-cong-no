// Công nợ phải thu theo khách hàng và hóa đơn (cả chi tiết mở từ Dashboard).
const { canOpen, fail } = require('../access.cjs');
const { opts, normalize, pageOf, customerSummary, documentSummary, find, search } = require('./helpers.cjs');

const emptyInvoiceTotals = { balance: { received: 0, remaining: 0 }, unverifiedCount: 0 };

function register(router, db, state) {
  const { sales, projected, catalog, dashboardScope, summary } = state;
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

  function invoiceDetails(account, query, id, scope) {
    if (!query.get('through')) {
      if (!canOpen(account, 'receivables')) fail(403, 'Cần thẻ Công nợ phải thu.');
      const { documents } = find(projected(scope).customers, id, 'khách hàng');
      return { documents };
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
    const { documents, totals } = invoiceDetails(account, query, params.customerId, scope);
    const q = search(query);
    const rows = q ? documents.filter((item) =>
      normalize([item.invoiceNumber, item.invoiceSeries, ...item.documentNumbers].join(' ')).includes(q)) : documents;
    const page = pageOf(rows, query);
    return { ...page, items: page.items.map(documentSummary), totals };
  }, opts(['receivables', 'dashboard']));
  router.get(invoices + '/:documentId', ({ query, params, account, scope }) =>
    find(invoiceDetails(account, query, params.customerId, scope).documents, params.documentId, 'chứng từ'),
  opts(['receivables', 'dashboard']));
}

module.exports = { register };
