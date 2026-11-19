const { randomBytes } = require('node:crypto');
const { resolve } = require('node:path');
const { getCompany, sharedHostCompanies } = require('./companies.cjs');
const { createLanServer, openCompanyDatabase, listenLanServer, stopLanServer } = require('./lan.cjs');
const { initializeAdministrator } = require('./access.cjs');
const { lanOptions } = require('./lan-options.cjs');

const defaultDirectory = resolve(__dirname, '..', 'data', 'lan');

async function main() {
  const option = process.argv.find((arg) => arg.startsWith('--company='));
  const company = option ? getCompany(option.slice('--company='.length)) : undefined;
  const settings = lanOptions(process.argv, defaultDirectory);
  if (process.argv.includes('--init-admin')) {
    if (!company) throw new Error('Chỉ định công ty bằng --company=<mã-công-ty>.');
    const db = openCompanyDatabase(settings.directory, company);
    const password = randomBytes(12).toString('base64url');
    try { await initializeAdministrator(db, password); } finally { db.close(); }
    process.stdout.write(`${company.name}\nTên đăng nhập: admin\nMật khẩu tạm thời: ${password}\n`);
    return;
  }
  const servers = [];
  try {
    for (const profile of company ? [company] : sharedHostCompanies) {
      const { port } = profile;
      const server = createLanServer({ ...settings, company: profile });
      await listenLanServer(server, port, settings.host);
      servers.push(server);
      console.log(`${profile.name} - ${settings.tls ? 'https' : 'http'}://127.0.0.1:${port}/`);
      if (!settings.tls && !settings.loopback)
        console.warn('  Cảnh báo: máy chủ đang dùng HTTP không mã hóa trên mạng LAN. Đặt CONG_NO_LAN_TLS_KEY và CONG_NO_LAN_TLS_CERT để bật HTTPS.');
    }
  } catch (error) {
    await Promise.all(servers.map(stopLanServer));
    throw error;
  }
  function stop() {
    void Promise.all(servers.map(stopLanServer)).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
