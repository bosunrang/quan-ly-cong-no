const text = (value) => typeof value === "string";
const record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const fields = (value, names) => record(value) && names.every((name) => text(value[name]));
const optional = (value, check) => value === undefined || check(value);
const date = (value) => text(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);
const calendarDate = (value) => date(value) && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const timestamp = (value) => text(value) && Number.isFinite(Date.parse(value));
const money = (value) => value === null || Number.isFinite(value);
const positive = (value) => Number.isSafeInteger(value) && value > 0;

const assignment = (value) =>
  fields(value, ["id", "employeeId", "employeeName", "province"]) &&
  value.source === "direct" && date(value.effectiveFrom) &&
  (value.effectiveTo === null || date(value.effectiveTo));
const customer = (value) =>
  fields(value, ["id", "misaCode", "name", "taxCode", "province", "address"]) &&
  ["unknown", "state", "private"].includes(value.group) &&
  ["active", "paused"].includes(value.status) &&
  timestamp(value.createdAt) && timestamp(value.updatedAt) &&
  optional(value.openingBalance, (balance) => record(balance) && calendarDate(balance.date) && positive(balance.amount)) &&
  Array.isArray(value.assignments) && value.assignments.every(assignment);
const employee = (value) =>
  fields(value, ["id", "code", "name", "phone", "email"]) &&
  ["active", "inactive"].includes(value.status) && timestamp(value.createdAt) &&
  optional(value.linkedAccountId, (id) => text(id) && id.length > 0);
const salesLine = (value) =>
  fields(value, ["date", "documentNumber", "invoiceNumber", "customerName", "productName", "unit"]) &&
  Number.isSafeInteger(value.rowNumber) &&
  ["quantity", "unitPrice", "salesAmount", "paymentTotal"].every((key) => money(value[key])) &&
  optional(value.origin, (origin) =>
    fields(origin, ["fileName"]) && Number.isSafeInteger(origin.rowNumber)) &&
  optional(value.source, (source) =>
    fields(source, ["customerCode", "invoiceSeries", "invoiceDate"]) &&
    ["postingDate", "debitAccount", "productCode", "lotNumber"].every((key) => optional(source[key], text)));
const reversal = (value) =>
  fields(value, ["reason"]) && date(value.date) && timestamp(value.createdAt);
const receipt = (value) =>
  fields(value, ["id", "number", "customerId", "customerName", "customerCode", "reference"]) &&
  date(value.date) && timestamp(value.createdAt) && positive(value.amount) && optional(value.reversal, reversal);
const allocationLine = (value) =>
  record(value) && positive(value.amount) &&
  fields(value.invoice, ["id", "customerId", "invoiceNumber", "invoiceSeries", "documentNumber", "sourceFile"]) &&
  date(value.invoice.date) && positive(value.invoice.amount);
const allocation = (value) =>
  fields(value, ["id", "receiptId"]) && date(value.date) && timestamp(value.createdAt) &&
  Array.isArray(value.lines) && value.lines.every(allocationLine) && optional(value.reversal, reversal);
const settings = (value) =>
  fields(value, ["companyName", "companyAddress", "displayName", "tagline"]) &&
  (value.logoDataUrl === null || (text(value.logoDataUrl) && value.logoDataUrl.length <= 1500000));

export const businessGroups = Object.freeze(["salesBook", "ledger", "customers", "employees"]);

const sellerSettings = (value) =>
  optional(value.bankAccounts, (accounts) =>
    Array.isArray(accounts) && accounts.length <= 3 && accounts.every((item) => text(item) && item.length <= 500)) &&
  ["accountingContact", "signatoryName", "signatoryTitle"].every((key) =>
    optional(value[key], (item) => text(item) && item.length <= 500));

const unique = (values) => new Set(values).size === values.length;
const list = (values, check, key = "id") =>
  Array.isArray(values) && values.every(check) && unique(values.map((value) => value[key]));

/** Kiểm tra dữ liệu ghi qua máy chủ LAN bằng cùng quy tắc với bản sao lưu. */
export const isValidCustomerList = (value) => list(value, customer);
export const isValidEmployeeList = (value) => list(value, employee);
export const isValidSalesBook = (value) =>
  fields(value, ["fileName"]) && timestamp(value.importedAt) &&
  Array.isArray(value.rows) && value.rows.every(salesLine);
export const isValidSettings = (value) =>
  settings(value) &&
  ["companyName", "companyAddress", "displayName", "tagline"].every((key) => value[key].length <= 400) &&
  sellerSettings(value);
export const isValidReceiptLedger = (value) => validLedger(value);

