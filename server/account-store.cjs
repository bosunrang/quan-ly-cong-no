// Tài khoản, thẻ truy cập và phiên đăng nhập lưu trong bảng riêng (như users, user_pages,
// sessions của app cước phí) thay cho khối JSON `cong-no.accounts.v1` trước đây.
// Lớp trên (server/access.cjs) vẫn làm việc với danh sách tài khoản dạng đối tượng như cũ.
const { isDeepStrictEqual } = require('node:util');

const ACCOUNTS_KEY = 'cong-no.accounts.v1';
const known = ['id', 'username', 'name', 'role', 'active', 'mustChangePassword', 'sessionVersion', 'proof', 'pages'];

function schema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, position INTEGER NOT NULL, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')), active INTEGER,
      must_change_password INTEGER, session_version TEXT, password_salt TEXT, password_hash TEXT,
      custom_pages INTEGER NOT NULL DEFAULT 0, extra_json TEXT
    );
    CREATE TABLE IF NOT EXISTS user_pages (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, page TEXT NOT NULL, position INTEGER NOT NULL,
      PRIMARY KEY (user_id, page)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_version TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
  `);
}

const bool = (value) => (value === undefined ? null : value ? 1 : 0);

function readAccounts(db) {
  const pages = new Map();
  for (const row of db.prepare('SELECT user_id, page FROM user_pages ORDER BY user_id, position').iterate()) {
    const list = pages.get(row.user_id) ?? [];
    list.push(row.page);
    pages.set(row.user_id, list);
  }
  return db.prepare('SELECT * FROM users ORDER BY position').all().map((row) => {
    const account = { id: row.id, username: row.username, name: row.name, role: row.role };
    if (row.active !== null) account.active = Boolean(row.active);
    if (row.must_change_password !== null) account.mustChangePassword = Boolean(row.must_change_password);
    if (row.session_version !== null) account.sessionVersion = row.session_version;
    if (row.password_hash !== null) account.proof = { salt: row.password_salt, hash: row.password_hash };
    if (row.custom_pages) account.pages = pages.get(row.id) ?? [];
    return row.extra_json ? { ...account, ...JSON.parse(row.extra_json) } : account;
  });
}

/** Ghi danh sách tài khoản: cập nhật tại chỗ để phiên của tài khoản không đổi vẫn còn. */
function writeAccounts(db, accounts) {
  const upsert = db.prepare(`INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET position=excluded.position, username=excluded.username, name=excluded.name,
      role=excluded.role, active=excluded.active, must_change_password=excluded.must_change_password,
      session_version=excluded.session_version, password_salt=excluded.password_salt,
      password_hash=excluded.password_hash, custom_pages=excluded.custom_pages, extra_json=excluded.extra_json`);
  const ids = new Set(accounts.map(({ id }) => id));
  for (const { id } of db.prepare('SELECT id FROM users').all())
    if (!ids.has(id)) db.prepare('DELETE FROM users WHERE id = ?').run(id);
  // Tạm đổi tên để hoán đổi tên đăng nhập giữa hai tài khoản không vướng ràng buộc UNIQUE.
  db.prepare("UPDATE users SET username = '~' || id").run();
  const page = db.prepare('INSERT INTO user_pages VALUES (?, ?, ?)');
  accounts.forEach((account, position) => {
    const extra = Object.fromEntries(Object.entries(account).filter(([key, value]) => !known.includes(key) && value !== undefined));
    upsert.run(account.id, position, account.username, account.name, account.role, bool(account.active),
      bool(account.mustChangePassword), account.sessionVersion ?? null, account.proof?.salt ?? null,
      account.proof?.hash ?? null, Array.isArray(account.pages) ? 1 : 0,
      Object.keys(extra).length ? JSON.stringify(extra) : null);
    db.prepare('DELETE FROM user_pages WHERE user_id = ?').run(account.id);
    (account.pages ?? []).forEach((item, index) => page.run(account.id, item, index));
  });
}

/** Chuyển khối JSON tài khoản cũ sang bảng; so lại toàn bộ trước khi bỏ khối JSON. */
function migrateAccounts(db) {
  schema(db);
  const row = db.prepare('SELECT * FROM app_datasets WHERE dataset_key = ?').get(ACCOUNTS_KEY);
  if (!row) return;
  const data = JSON.parse(row.payload_json);
  if (row.version !== 1 || !Array.isArray(data) || data.some((item) => !item || typeof item.id !== 'string' ||
      typeof item.username !== 'string' || typeof item.name !== 'string' || typeof item.role !== 'string'))
    throw new Error('Không thể nâng cấp danh sách tài khoản không hợp lệ.');
  writeAccounts(db, data);
  if (!isDeepStrictEqual(readAccounts(db), data)) throw new Error('Tài khoản bị lệch sau khi nâng cấp.');
  db.prepare('DELETE FROM app_datasets WHERE dataset_key = ?').run(ACCOUNTS_KEY);
  db.prepare('DELETE FROM dataset_versions WHERE dataset_key = ?').run(ACCOUNTS_KEY);
}

function saveSession(db, tokenHash, userId, sessionVersion, expiresAt) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  db.prepare('INSERT OR REPLACE INTO sessions VALUES (?, ?, ?, ?)').run(tokenHash, userId, sessionVersion, expiresAt);
}

function findSession(db, tokenHash) {
  const row = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash);
  return row && { id: row.user_id, version: row.session_version, until: row.expires_at };
}

function deleteSession(db, tokenHash) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

module.exports = { ACCOUNTS_KEY, schema, readAccounts, writeAccounts, migrateAccounts, saveSession, findSession, deleteSession };
