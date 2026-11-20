// Dashboard: tổng công nợ, thu trong kỳ, chưa phân bổ tại ngày chốt.
const { opts, pageOf, customerSummary, search, searchText, period } = require('./helpers.cjs');

const nameText = (item) => searchText(item, 'name', ({ name }) => name);
const codeText = (item) => searchText(item, 'code', ({ misaCode }) => misaCode);
const customerText = (item) => searchText(item, 'customer', ({ name, customerCode }) => name + ' ' + customerCode);

function register(router, db, state) {
  const { catalog, summary, dashboardScope } = state;
  router.get('/api/dashboard/customers', ({ query, scope }) => {
    period(query);
    const q = search(query);
    if (!q) return [];
    const current = catalog();
    return dashboardScope(query, scope, current).customers(current.directory)
      .filter((customer) => nameText(customer).includes(q) || codeText(customer).includes(q))
      .sort((a, b) => Number(codeText(b) === q) - Number(codeText(a) === q) || a.name.localeCompare(b.name, 'vi'))
      .slice(0, 8)
      .map(({ id, name, misaCode }) => ({ id: `catalog:${id}`, name, customerCode: misaCode }));
  }, opts(['dashboard']));
  router.get('/api/dashboard', ({ query, scope }) => {
    const current = catalog();
    const { receivables, periodReceipts, unallocatedReceipts, ...totals } = summary(query, scope, current);
    const view = query.get('view');
    const q = search(query);
    const provinceOptions = [...new Set(scope.customers(current.directory).map(({ province }) => province.trim()))]
      .sort((a, b) => Number(!a) - Number(!b) || a.localeCompare(b, 'vi'));
    const receipts = view === 'period' ? periodReceipts : view === 'unallocated' ? unallocatedReceipts : null;
    // Cắt trang trước rồi mới tóm tắt khách: chỉ 10 dòng được trả về dù có hàng nghìn khách.
    const page = pageOf(receipts ?? (q ? receivables.filter((item) => customerText(item).includes(q)) : receivables), query, 10);
    const rows = receipts ? page : { ...page, items: page.items.map(customerSummary) };
    return { ...totals, receivablesCount: receivables.length, periodCount: periodReceipts.length,
      unallocatedCount: unallocatedReceipts.length, topDebtors: receivables.slice(0, 5).map(customerSummary), provinceOptions,
      rows };
  }, opts(['dashboard']));
}

module.exports = { register };
