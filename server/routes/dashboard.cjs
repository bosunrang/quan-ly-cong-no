// Dashboard: tổng công nợ, thu trong kỳ, chưa phân bổ tại ngày chốt.
const domain = require('../domain.cjs');
const { opts, pageOf, customerSummary, search, searchText, period } = require('./helpers.cjs');

const nameText = (item) => searchText(item, 'name', ({ name }) => name);
const codeText = (item) => searchText(item, 'code', ({ misaCode }) => misaCode);
const customerText = (item) => searchText(item, 'customer', ({ name, customerCode }) => name + ' ' + customerCode);

function register(router, db, state) {
  const { catalog, summary, dashboardScope, agingFor } = state;
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
    const {
      customerTotals: _customerTotals, receivables, periodReceipts, unallocatedReceipts, ...totals
    } = summary(query, scope, current);
    const view = query.get('view');
    const q = search(query);
    // Tuổi nợ tại ngày chốt: số còn lại của từng hóa đơn đã tính theo sổ thu đến ngày đó.
    const [, through] = period(query);
    const { overdue, ...aging } = domain.summarizeAgingPortfolio(receivables, agingFor(through));
    const provinceOptions = [...new Set(scope.customers(current.directory).map(({ province }) => province.trim()))]
      .sort((a, b) => Number(!a) - Number(!b) || a.localeCompare(b, 'vi'));
    const receipts = view === 'period' ? periodReceipts : view === 'unallocated' ? unallocatedReceipts : null;
    const customers = view === 'overdue' ? overdue : receivables;
    // Cắt trang trước rồi mới tóm tắt khách: chỉ 10 dòng được trả về dù có hàng nghìn khách.
    const page = pageOf(receipts ?? (q ? customers.filter((item) => customerText(item).includes(q)) : customers), query, 10);
    const rows = receipts ? page : { ...page, items: page.items.map(customerSummary) };
    return { ...totals, receivablesCount: receivables.length, periodCount: periodReceipts.length,
      unallocatedCount: unallocatedReceipts.length, topDebtors: receivables.slice(0, 8).map(customerSummary), provinceOptions,
      aging: { asOf: through, ...aging }, topOverdue: overdue.slice(0, 8).map(customerSummary),
      rows };
  }, opts(['dashboard']));
}

module.exports = { register };
