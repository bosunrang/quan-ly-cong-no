// Sổ bán hàng, sổ thu và các kết quả đã dựng (theo khách, theo ngày chốt, Dashboard) giữ trong
// bộ nhớ của máy chủ một công ty; chỉ dựng lại khi sổ hoặc danh mục đổi. Các route dùng chung.
const { DATASET_KEYS } = require('./database.cjs');
const { SALE, LEDGER } = require('./books.cjs');
const domain = require('./domain.cjs');
const { period } = require('./routes/helpers.cjs');
const { scopeForDashboard } = require('./customer-scope.cjs');

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
  const none = Object.freeze([]);
  const customers = () => db.readDataset(DATASET_KEYS.customers)?.data ?? none;
  const employees = () => db.readDataset(DATASET_KEYS.employees)?.data ?? none;
  // SQLite trả lại cùng một bản danh mục khi chưa có gì được ghi, nên chỉ dựng khóa nội dung khi
  // bản đọc đổi. `version` chỉ tăng khi nội dung đổi, dùng làm khóa ngắn cho bộ đệm Dashboard.
  let lastCatalog;
  let catalogVersion = 0;
  function catalog() {
    const directory = customers();
    const staff = employees();
    if (lastCatalog?.directory === directory && lastCatalog.staff === staff) return lastCatalog;
    const key = JSON.stringify([directory, staff]);
    const version = lastCatalog?.key === key ? lastCatalog.version : ++catalogVersion;
    lastCatalog = { directory, staff, key, version };
    return lastCatalog;
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
    if (rows.length === (book?.rows.length ?? 0)) return groupsFor(book, current);
    const cached = throughGroups.get(through);
    if (cached && cached.book === book && cached.key === current.key) return cached.groups;
    const groups = domain.buildSalesReceivables(rows, current.directory, current.staff);
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

  function dashboardScope(query, scope, current) {
    const employee = scope?.unrestricted ? query.get('employee') : null;
    const province = query.get('province');
    return employee || province
      ? scopeForDashboard(scope ? scope.customers(current.directory) : current.directory, { employee, province })
      : scope;
  }

  // Nhớ vài kỳ Dashboard gần nhất: nhiều người xem các kỳ khác nhau không phải tính lại liên tục.
  // Kết quả toàn công ty (tốn nhất) giữ riêng để lọc theo nhiều nhân viên/khu vực không đẩy nó ra.
  const summaries = { all: new Map(), filtered: new Map() };
  const summaryLimits = { all: 8, filtered: 32 };
  function summary(query, scope, current = catalog()) {
    const book = sales();
    const data = ledger();
    const [from, through] = period(query);
    const visibleScope = dashboardScope(query, scope, current);
    const scopeKey = visibleScope && !visibleScope.unrestricted ? visibleScope.key : '*';
    const bucket = scopeKey === '*' ? 'all' : 'filtered';
    const cache = summaries[bucket];
    const key = JSON.stringify([current.version, from, through, scopeKey]);
    const cached = cache.get(key);
    if (cached && cached.book === book && cached.data === data) {
      cache.delete(key);
      cache.set(key, cached);
      return cached.result;
    }
    const groups = groupsThrough(book, current, through);
    const visibleGroups = visibleScope ? visibleScope.groups(groups) : groups;
    const visibleLines = visibleScope && !visibleScope.unrestricted
      ? new Set(visibleGroups.flatMap((group) => group.documents.flatMap((document) => document.lines))) : null;
    const visibleBook = book && visibleLines ? { ...book, rows: book.rows.filter((row) => visibleLines.has(row)) } : book;
    const result = domain.buildDashboardSummary(visibleBook, visibleScope ? visibleScope.ledger(data) : data,
      current.directory, current.staff, from, through, visibleGroups);
    cache.delete(key);
    cache.set(key, { book, data, result });
    while (cache.size > summaryLimits[bucket]) cache.delete(cache.keys().next().value);
    return result;
  }

  // Tuổi nợ của từng chứng từ tại một ngày: kỳ hạn của khách và hạn sửa tay đọc một lần cho mỗi yêu cầu.
  function agingFor(asOf) {
    const { dueDateMap, invoiceAging } = domain;
    const terms = new Map(customers().map(({ id, paymentTermDays }) => [id, paymentTermDays]));
    const overrides = dueDateMap(db.readInvoiceDueDates());
    return (customerId) => {
      const termDays = customerId ? terms.get(customerId) : undefined;
      const customerOverrides = customerId ? overrides.get(customerId) : undefined;
      return (document) => invoiceAging(document, termDays, customerOverrides?.get(document.id), asOf);
    };
  }

  // Dựng sẵn sổ theo khách và Dashboard mặc định (đầu tháng đến hôm nay) để người mở đầu tiên
  // sau khi khởi động không phải chờ dựng toàn bộ sổ.
  function warm() {
    const through = domain.todayLocal();
    summary(new URLSearchParams({ from: through.slice(0, 8) + '01', through }));
  }
  return { sales, ledger, customers, employees, catalog, groupsFor, sourcesFor, projected, dashboardScope, summary, agingFor, warm };
}

module.exports = { createAccountingState };
