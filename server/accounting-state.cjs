// Sổ bán hàng, sổ thu và các kết quả đã dựng (theo khách, theo ngày chốt, Dashboard) giữ trong
// bộ nhớ của máy chủ một công ty; chỉ dựng lại khi sổ hoặc danh mục đổi. Các route dùng chung.
const { DATASET_KEYS } = require('./database.cjs');
const { SALE, LEDGER } = require('./books.cjs');
const domain = require('./domain.cjs');
const { period } = require('./routes/helpers.cjs');

function createAccountingState(db) {
  // Reuse decoded SQLite rows on this server until the corresponding book changes.
  const bookReader = (key, decode) => {
    let current;
    const read = () => {
      const stamp = db.datasetStamp(key);
      if (!current || current.stamp !== stamp) current = { stamp, value: decode(db.readDataset(key)?.data) };
      return current.value;
    };
    read.peek = () => current;
    read.remember = (stamp, value) => { current = { stamp, value }; };
    return read;
  };
  const sales = bookReader(SALE, (data) => data ?? null);
  const ledger = bookReader(LEDGER, (data) => domain.migrateReceiptLedger(data ?? domain.emptyReceiptLedger));
  const customers = () => db.readDataset(DATASET_KEYS.customers)?.data ?? [];
  const employees = () => db.readDataset(DATASET_KEYS.employees)?.data ?? [];
  // Danh mục đọc lại mỗi lần (nhỏ); khóa nội dung dùng để biết kết quả đã dựng còn dùng được không.
  function catalog() {
    const directory = customers();
    const staff = employees();
    return { directory, staff, key: JSON.stringify([directory, staff]) };
  }

  // Dựng sổ theo khách hàng là bước tốn nhất (đọc toàn bộ dòng bán hàng). Chỉ dựng lại khi sổ
  // hoặc danh mục đổi; tìm hóa đơn cho khoản thu, biên bản và trang công nợ dùng chung kết quả.
  let lastGroups;
  function groupsFor(book, current) {
    if (!lastGroups || lastGroups.book !== book || lastGroups.key !== current.key) {
      lastGroups = { book, key: current.key,
        groups: domain.buildSalesReceivables(book?.rows ?? [], current.directory, current.staff) };
    }
    return lastGroups.groups;
  }
  function sourcesFor(book, receipt, current = catalog()) {
    return domain.receiptInvoiceSourcesFromGroups(groupsFor(book, current), book?.fileName ?? '', receipt);
  }

  // Nhóm khách tính đến một ngày chốt chỉ phụ thuộc sổ bán hàng và danh mục, không phụ thuộc sổ thu:
  // ghi khoản thu hay phân bổ không phải dựng lại. Nếu ngày chốt bao trọn sổ thì dùng luôn nhóm đầy đủ.
  const throughGroups = new Map();
  function groupsThrough(book, current, through) {
    const rows = domain.salesRowsThrough(book?.rows ?? [], through);
    if (rows.length === (book?.rows.length ?? 0) &&
        !current.directory.some(({ openingBalance }) => openingBalance && openingBalance.date > through))
      return groupsFor(book, current);
    const cached = throughGroups.get(through);
    if (cached && cached.book === book && cached.key === current.key) return cached.groups;
    const groups = domain.buildSalesReceivables(rows, current.directory, current.staff, { through });
    throughGroups.delete(through);
    throughGroups.set(through, { book, key: current.key, groups });
    while (throughGroups.size > 6) throughGroups.delete(throughGroups.keys().next().value);
    return groups;
  }

  let lastView;
  function projected(scope) {
    const book = sales();
    const data = ledger();
    const groups = groupsFor(book, catalog());
    if (scope && !scope.unrestricted)
      return domain.projectReceiptReceivables(scope.groups(groups), book?.fileName ?? '', scope.ledger(data));
    if (!lastView || lastView.groups !== groups || lastView.data !== data)
      lastView = { groups, data, result: domain.projectReceiptReceivables(groups, book?.fileName ?? '', data) };
    return lastView.result;
  }

  // Nhớ vài kỳ Dashboard gần nhất: nhiều người xem các kỳ khác nhau không phải tính lại liên tục.
  const summaries = new Map();
  function summary(query, scope) {
    const book = sales();
    const data = ledger();
    const current = catalog();
    const [from, through] = period(query);
    const key = JSON.stringify([current.key, from, through, scope?.key ?? '*']);
    const cached = summaries.get(key);
    if (cached && cached.book === book && cached.data === data) {
      summaries.delete(key);
      summaries.set(key, cached);
      return cached.result;
    }
    const groups = groupsThrough(book, current, through);
    const visibleGroups = scope ? scope.groups(groups) : groups;
    const visibleLines = scope && !scope.unrestricted
      ? new Set(visibleGroups.flatMap((group) => group.documents.flatMap((document) => document.lines))) : null;
    const visibleBook = book && visibleLines ? { ...book, rows: book.rows.filter((row) => visibleLines.has(row)) } : book;
    const result = domain.buildDashboardSummary(visibleBook, scope ? scope.ledger(data) : data,
      current.directory, current.staff, from, through, visibleGroups);
    summaries.delete(key);
    summaries.set(key, { book, data, result });
    while (summaries.size > 12) summaries.delete(summaries.keys().next().value);
    return result;
  }
  return { sales, ledger, customers, employees, catalog, groupsFor, sourcesFor, projected, summary };
}

module.exports = { createAccountingState };
