// Nhân viên kinh doanh và phân công khách hàng.
const { DATASET_KEYS, FORM, BATCH, options, validDate, previousDay, change, customerAt, employeeAt, employeeData, ensureEmployeeCode, affectedCustomers, finishEmployeeAssignments, dataLog, randomUUID } = require('./directory-helpers.cjs');
const { fail } = require('../access.cjs');

function register(router, db, readers) {
  const log = dataLog(db);
  const list = (key) => db.readDataset(key)?.data ?? [];
  const employees = '/api/employees';
  router.get(employees, () => list(DATASET_KEYS.employees), options(readers));
  router.post(employees, ({ body, account }) => change(db, (tx) => {
    const item = employeeData(body, undefined, account);
    ensureEmployeeCode(tx, item);
    tx.saveEmployee(item);
    log(account, 'Thêm nhân viên', `${item.code} · ${item.name}`);
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
    if (item.status === 'inactive' && current.status !== 'inactive')
      log(account, 'Ngừng hoạt động nhân viên', `${item.name} · Đến ${body.effectiveTo}`);
    else log(account, 'Cập nhật nhân viên', `${item.code} · ${item.name}`);
    return { employee: tx.employee(item.id), customers: affectedCustomers(tx, affected) };
  }), options(['sales'], FORM));
  router.delete(employees + '/:id', ({ body, params, account }) => change(db, (tx) => {
    const item = employeeAt(tx, params.id, body.expected);
    if (item.linkedAccountId && account.role !== 'admin')
      fail(403, 'Chỉ quản trị viên được xóa nhân viên có tài khoản liên kết.');
    const affected = tx.employeeAssignments(item.id, true);
    finishEmployeeAssignments(tx, item.id, body.effectiveTo);
    tx.deleteEmployee(item.id);
    log(account, 'Xóa nhân viên', item.name);
    return affectedCustomers(tx, affected);
  }), options(['sales'], FORM));

  router.post('/api/assignments', ({ body, account }) => change(db, (tx) => {
    const { customers: targets, employeeId, employeeName, effectiveFrom } = body;
    if (!validDate(effectiveFrom) || typeof employeeId !== 'string' || !Array.isArray(targets) ||
        !targets.length || targets.some((item) => typeof item?.id !== 'string') ||
        new Set(targets.map(({ id }) => id)).size !== targets.length)
      fail(400, 'Dữ liệu phân công không hợp lệ.');
    const employee = tx.employee(employeeId);
    if (employee?.status !== 'active' || employee.name !== employeeName)
      fail(409, 'Thông tin nhân viên đã thay đổi. Hãy chọn lại người phụ trách.');
    log(account, 'Phân công khách hàng', `${targets.length} khách hàng · ${employeeName} · Từ ${effectiveFrom}`);
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
  router.patch('/api/assignments/:id', ({ body, params, account }) => change(db, (tx) => {
    const item = tx.assignment(params.id);
    if (!item) fail(404, 'Không tìm thấy phân công.');
    const owner = customerAt(tx, item.customer_id, body.expected);
    if (item.effective_to !== null || !validDate(body.effectiveTo) || body.effectiveTo < item.effective_from)
      fail(409, 'Phân công đã kết thúc hoặc ngày kết thúc không hợp lệ.');
    tx.endAssignment(item.id, body.effectiveTo, item.customer_id);
    log(account, 'Bỏ phân công khách hàng', `${owner.name} · Đến ${body.effectiveTo}`);
    return tx.customer(item.customer_id);
  }), options(['sales'], FORM));
}

module.exports = { register };
