// Biên bản đối chiếu công nợ.
const domain = require('../domain.cjs');
const { opts, find, period } = require('./helpers.cjs');

function register(router, db, state) {
  const { sales, ledger, catalog, groupsFor } = state;
  router.get('/api/reports/statements/:customerId', ({ query, params, scope }) => {
    scope.requireCustomer(params.customerId);
    const book = sales();
    const current = catalog();
    if (!book && !current.directory.some(({ id, openingBalance }) => id === params.customerId && openingBalance)) return null;
    const customer = find(current.directory, params.customerId, 'khách hàng');
    // Biên bản chỉ cần dòng bán hàng của đúng khách này (đã gom sẵn), giữ nguyên thứ tự trong sổ.
    const group = groupsFor(book, current).find((item) => item.customerId === customer.id);
    const lines = new Set(group?.documents.flatMap((document) => document.lines) ?? []);
    const own = book ? { ...book, rows: book.rows.filter((row) => lines.has(row)) } : null;
    return domain.buildReceivableStatement(own, ledger(), current.directory, customer, ...period(query));
  }, opts(['reports']));
}

module.exports = { register };
