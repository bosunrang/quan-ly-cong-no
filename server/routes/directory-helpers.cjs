// Hàm dùng chung cho route danh mục khách hàng, nhân viên và phân công.
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { DATASET_KEYS } = require('../database.cjs');
const { activityEntry, fail } = require('../access.cjs');
const { isValidCustomerList, isValidEmployeeList } = require('../../src/domain/settings/business-data.rules.mjs');

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

function employeeData(input, current) {
  const next = { id: current?.id ?? randomUUID(), createdAt: current?.createdAt ?? new Date().toISOString(),
    ...pick(input, employeeFields) };
  if (!isValidEmployeeList([next]) || !next.name.trim() || !next.code.trim())
    fail(400, 'Thông tin nhân viên không hợp lệ.');
  return { ...next, code: next.code.trim(), name: next.name.trim() };
}

function customerData(input, current) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Khách hàng không hợp lệ.');
  const now = Date.now();
  const next = { id: current?.id ?? randomUUID(), createdAt: current?.createdAt ?? new Date(now).toISOString(),
    updatedAt: new Date(Math.max(now, current ? Date.parse(current.updatedAt) + 1 : 0)).toISOString(),
    assignments: current?.assignments ?? [], ...(current?.openingBalance ? { openingBalance: current.openingBalance } : {}),
    ...pick(input, customerFields) };
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

// Nhật ký ghi trên máy chủ, trong cùng giao dịch với thay đổi: không bị bỏ sót hay giả mạo.
const dataLog = (db) => (account, action, detail) => db.appendActivity(activityEntry(account, 'data', action, detail));

module.exports = { DATASET_KEYS, FORM, BATCH, options, normalize, validDate, previousDay, change, customerAt,
  employeeAt, employeeData, customerData, ensureEmployeeCode, affectedCustomers, finishEmployeeAssignments,
  dataLog, isValidCustomerList, isValidEmployeeList, randomUUID };
