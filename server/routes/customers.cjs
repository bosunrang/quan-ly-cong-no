// Danh mục khách hàng: thêm, nhập Excel, sửa, xóa.
const { DATASET_KEYS, FORM, BATCH, options, normalize, change, customerAt, customerData, employeeData, dataLog, randomUUID } = require('./directory-helpers.cjs');
const { fail } = require('../access.cjs');
const domain = require('../domain.cjs');

function register(router, db, readers) {
  const log = dataLog(db);
  const list = (key) => db.readDataset(key)?.data ?? [];
  const customers = '/api/customers';
  router.get(customers, ({ scope }) => scope.customers(list(DATASET_KEYS.customers)), options(readers));

  function importAssignment(tx, input, item, account, employees) {
    for (const field of ['employeeCode', 'employeeName', 'assignmentFrom'])
      if (input[field] !== undefined && typeof input[field] !== 'string')
        fail(400, 'Thông tin nhân viên phụ trách không hợp lệ.');
    const employeeCode = input.employeeCode?.trim() ?? '';
    const employeeName = input.employeeName?.trim() ?? '';
    const assignmentFrom = input.assignmentFrom?.trim() ?? '';
    if (!employeeCode && !employeeName) {
      if (assignmentFrom) fail(400, 'Có ngày bắt đầu nhưng thiếu nhân viên phụ trách.');
      return;
    }
    // Nhập danh mục không được vượt quyền quản lý nhân viên hoặc phân công người khác.
    if (account.role !== 'admin') fail(403, 'Cần quản trị viên nhập danh mục có nhân viên phụ trách.');
    if (assignmentFrom && !domain.isIsoDate(assignmentFrom)) fail(400, 'Ngày bắt đầu phụ trách không hợp lệ.');
    const match = domain.resolveCustomerImportEmployee({ employeeCode, employeeName }, employees);
    if (match.error) fail(409, match.error);
    let employee = match.employee;
    if (match.create) {
      let code = match.create.code;
      if (!code) {
        do { code = 'NV-' + randomUUID().slice(0, 8).toUpperCase(); }
        while (employees.some((entry) => normalize(entry.code) === normalize(code)));
      }
      employee = employeeData({ code, name: match.create.name, phone: '', email: '', status: 'active' });
      tx.saveEmployee(employee);
      employees.push(employee);
      log(account, 'Thêm nhân viên từ danh mục khách hàng', `${employee.code} · ${employee.name}`);
    }
    tx.insertAssignment({ id: randomUUID(), employeeId: employee.id, employeeName: employee.name,
      effectiveFrom: assignmentFrom || domain.todayLocal(), province: item.province }, item.id);
  }

  function addCustomers(records, prepend, account, action, importing = false) {
    const additions = records.map((input) => customerData(input));
    return change(db, (tx) => {
      const existing = tx.customerCodes();
      const codes = new Set(existing.map(({ misa_code }) => normalize(misa_code)));
      const taxCodes = domain.customerTaxCodes(existing.map(({ name, tax_code }) => ({ name, taxCode: tax_code })));
      const employees = importing ? tx.employeeCodes().map(({ id }) => tx.employee(id)) : [];
      let order = tx.customerOrder(prepend) - (prepend ? additions.length - 1 : 0);
      for (const [index, item] of additions.entries()) {
        const code = normalize(item.misaCode);
        if (codes.has(code)) fail(409, 'Mã MISA đã có trong danh mục.');
        if (taxCodes.conflicts(item, importing)) fail(409, `Mã số thuế ${item.taxCode} đã được sử dụng.`);
        codes.add(code);
        taxCodes.add(item);
        tx.insertCustomer(item, order++);
        if (importing) importAssignment(tx, records[index], item, account, employees);
      }
      log(account, action, additions.length === 1
        ? `${additions[0].misaCode} · ${additions[0].name}` : `${additions.length} khách hàng`);
      return additions.map(({ id }) => tx.customer(id));
    });
  }

  router.post(customers, ({ body, account }) =>
    addCustomers([body], true, account, 'Thêm khách hàng')[0], options(['customers'], FORM));
  router.post(customers + '/imports', ({ body, account }) => {
    if (!Array.isArray(body.customers) || !body.customers.length)
      fail(400, 'Danh sách nhập khách hàng không hợp lệ.');
    const imported = addCustomers(body.customers, true, account, 'Nhập danh mục khách hàng', true);
    return body.includeEmployees === true ? { customers: imported, employees: list(DATASET_KEYS.employees) } : imported;
  }, options(['customers'], BATCH));
  router.patch(customers + '/:id', ({ body, params, account, scope }) => change(db, (tx) => {
    // Nhân viên chỉ sửa, xóa được khách đang được phân công cho mình, giống danh sách họ thấy.
    scope.requireCustomer(params.id);
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
    log(account, 'Cập nhật khách hàng', `${item.misaCode} · ${item.name}`);
    return item;
  }), options(['customers'], FORM));
  router.delete(customers + '/:id', ({ body, params, account, scope }) => change(db, (tx) => {
    scope.requireCustomer(params.id);
    const current = customerAt(tx, params.id, body.expected);
    if (tx.customerHasReceipts(current.id))
      fail(409, 'Khách hàng đã có chứng từ thu. Hãy chuyển sang trạng thái tạm dừng.');
    if (db.readDataset(DATASET_KEYS.openingBalances)?.data?.entries.some(({ customerId }) => customerId === current.id))
      fail(409, 'Khách hàng có số dư đầu kỳ MISA. Hãy chuyển sang trạng thái tạm dừng.');
    tx.deleteCustomer(current.id);
    log(account, 'Xóa khách hàng', `${current.misaCode} · ${current.name}`);
    return true;
  }), options(['customers'], FORM));

}

module.exports = { register };
