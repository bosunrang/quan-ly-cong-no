// Nạp phần tính toán dùng chung (src/domain) đã build cho máy chủ: server/generated/domain.cjs.
// Tệp này không nằm trong git; `pnpm build:domain` tạo ra nó (các lệnh chạy đều tự gọi trước).
// Khi phát triển (CONG_NO_DOMAIN_RELOAD=1), tệp được nạp lại sau mỗi lần build để máy chủ và
// giao diện luôn dùng cùng công thức.
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, 'generated', 'domain.cjs');
let loaded;
let loadedAt = 0;

function load() {
  const reload = process.env.CONG_NO_DOMAIN_RELOAD === '1';
  if (loaded && !reload) return loaded;
  let modified;
  try {
    modified = fs.statSync(file).mtimeMs;
  } catch {
    throw new Error('Chưa build phần tính toán cho máy chủ (server/generated/domain.cjs). Chạy: pnpm build:domain');
  }
  if (loaded && modified === loadedAt) return loaded;
  delete require.cache[require.resolve(file)];
  loaded = require(file);
  loadedAt = modified;
  return loaded;
}

load();
module.exports = new Proxy({}, { get: (_target, name) => load()[name] });
