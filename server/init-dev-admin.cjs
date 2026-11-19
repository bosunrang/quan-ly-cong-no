const { randomBytes } = require('node:crypto');
const { openDatabase } = require('../electron/database.cjs');
const { developmentOptions } = require('./development.cjs');
const { initializeAdministrator } = require('./access.cjs');
const { mkdirSync } = require('node:fs');

async function main() {
  const options = developmentOptions();
  mkdirSync(options.directory, { recursive: true });
  const db = openDatabase(options.databasePath);
  try {
    const password = randomBytes(12).toString('base64url');
    await initializeAdministrator(db, password);
    console.log(`Tên đăng nhập: admin\nMật khẩu tạm thời: ${password}`);
  } finally { db.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
