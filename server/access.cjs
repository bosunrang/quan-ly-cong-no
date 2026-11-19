const { pbkdf2, randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const derive = promisify(pbkdf2);
const ACCOUNTS_KEY = 'cong-no.accounts.v1';
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const ADDRESS_LIMIT = 15;
const ADDRESS_WINDOW = 2 * MINUTE;
const ACCOUNT_FREE_FAILURES = 5;
const ACCOUNT_MAX_LOCK = 30 * MINUTE;
const pagesByRole = {
  editor: ['dashboard', 'misa', 'receivables', 'payments', 'reports', 'customers', 'sales'],
  viewer: ['dashboard', 'receivables', 'reports'],
};

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function canOpen(account, page) {
  return account.role === 'admin' ||
    (pagesByRole[account.role]?.includes(page) && (!account.pages || account.pages.includes(page)));
}

function accountsOf(db) {
  const stored = db.readDataset(ACCOUNTS_KEY);
  if (!stored) return [];
  if (stored.version !== 1 || !Array.isArray(stored.data)) fail(500, 'Không thể đọc tài khoản.');
  return stored.data;
}

function storeAccounts(db, expected, next) {
  if (!db.writeAccounts(expected, next)) fail(409, 'Danh sách tài khoản đã thay đổi. Hãy thử lại.');
}

function profilesFor(db, account) {
  const { proof: _proof, ...profile } = account;
  return {
    profile,
    accounts: profile.role === 'admin' && !profile.mustChangePassword
      ? accountsOf(db).map(({ proof: _accountProof, ...entry }) => entry) : [profile],
  };
}

function accountFields(draft) {
  const name = typeof draft?.name === 'string' ? draft.name.trim() : '';
  const username = typeof draft?.username === 'string' ? draft.username.trim().toLowerCase() : '';
  const role = draft?.role;
  if (!name || name.length > 100 || !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username))
    fail(400, 'Họ tên hoặc tên đăng nhập không hợp lệ.');
  if (role === 'admin') return { name, username, role, pages: undefined };
  if (role !== 'editor' && role !== 'viewer') fail(400, 'Vai trò không hợp lệ.');
  const allowed = pagesByRole[role];
  if (!Array.isArray(allowed) || !Array.isArray(draft.pages) || !draft.pages.length ||
      !draft.pages.every((page) => allowed.includes(page))) fail(400, 'Chọn thẻ hợp lệ cho vai trò.');
  return { name, username, role, pages: allowed.filter((page) => draft.pages.includes(page)) };
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.trim().length < 8 || password.length > 128)
    fail(400, 'Mật khẩu phải có từ 8 đến 128 ký tự.');
}

async function makeProof(password) {
  validatePassword(password);
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 600_000, 32, 'sha256');
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

const dummyProof = { salt: '0'.repeat(32), hash: '0'.repeat(64) };
async function verify(password, proof) {
  const known = Buffer.from(proof.hash, 'hex');
  const observed = await derive(password, Buffer.from(proof.salt, 'hex'), 600_000, 32, 'sha256');
  return known.length === observed.length && timingSafeEqual(known, observed);
}

function audit(db, account, category, action, detail = '') {
  return db.appendActivity({
    id: randomUUID(), time: new Date().toISOString(), actorId: account.id,
    actorName: account.name, category, action, detail: detail.slice(0, 500),
  });
}

async function initializeAdministrator(db, password, username = 'admin') {
  const fields = accountFields({ name: 'Quản trị viên', username, role: 'admin' });
  const proof = await makeProof(password);
  const account = { ...fields, proof, id: randomUUID(), sessionVersion: randomUUID(),
    active: true, mustChangePassword: true };
  if (accountsOf(db).length) fail(409, 'Công ty này đã có tài khoản quản trị.');
  storeAccounts(db, [], [account]);
}

