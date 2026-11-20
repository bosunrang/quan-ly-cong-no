// Danh mục khách hàng: thêm, nhập Excel, sửa, xóa.
const { DATASET_KEYS, FORM, BATCH, options, normalize, change, customerAt, customerData, dataLog } = require('./directory-helpers.cjs');
const { fail } = require('../access.cjs');
const domain = require('../domain.cjs');

function register(router, db, readers) {
  const log = dataLog(db);
  const list = (key) => db.readDataset(key)?.data ?? [];
  const customers = '/api/customers';
  router.get(customers, ({ scope }) => scope.customers(list(DATASET_KEYS.customers)), options(readers));

  function addCustomers(records, prepend, account, action, allowSharedTaxCode = false) {
    const additions = records.map((input) => customerData(input));
    return change(db, (tx) => {
      const existing = tx.customerCodes();
      const codes = new Set(existing.map(({ misa_code }) => normalize(misa_code)));
      const taxCodes = domain.customerTaxCodes(existing.map(({ name, tax_code }) => ({ name, taxCode: tax_code })));
      let order = tx.customerOrder(prepend) - (prepend ? additions.length - 1 : 0);
      for (const item of additions) {
        const code = normalize(item.misaCode);
        if (codes.has(code)) fail(409, 'Mã MISA đã có trong danh mục.');
        if (taxCodes.conflicts(item, allowSharedTaxCode)) fail(409, `Mã số thuế ${item.taxCode} đã được sử dụng.`);
        codes.add(code);
        taxCodes.add(item);
        tx.insertCustomer(item, order++);
      }
      log(account, action, additions.length === 1
        ? `${additions[0].misaCode} · ${additions[0].name}` : `${additions.length} khách hàng`);
      return additions;
    });
  }

  router.post(customers, ({ body, account }) =>
    addCustomers([body], true, account, 'Thêm khách hàng')[0], options(['customers'], FORM));
  router.post(customers + '/imports', ({ body, account }) => {
    if (!Array.isArray(body.customers) || !body.customers.length)
      fail(400, 'Danh sách nhập khách hàng không hợp lệ.');
    return addCustomers(body.customers, true, account, 'Nhập danh mục khách hàng', true);
  }, options(['customers'], BATCH));
  router.patch(customers + '/:id', ({ body, params, account }) => change(db, (tx) => {
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
  router.delete(customers + '/:id', ({ body, params, account }) => change(db, (tx) => {
    const current = customerAt(tx, params.id, body.expected);
    if (current.openingBalance) fail(409, 'Khách hàng đang có số dư đầu kỳ. Hãy kiểm tra số dư trước khi xóa.');
    if (tx.customerHasReceipts(current.id))
      fail(409, 'Khách hàng đã có chứng từ thu. Hãy chuyển sang trạng thái tạm dừng.');
    tx.deleteCustomer(current.id);
    log(account, 'Xóa khách hàng', `${current.misaCode} · ${current.name}`);
    return true;
  }), options(['customers'], FORM));

}

module.exports = { register };
