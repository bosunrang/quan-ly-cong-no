// Biên bản đối chiếu công nợ.
const domain = require('../domain.cjs');
const { opts, find, period } = require('./helpers.cjs');

function register(router, db, state) {
  const { sales, ledger, catalog, groupsFor } = state;
  router.get('/api/reports/statements/:customerId', ({ query, params, scope }) => {
    scope.requireCustomer(params.customerId);
    const current = catalog();
    const book = sales() ?? (current.opening ? { fileName: '', importedAt: current.opening.importedAt, rows: [] } : null);
    if (!book) return null;
    const customer = find(current.directory, params.customerId, 'khách hàng');
    // Biên bản chỉ cần dòng bán hàng của đúng khách này (đã gom sẵn), giữ nguyên thứ tự trong sổ.
    const group = groupsFor(book, current).find((item) => item.customerId === customer.id);
    const lines = new Set(group?.documents.flatMap((document) => document.lines) ?? []);
    const own = { ...book, rows: book.rows.filter((row) => lines.has(row)) };
    const opening = current.opening && { ...current.opening,
      entries: current.opening.entries.filter((entry) => entry.customerId === customer.id) };
    return domain.buildReceivableStatement(own, ledger(), current.directory, customer, ...period(query), opening);
  }, opts(['reports']));
}

module.exports = { register };
