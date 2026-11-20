// Dashboard: tổng công nợ, thu trong kỳ, chưa phân bổ tại ngày chốt.
const { opts, normalize, pageOf, customerSummary, search } = require('./helpers.cjs');

function register(router, db, state) {
  const { summary } = state;
  router.get('/api/dashboard', ({ query, scope }) => {
    const { receivables, periodReceipts, unallocatedReceipts, ...totals } = summary(query, scope);
    const view = query.get('view');
    const q = search(query);
    const rows = view === 'period' ? periodReceipts : view === 'unallocated' ? unallocatedReceipts :
      receivables.filter((item) => normalize(item.name + ' ' + item.customerCode).includes(q)).map(customerSummary);
    return { ...totals, receivablesCount: receivables.length, periodCount: periodReceipts.length,
      unallocatedCount: unallocatedReceipts.length, rows: pageOf(rows, query, 10) };
  }, opts(['dashboard']));
}

module.exports = { register };
