// Khi mở ứng dụng (như app cước phí): chọn công ty, rồi vai trò của máy cho công ty đó.
// Vai trò (máy chủ hay máy trạm) chỉ hỏi một lần cho mỗi công ty và được ghi nhớ.
const { dialog } = require('electron');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { companies, getCompany } = require('../server/companies.cjs');

// Thứ tự hiển thị giống app cước phí: hai công ty của máy chung trước.
const displayOrder = ['nam-hung-viet', 'naviva-group', 'tuong-khue', 'winbio'];
const shown = () => displayOrder.map(getCompany).concat(companies.filter(({ id }) => !displayOrder.includes(id)));

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return undefined; }
}

function writeJson(file, value) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } catch (error) {
    // Chỉ ảnh hưởng lựa chọn sẵn lần sau, không chặn việc mở ứng dụng.
    console.warn('Không lưu được lựa chọn khi mở ứng dụng:', error.message);
  }
}

/** Hộp chọn công ty; chọn sẵn công ty đã mở lần trước trên máy này. */
async function chooseCompany(root) {
  const list = shown();
  const last = readJson(join(root, 'last-company.json'))?.id;
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Chọn công ty',
    message: 'Bạn muốn mở dữ liệu của công ty nào?',
    detail: 'Mỗi công ty có máy chủ, tài khoản và dữ liệu hoàn toàn riêng.',
    buttons: [...list.map((company) => company.name), 'Thoát'],
    defaultId: Math.max(0, list.findIndex(({ id }) => id === last)),
    cancelId: list.length,
    noLink: true,
  });
  const company = list[response];
  if (company) writeJson(join(root, 'last-company.json'), { id: company.id });
  return company;
}

const roleFile = (root, company) => join(root, 'lan-profiles', company.id, 'machine.json');

/**
 * Vai trò của máy cho công ty: 'host' (máy chủ lưu SQLite) hoặc 'client' (máy trạm).
 * Mở tự động cùng Windows (`autoStart`) chỉ có ở máy chủ nên không hỏi.
 */
async function chooseRole(root, company, { autoStart = false } = {}) {
  const saved = readJson(roleFile(root, company))?.role;
  if (saved === 'host' || saved === 'client') return saved;
  let role = 'host';
  if (!autoStart) {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      title: 'Thiết lập máy',
      message: 'Máy này sẽ làm nhiệm vụ gì?',
      detail: 'Máy chủ lưu SQLite và phục vụ các máy trong mạng. Máy trạm chỉ kết nối tới máy chủ, không tạo dữ liệu riêng.',
      buttons: ['Máy chủ', 'Máy trạm', 'Thoát'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (response === 2) return undefined;
    role = response === 0 ? 'host' : 'client';
  }
  writeJson(roleFile(root, company), { role });
  return role;
}

module.exports = { chooseCompany, chooseRole, displayOrder };