function validLedger(value) {
  if (!fields(value, ["revision"]) || !list(value.receipts, receipt) || !list(value.allocations, allocation)) return false;
  const receipts = new Set(value.receipts.map(({ id }) => id));
  return value.allocations.every(({ receiptId }) => receipts.has(receiptId));
}

function invalid(message) {
  return Object.assign(new Error(message), { status: 400 });
}

export function makeBusinessBackup(data, companyId) {
  return { format: "cong-no-backup", version: 1, companyId, createdAt: new Date().toISOString(), data };
}

export function validateBusinessBackup(backup) {
  if (!record(backup) || backup.format !== "cong-no-backup" || backup.version !== 1 ||
    (backup.companyId !== null && !text(backup.companyId)) || !timestamp(backup.createdAt)) {
    throw invalid("Tệp không đúng định dạng sao lưu của Quản lý công nợ.");
  }
  const data = backup.data;
  if (!record(data) || !list(data.customers, customer) || !list(data.employees, employee) ||
    !unique(data.customers.map(({ misaCode }) => misaCode)) ||
    !unique(data.employees.map(({ code }) => code)) ||
    !unique(data.employees.flatMap(({ linkedAccountId }) => linkedAccountId ? [linkedAccountId] : [])) ||
    (data.salesBook !== null && (!fields(data.salesBook, ["fileName"]) ||
      !timestamp(data.salesBook.importedAt) || !Array.isArray(data.salesBook.rows) ||
      !data.salesBook.rows.every(salesLine))) ||
    (data.ledger !== null && !validLedger(data.ledger)) ||
    (data.settings !== null && !settings(data.settings))) {
    throw invalid("Bản sao lưu chứa dữ liệu nghiệp vụ không hợp lệ.");
  }
  return backup;
}

export function restoreBusinessData(backup, current, companyId, accountIds) {
  const { data } = validateBusinessBackup(backup);
  if (backup.companyId !== companyId) {
    throw invalid("Bản sao lưu không thuộc công ty hoặc kho dữ liệu đang mở.");
  }
  const restoredAt = new Date(Math.max(Date.now(), (Date.parse(current.salesBook?.importedAt ?? "") || 0) + 1));
  return {
    // Bản sao lưu cũ có thể còn trường người nhận chiết khấu; app không dùng nữa.
    customers: data.customers.map(({ recipients: _unused, ...item }) => item),
    employees: data.employees.map(({ linkedAccountId, ...item }) =>
      accountIds.has(linkedAccountId) ? { ...item, linkedAccountId } : item),
    salesBook: data.salesBook ? { ...data.salesBook, importedAt: restoredAt.toISOString() } : null,
    ledger: data.ledger ? { ...data.ledger, revision: restoredAt.toISOString() + "-" + globalThis.crypto.getRandomValues(new Uint32Array(2)).join("-") } : null,
    settings: data.settings,
  };
}

export function deleteBusinessGroups(current, groups) {
  if (!Array.isArray(groups) || !groups.length || groups.some((group) => !businessGroups.includes(group))) {
    throw invalid("Hãy chọn ít nhất một nhóm dữ liệu hợp lệ.");
  }
  const selected = new Set(groups);
  if (selected.has("salesBook") && current.ledger?.allocations.length && !selected.has("ledger")) {
    throw invalid("Cần chọn cả Khoản thu và phân bổ vì dữ liệu MISA đã được dùng để đối soát.");
  }
  if (selected.has("customers") && current.ledger?.receipts.length && !selected.has("ledger")) {
    throw invalid("Cần chọn cả Khoản thu và phân bổ vì danh mục khách hàng đang có khoản thu.");
  }
  const now = new Date();
  const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((part) => String(part).padStart(2, "0")).join("-");
  const employees = new Set(current.employees.map(({ id }) => id));
  return {
    ...current,
    salesBook: selected.has("salesBook") ? null : current.salesBook,
    ledger: selected.has("ledger") ? null : current.ledger,
    employees: selected.has("employees") ? [] : current.employees,
    customers: selected.has("customers") ? [] : selected.has("employees")
      ? current.customers.map((customer) => {
          if (!customer.assignments.some(({ employeeId, effectiveTo }) => employees.has(employeeId) && effectiveTo === null)) return customer;
          return {
            ...customer, updatedAt: now.toISOString(),
            assignments: customer.assignments.map((entry) =>
              employees.has(entry.employeeId) && entry.effectiveTo === null
                ? { ...entry, effectiveTo: entry.effectiveFrom > today ? entry.effectiveFrom : today }
                : entry),
          };
        })
      : current.customers,
  };
}
