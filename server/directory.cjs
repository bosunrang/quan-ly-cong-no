const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { DATASET_KEYS } = require('../electron/database.cjs');
const { fail } = require('./access.cjs');
const { isValidCustomerList, isValidEmployeeList } = require('../src/domain/settings/business-data.rules.mjs');

const FORM = 64 * 1024;
const BATCH = 8 * 1024 * 1024;
const options = (pages, maxBodyBytes = 0) => ({ pages, maxBodyBytes });
const normalize = (code) => code.trim().normalize('NFC').toUpperCase();
const customerFields = ['misaCode', 'name', 'group', 'taxCode', 'province', 'address', 'status'];
const employeeFields = ['code', 'name', 'phone', 'email', 'status', 'linkedAccountId'];
const pick = (input, fields) => Object.fromEntries(fields.map((key) => [key, input[key]]));
const validDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
};
const previousDay = (date) => new Date(Date.parse(date) - 86_400_000).toISOString().slice(0, 10);

function change(db, work) {
  try {
    return db.changeDirectory(work);
  } catch (error) {
    if (/^UNIQUE constraint failed: (?:customers|sales_employees)\./.test(error.message))
      fail(409, 'Mã danh mục hoặc tài khoản liên kết đã được sử dụng.');
    throw error;
  }
}

function customerAt(tx, id, expected) {
  const item = tx.customer(id);
  if (!item) fail(404, 'Khách hàng không còn trong danh mục.');
  if (item.updatedAt !== expected) fail(409, 'Khách hàng hoặc phân công vừa thay đổi. Hãy tải lại.');
  return item;
}

function employeeAt(tx, id, expected) {
  const item = tx.employee(id);
  if (!item) fail(404, 'Nhân viên không còn trong danh mục.');
  if (!isDeepStrictEqual(item, expected)) fail(409, 'Hồ sơ nhân viên vừa thay đổi. Hãy tải lại.');
  return item;
}

function employeeData(input, current, account) {
  const next = { id: current?.id ?? randomUUID(), createdAt: current?.createdAt ?? new Date().toISOString(),
    ...pick(input, employeeFields) };
  if (!isValidEmployeeList([next]) || !next.name.trim() || !next.code.trim())
    fail(400, 'Thông tin nhân viên không hợp lệ.');
  if (next.linkedAccountId !== current?.linkedAccountId && account.role !== 'admin')
    fail(403, 'Chỉ quản trị viên được thay đổi tài khoản liên kết.');
  return { ...next, code: next.code.trim(), name: next.name.trim() };
}

function customerData(input, current) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Khách hàng không hợp lệ.');
  const now = Date.now();
  const next = { id: current?.id ?? randomUUID(), createdAt: current?.createdAt ?? new Date(now).toISOString(),
    updatedAt: new Date(Math.max(now, current ? Date.parse(current.updatedAt) + 1 : 0)).toISOString(),
    assignments: current?.assignments ?? [], ...pick(input, customerFields) };
  if (!isValidCustomerList([next]) || !next.misaCode.trim() || !next.name.trim())
    fail(400, 'Thông tin khách hàng không hợp lệ.');
  return { ...next, misaCode: next.misaCode.trim(), name: next.name.trim(), taxCode: next.taxCode.trim(),
    province: next.province.trim(), address: next.address.trim() };
}

function ensureEmployeeCode(tx, item) {
  if (tx.employeeCodes().some(({ id, code }) => id !== item.id && normalize(code) === normalize(item.code)))
    fail(409, 'Mã nhân viên đã có trong danh mục.');
}

function affectedCustomers(tx, rows) {
  return [...new Set(rows.map(({ customer_id }) => customer_id))].map((id) => tx.customer(id));
}

function finishEmployeeAssignments(tx, id, effectiveTo) {
  const assignments = tx.employeeAssignments(id, true);
  if (!assignments.length) return;
  if (!validDate(effectiveTo) || assignments.some((item) => effectiveTo < item.effective_from))
    fail(409, 'Ngày kết thúc phải từ ngày bắt đầu phân công mới nhất.');
  for (const item of assignments) tx.endAssignment(item.id, effectiveTo, item.customer_id);
}

