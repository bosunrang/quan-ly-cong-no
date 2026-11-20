const { fail } = require('../access.cjs');
const domain = require('../domain.cjs');
const { change, dataLog, validDate } = require('./directory-helpers.cjs');
const { find, opts, small } = require('./helpers.cjs');

const resource = '/api/receivables/opening-balances/:id';
const pages = ['receivables'];
const sameBalance = (a, b) => a?.amount === b?.amount && a?.date === b?.date;

function register(router, db, state) {
  const log = dataLog(db);
  const isLocked = (store, id) => store.hasAllocationForInvoice(id, domain.openingBalanceDocumentId(id));

  router.get(resource, ({ params: { id }, scope }) => {
    scope.requireCustomer(id);
    const customer = find(state.customers(), id, 'khách hàng');
    return { balance: customer.openingBalance ?? null, locked: isLocked(db, id) };
  }, opts(pages));

  router.put(resource, ({ params: { id }, body, account, scope }) => {
    if (account.role === 'viewer') fail(403, 'Tài khoản chỉ có quyền xem số dư đầu kỳ.');
    scope.requireCustomer(id);
    const { expected, amount, date } = body;
    if (!Number.isSafeInteger(amount) || amount < 0 ||
        (amount > 0 && (!validDate(date) || date > domain.todayLocal())))
      fail(400, 'Nhập số tiền nguyên không âm và ngày chốt không sau hôm nay.');

    return change(db, (tx) => {
      const customer = tx.customer(id);
      if (!customer) fail(404, 'Không tìm thấy khách hàng.');
      if (!scope.unrestricted) {
        const assignment = customer.assignments.find(({ effectiveTo }) => !effectiveTo);
        const employee = assignment && tx.employee(assignment.employeeId);
        if (employee?.linkedAccountId !== account.id || employee.status !== 'active')
          fail(404, 'Không tìm thấy khách hàng.');
      }
      const prior = customer.openingBalance ?? null;
      const balance = amount ? { amount, date } : null;
      const locked = isLocked(tx, id);
      if (sameBalance(prior, balance)) return { balance: prior, locked };
      if (!sameBalance(prior, expected))
        fail(409, 'Số dư đầu kỳ vừa thay đổi. Hãy mở lại chi tiết khách hàng.');
      if (locked) fail(409, 'Số dư đầu kỳ đã dùng để phân bổ khoản thu và không thể sửa.');

      tx.setOpeningBalance(id, balance);
      log(account, 'Cập nhật số dư đầu kỳ', `${customer.misaCode} · ${prior?.amount ?? 0} → ${amount} đ${balance ? ' · ' + date : ''}`);
      return { balance, locked: false };
    });
  }, opts(pages, small));
}

module.exports = { register };