function createAccess(db, company, tls) {
  const sessions = new Map();
  // Lần đăng nhập sai được đếm theo máy và theo tên đăng nhập. Đăng nhập đúng chỉ
  // xóa bộ đếm của chính tài khoản đó, nên không thể dùng tài khoản của mình để
  // đặt lại giới hạn rồi dò mật khẩu tài khoản khác.
  const addressFailures = new Map();
  const accountFailures = new Map();
  function pruneFailures(now) {
    for (const [key, entry] of addressFailures)
      if (entry.until <= now) addressFailures.delete(key);
    for (const [key, entry] of accountFailures)
      if (entry.lockedUntil <= now && entry.lastAt + ACCOUNT_MAX_LOCK <= now) accountFailures.delete(key);
  }
  function checkLoginAllowed(address, username, now) {
    if ((addressFailures.get(address)?.count ?? 0) >= ADDRESS_LIMIT)
      fail(429, 'Đăng nhập sai quá nhiều lần từ máy này. Thử lại sau 2 phút.');
    const entry = accountFailures.get(username);
    if (entry && entry.lockedUntil > now) {
      const minutes = Math.ceil((entry.lockedUntil - now) / MINUTE);
      fail(429, `Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau ${minutes} phút.`);
    }
  }
  function recordLoginFailure(address, username, now) {
    const byAddress = addressFailures.get(address) ?? { count: 0, until: now + ADDRESS_WINDOW };
    addressFailures.set(address, { ...byAddress, count: byAddress.count + 1 });
    if (!username || username.length > 40) return;
    const count = (accountFailures.get(username)?.count ?? 0) + 1;
    const excess = count - ACCOUNT_FREE_FAILURES;
    const lockedUntil = excess > 0 ? now + Math.min(ACCOUNT_MAX_LOCK, MINUTE * 2 ** (excess - 1)) : 0;
    accountFailures.set(username, { count, lockedUntil, lastAt: now });
  }
  const cookie = `cong_no_${company.id.replace(/-/g, '_')}`;
  function token(req) {
    return req.headers.cookie?.split(';').map((part) => part.trim())
      .find((part) => part.startsWith(`${cookie}=`))?.slice(cookie.length + 1);
  }
  function setCookie(res, value, age) {
    res.setHeader('Set-Cookie', `${cookie}=${value}; Path=/api/; HttpOnly; SameSite=Strict; Max-Age=${age}${tls ? '; Secure' : ''}`);
  }
  function createSession(req, res, account) {
    sessions.delete(token(req));
    for (const [key, session] of sessions)
      if (session.until <= Date.now()) sessions.delete(key);
    const secret = randomBytes(32).toString('base64url');
    sessions.set(secret, { id: account.id, version: account.sessionVersion, until: Date.now() + 12 * HOUR });
    setCookie(res, secret, 12 * 3600);
  }
  function actor(req, allowPending = false) {
    const key = token(req);
    const session = sessions.get(key);
    if (session && session.until > Date.now()) {
      const account = accountsOf(db).find((item) =>
        item.id === session.id && item.active && item.sessionVersion === session.version);
      if (account) {
        if (req.headers['x-cong-no-session'] && req.headers['x-cong-no-session'] !== account.sessionVersion)
          fail(401, 'Tài khoản trong trình duyệt đã thay đổi. Hãy đăng nhập lại.');
        if (account.mustChangePassword && !allowPending) fail(403, 'Bạn cần đổi mật khẩu trước.');
        return account;
      }
    }
    sessions.delete(key);
    fail(401, 'Phiên đăng nhập đã hết hiệu lực.');
  }
  function administrator(req) {
    const account = actor(req);
    if (!canOpen(account, 'users')) fail(403, 'Chức năng này dành cho quản trị.');
    return account;
  }
  return {
    actor,
    hasSession(req) {
      const session = sessions.get(token(req));
      return Boolean(session && session.until > Date.now());
    },
    async handle(operation, payload, req, res) {
      if (operation === 'login') {
        const now = Date.now();
        pruneFailures(now);
        const address = req.socket.remoteAddress ?? '';
        const password = payload.password;
        const username = typeof payload.username === 'string' ? payload.username.trim().toLowerCase() : '';
        checkLoginAllowed(address, username, now);
        const candidate = accountsOf(db).find((account) => account.username === username && account.active);
        if (typeof password !== 'string' || password.length > 128 ||
            !await verify(password, candidate?.proof ?? dummyProof) || !candidate) {
          recordLoginFailure(address, username, Date.now());
          fail(401, 'Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.');
        }
        const latest = accountsOf(db).find((account) =>
          account.id === candidate.id && account.active && account.sessionVersion === candidate.sessionVersion);
        if (!latest) fail(401, 'Tài khoản vừa thay đổi. Hãy đăng nhập lại.');
        accountFailures.delete(username);
        createSession(req, res, latest);
        audit(db, latest, 'session', 'Đăng nhập');
        return profilesFor(db, latest);
      }
      if (operation === 'session') return profilesFor(db, actor(req, true));
      if (operation === 'logout') {
        const account = actor(req, true);
        sessions.delete(token(req));
        setCookie(res, '', 0);
        audit(db, account, 'session', 'Đăng xuất');
        return true;
      }
      if (operation === 'initial-password') {
        const account = actor(req, true);
        if (!account.mustChangePassword) fail(409, 'Tài khoản không còn dùng mật khẩu tạm thời.');
        validatePassword(payload.password);
        if (await verify(payload.password, account.proof)) fail(400, 'Mật khẩu mới phải khác mật khẩu được cấp.');
        const proof = await makeProof(payload.password);
        const latest = actor(req, true);
        const accounts = accountsOf(db);
        const changed = { ...latest, proof, mustChangePassword: false, sessionVersion: randomUUID() };
        storeAccounts(db, accounts, accounts.map((item) => item.id === changed.id ? changed : item));
        createSession(req, res, changed);
        audit(db, changed, 'accounts', 'Đổi mật khẩu được cấp');
        return profilesFor(db, changed);
      }
      if (operation === 'save-account') {
        const fields = accountFields(payload.draft);
        const admin = administrator(req);
        const password = payload.draft.password;
        const proof = !payload.id || password !== '' ? await makeProof(password) : undefined;
        administrator(req);
        const accounts = accountsOf(db);
        const previous = accounts.find((account) => account.id === payload.id);
        if (payload.id && !previous) fail(404, 'Tài khoản không còn trong danh sách.');
        if (accounts.some((account) => account.id !== payload.id && account.username === fields.username))
          fail(409, 'Tên đăng nhập này đã được sử dụng.');
        const self = previous?.id === admin.id;
        if (self && fields.role !== 'admin') fail(400, 'Tài khoản đang dùng cần giữ vai trò quản trị.');
        const next = previous ? { ...previous, ...fields } : { ...fields, id: randomUUID(), active: true };
        const changedAccess = previous && (next.role !== previous.role ||
          JSON.stringify(next.pages ?? pagesByRole[next.role]) !== JSON.stringify(previous.pages ?? pagesByRole[previous.role]));
        next.proof = proof ?? previous.proof;
        next.mustChangePassword = proof ? !self : previous.mustChangePassword;
        next.sessionVersion = proof || changedAccess ? randomUUID() : previous.sessionVersion;
        storeAccounts(db, accounts, previous ? accounts.map((item) => item.id === next.id ? next : item) : [...accounts, next]);
        if (self && proof) createSession(req, res, next);
        audit(db, admin, 'accounts', previous ? 'Cập nhật tài khoản' : 'Tạo tài khoản', next.username);
        const { proof: _proof, ...account } = next;
        return { account, ...profilesFor(db, self ? next : admin) };
      }
      if (operation === 'account-status') {
        const admin = administrator(req);
        const accounts = accountsOf(db);
        const current = accounts.find((entry) => entry.id === payload.id);
        if (!current || typeof payload.active !== 'boolean' || current.id === admin.id)
          fail(400, 'Không thể cập nhật trạng thái tài khoản này.');
        if (current.active === payload.active) fail(409, 'Trạng thái tài khoản vừa thay đổi.');
        const changed = { ...current, active: payload.active, sessionVersion: randomUUID() };
        storeAccounts(db, accounts, accounts.map((item) => item.id === changed.id ? changed : item));
        audit(db, admin, 'accounts', changed.active ? 'Mở khóa tài khoản' : 'Khóa tài khoản', changed.username);
        const { proof: _proof, ...account } = changed;
        return { account, ...profilesFor(db, admin) };
      }
      fail(404, 'Chức năng không tồn tại.');
    },
  };
}

module.exports = { createAccess, initializeAdministrator, canOpen, audit, fail };