function registerDirectoryRoutes(router, db, readers) {
  const customers = '/api/customers';
  const employees = '/api/employees';
  const list = (key) => db.readDataset(key)?.data ?? [];
  router.get(customers, () => list(DATASET_KEYS.customers), options(readers));
  router.get(employees, () => list(DATASET_KEYS.employees), options(readers));

  function addCustomers(records, prepend) {
    const additions = records.map((input) => customerData(input));
    return change(db, (tx) => {
      const existing = tx.customerCodes();
      const codes = new Set(existing.map(({ misa_code }) => normalize(misa_code)));
      const taxCodes = new Set(existing.map(({ tax_code }) => tax_code).filter(Boolean));
      let order = tx.customerOrder(prepend) - (prepend ? additions.length - 1 : 0);
      for (const item of additions) {
        const code = normalize(item.misaCode);
        if (codes.has(code)) fail(409, 'Mã MISA đã có trong danh mục.');
        if (item.taxCode && taxCodes.has(item.taxCode)) fail(409, 'Mã số thuế đã được sử dụng.');
        codes.add(code);
        if (item.taxCode) taxCodes.add(item.taxCode);
        tx.insertCustomer(item, order++);
      }
      return additions;
    });
  }

  router.post(customers, ({ body }) => addCustomers([body], true)[0], options(['customers'], FORM));
  router.post(customers + '/imports', ({ body }) => {
    if (!Array.isArray(body.customers) || !body.customers.length)
      fail(400, 'Danh sách nhập khách hàng không hợp lệ.');
    return addCustomers(body.customers, true);
  }, options(['customers'], BATCH));
  router.post(customers + '/misa-supplements', ({ body }) => {
    if (!Array.isArray(body.customers) || !body.customers.length)
      fail(400, 'Danh sách bổ sung khách hàng không hợp lệ.');
    return addCustomers(body.customers, false);
  }, options(['misa'], BATCH));
  router.patch(customers + '/:id', ({ body, params }) => change(db, (tx) => {
    const current = customerAt(tx, params.id, body.expected);
    const item = customerData(body.customer, current);
    const code = normalize(item.misaCode);
    if (code !== normalize(current.misaCode)) {
      if (tx.customerHasReceipts(current.id))
        fail(409, 'Khách hàng đã có chứng từ thu. Không thể đổi mã MISA.');
    }
    const others = tx.customerCodes().filter(({ id }) => id !== current.id);
    if (code !== normalize(current.misaCode) && others.some(({ misa_code }) => normalize(misa_code) === code))
      fail(409, 'Mã MISA đã có trong danh mục.');
    if (item.taxCode && item.taxCode !== current.taxCode && others.some(({ tax_code }) => tax_code === item.taxCode))
      fail(409, 'Mã số thuế đã được sử dụng.');
    tx.updateCustomer(item);
    return item;
  }), options(['customers'], FORM));
  router.delete(customers + '/:id', ({ body, params }) => change(db, (tx) => {
    const current = customerAt(tx, params.id, body.expected);
    if (tx.customerHasReceipts(current.id))
      fail(409, 'Khách hàng đã có chứng từ thu. Hãy chuyển sang trạng thái tạm dừng.');
    tx.deleteCustomer(current.id);
    return true;
  }), options(['customers'], FORM));

  router.post(employees, ({ body, account }) => change(db, (tx) => {
    const item = employeeData(body, undefined, account);
    ensureEmployeeCode(tx, item);
    tx.saveEmployee(item);
    return tx.employee(item.id);
  }), options(['sales'], FORM));
  router.patch(employees + '/:id', ({ body, params, account }) => change(db, (tx) => {
    const current = employeeAt(tx, params.id, body.expected);
    if (!body.employee || typeof body.employee !== 'object') fail(400, 'Thông tin nhân viên không hợp lệ.');
    const item = employeeData(body.employee, current, account);
    if (item.code !== current.code) ensureEmployeeCode(tx, item);
    const affected = tx.employeeAssignments(item.id, item.name === current.name);
    if (item.status === 'inactive') finishEmployeeAssignments(tx, item.id, body.effectiveTo);
    if (item.name !== current.name) tx.renameEmployeeAssignments(item.id, item.name);
    tx.saveEmployee(item);
    return { employee: tx.employee(item.id), customers: affectedCustomers(tx, affected) };
  }), options(['sales'], FORM));
  router.delete(employees + '/:id', ({ body, params, account }) => change(db, (tx) => {
    const item = employeeAt(tx, params.id, body.expected);
    if (item.linkedAccountId && account.role !== 'admin')
      fail(403, 'Chỉ quản trị viên được xóa nhân viên có tài khoản liên kết.');
    const affected = tx.employeeAssignments(item.id, true);
    finishEmployeeAssignments(tx, item.id, body.effectiveTo);
    tx.deleteEmployee(item.id);
    return affectedCustomers(tx, affected);
  }), options(['sales'], FORM));

  router.post('/api/assignments', ({ body }) => change(db, (tx) => {
    const { customers: targets, employeeId, employeeName, effectiveFrom } = body;
    if (!validDate(effectiveFrom) || typeof employeeId !== 'string' || !Array.isArray(targets) ||
        !targets.length || targets.some((item) => typeof item?.id !== 'string') ||
        new Set(targets.map(({ id }) => id)).size !== targets.length)
      fail(400, 'Dữ liệu phân công không hợp lệ.');
    const employee = tx.employee(employeeId);
    if (employee?.status !== 'active' || employee.name !== employeeName)
      fail(409, 'Thông tin nhân viên đã thay đổi. Hãy chọn lại người phụ trách.');
    return targets.map(({ id, expected }) => {
      const item = customerAt(tx, id, expected);
      const active = item.assignments.find((assignment) => !assignment.effectiveTo);
      if (item.status !== 'active' || active?.employeeId === employeeId ||
          item.assignments.some((assignment) => effectiveFrom <= (assignment.effectiveTo ?? assignment.effectiveFrom)))
        fail(409, 'Khách hàng không còn đủ điều kiện hoặc ngày bắt đầu trùng lịch sử phân công.');
      if (active) tx.endAssignment(active.id, previousDay(effectiveFrom), id);
      tx.insertAssignment({ id: randomUUID(), employeeId, employeeName, effectiveFrom, province: item.province }, id);
      return tx.customer(id);
    });
  }), options(['sales'], BATCH));
  router.patch('/api/assignments/:id', ({ body, params }) => change(db, (tx) => {
    const item = tx.assignment(params.id);
    if (!item) fail(404, 'Không tìm thấy phân công.');
    customerAt(tx, item.customer_id, body.expected);
    if (item.effective_to !== null || !validDate(body.effectiveTo) || body.effectiveTo < item.effective_from)
      fail(409, 'Phân công đã kết thúc hoặc ngày kết thúc không hợp lệ.');
    tx.endAssignment(item.id, body.effectiveTo, item.customer_id);
    return tx.customer(item.customer_id);
  }), options(['sales'], FORM));
}

module.exports = { registerDirectoryRoutes };
