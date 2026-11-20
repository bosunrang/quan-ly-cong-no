const { DATASET_KEYS } = require('./database.cjs');
const { fail } = require('./access-errors.cjs');

function linkedEmployee(db, account) {
  return (db.readDataset(DATASET_KEYS.employees)?.data ?? [])
    .find((employee) => employee.linkedAccountId === account.id);
}

function requireLinkedEmployee(db, account, status = 403) {
  if (account.role === 'admin') return;
  const employee = linkedEmployee(db, account);
  if (!employee) fail(status, 'Tài khoản chưa liên kết với nhân viên. Vui lòng liên hệ quản trị viên.');
  if (employee.status !== 'active') fail(status, 'Nhân viên liên kết đã ngừng hoạt động. Vui lòng liên hệ quản trị viên.');
}

function assignedCustomerIds(customers, employeeId) {
  const ids = new Set();
  for (const customer of customers) {
    const assignment = customer.assignments.find(({ effectiveTo }) => !effectiveTo);
    if (assignment?.employeeId === employeeId) ids.add(customer.id);
  }
  return ids;
}

function createScope(loadIds) {
  const unrestricted = !loadIds;
  let ids;
  const assignedIds = () => ids ??= loadIds();
  const allows = (id) => unrestricted || assignedIds().has(id);
  return {
    unrestricted,
    get key() { return unrestricted ? '*' : JSON.stringify([...assignedIds()].sort()); },
    allows,
    customers: (items) => unrestricted ? items : items.filter(({ id }) => allows(id)),
    groups: (items) => unrestricted ? items : items.filter(({ customerId }) => allows(customerId)),
    ledger(data) {
      if (unrestricted) return data;
      const receipts = data.receipts.filter(({ customerId }) => allows(customerId));
      const receiptIds = new Set(receipts.map(({ id }) => id));
      return { ...data, receipts, allocations: data.allocations.filter(({ receiptId }) => receiptIds.has(receiptId)) };
    },
    requireCustomer(id) {
      if (!allows(id)) fail(404, 'Không tìm thấy khách hàng.');
    },
    receipt(data, id) {
      const receipt = data.receipts.find((item) => item.id === id && allows(item.customerId));
      if (!receipt) fail(404, 'Không tìm thấy khoản thu.');
      return receipt;
    },
  };
}

// Tính lại ở mỗi yêu cầu: chuyển giao khách hoặc bỏ liên kết có hiệu lực ngay cả với phiên cũ.
function customerScope(db, account) {
  if (account.role === 'admin') return createScope();
  return createScope(() => {
    const employee = linkedEmployee(db, account);
    if (employee?.status !== 'active') return new Set();
    return assignedCustomerIds(db.readDataset(DATASET_KEYS.customers)?.data ?? [], employee.id);
  });
}

function scopeForDashboard(customers, { employee, province }) {
  const area = province === '?' ? '' : province;
  const directory = province ? customers.filter((customer) => customer.province.trim() === area) : customers;
  return createScope(() => employee ? assignedCustomerIds(directory, employee) : new Set(directory.map(({ id }) => id)));
}

module.exports = { linkedEmployee, requireLinkedEmployee, customerScope, scopeForDashboard };
