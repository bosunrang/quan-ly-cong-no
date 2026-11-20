const { fail } = require('./access-errors.cjs');
const { requestPeer } = require('./client-address.cjs');
const { requireLinkedEmployee } = require('./customer-scope.cjs');
const { createHash, pbkdf2, randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const derive = promisify(pbkdf2);
const ACCOUNTS_KEY = 'cong-no.accounts.v1';
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const ADDRESS_LIMIT = 15;
const ADDRESS_WINDOW = 2 * MINUTE;
const ACCOUNT_FREE_FAILURES = 5;
const ACCOUNT_MAX_LOCK = 30 * MINUTE;
// Thẻ và quyền theo vai trò lấy từ một nguồn chung với giao diện.
const { canOpen, pagesByRole } = require('../src/domain/access/permissions.mjs');

/** Chặn nếu tài khoản không mở được thẻ nào trong danh sách (danh sách rỗng: chỉ cần đăng nhập). */
function requirePage(account, allowed) {
  if (allowed.length && !allowed.some((page) => canOpen(account, page)))
    fail(403, 'Tài khoản chưa có quyền truy cập dữ liệu này.');
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
  return hashProof(password);
}

async function hashProof(password) {
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

function activityEntry(account, category, action, detail = '') {
  return {
    id: randomUUID(), time: new Date().toISOString(), actorId: account.id,
    actorName: account.name, category, action, detail: detail.slice(0, 500),
  };
}

function audit(db, ...args) { return db.appendActivity(activityEntry(...args)); }

async function initializeAdministrator(db, password, username = 'admin') {
  const fields = accountFields({ name: 'Quản trị viên', username, role: 'admin' });
  const proof = await makeProof(password);
  const account = { ...fields, proof, id: randomUUID(), sessionVersion: randomUUID(),
    active: true, mustChangePassword: true };
  if (accountsOf(db).length) fail(409, 'Công ty này đã có tài khoản quản trị.');
  storeAccounts(db, [], [account]);
}

// Tài khoản quản trị đầu tiên của bản desktop dùng mật khẩu mặc định dễ nhớ (như app cước phí).
// Mật khẩu này ngắn hơn quy định nên chỉ được tạo ở đây; tài khoản bị buộc đặt mật khẩu mới
// (đủ quy định) trước khi xem hay sửa được dữ liệu.
const DEFAULT_ADMINISTRATOR = Object.freeze({ username: 'admin', password: 'admin' });

async function initializeDefaultAdministrator(db) {
  const { username, password } = DEFAULT_ADMINISTRATOR;
  const fields = accountFields({ name: 'Quản trị viên', username, role: 'admin' });
  const proof = await hashProof(password);
  const account = { ...fields, proof, id: randomUUID(), sessionVersion: randomUUID(),
    active: true, mustChangePassword: true };
  if (accountsOf(db).length) fail(409, 'Công ty này đã có tài khoản quản trị.');
  storeAccounts(db, [], [account]);
  return DEFAULT_ADMINISTRATOR;
}

function usableAdministrator(accounts) {
  return accounts.find((account) => account.role === 'admin' && account.active && !account.mustChangePassword);
}

async function developmentAdministrator(db) {
  const existing = usableAdministrator(accountsOf(db));
  if (existing) return existing;

  // Tạo tài khoản dev riêng nếu kho chưa có quản trị viên dùng được.
  const proof = await makeProof(randomBytes(32).toString('base64url'));
  const accounts = accountsOf(db);
  const prepared = usableAdministrator(accounts);
  if (prepared) return prepared;

  let username = 'dev-admin';
  for (let suffix = 2; accounts.some((account) => account.username === username); suffix++)
    username = `dev-admin-${suffix}`;
  const account = { id: randomUUID(), username, name: 'Quản trị phát triển', role: 'admin', proof,
    active: true, mustChangePassword: false, sessionVersion: randomUUID() };
  storeAccounts(db, accounts, [...accounts, account]);
  return account;
}

// Phiên lưu trong bảng sessions của từng công ty, chỉ giữ bản băm của token trong cookie:
// khởi động lại hay cập nhật máy chủ không làm người dùng bị đăng xuất.
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

function createAccess(db, company, tls, tunnelOrigin) {
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
  // Đăng nhập thành công được trả lại lượt đã tính trước cho địa chỉ đó.
  function refundLoginAttempt(address) {
    const byAddress = addressFailures.get(address);
    if (byAddress && byAddress.count > 0) addressFailures.set(address, { ...byAddress, count: byAddress.count - 1 });
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
  function setCookie(req, res, value, age) {
    const { secure } = requestPeer(req, tls, tunnelOrigin);
    res.setHeader('Set-Cookie', `${cookie}=${value}; Path=/api/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`);
  }
  function createSession(req, res, account) {
    const previous = token(req);
    if (previous) db.deleteSession(tokenHash(previous));
    const secret = randomBytes(32).toString('base64url');
    db.saveSession(tokenHash(secret), account.id, account.sessionVersion, Date.now() + 12 * HOUR);
    setCookie(req, res, secret, 12 * 3600);
  }
  function actor(req, allowPending = false) {
    const key = token(req);
    const session = key ? db.findSession(tokenHash(key)) : undefined;
    if (session && session.until > Date.now()) {
      const account = accountsOf(db).find((item) =>
        item.id === session.id && item.active && item.sessionVersion === session.version);
      if (account) {
        try { requireLinkedEmployee(db, account, 401); }
        catch (error) {
          db.deleteSession(tokenHash(key));
          throw error;
        }
        if (req.headers['x-cong-no-session'] && req.headers['x-cong-no-session'] !== account.sessionVersion)
          fail(401, 'Tài khoản trong trình duyệt đã thay đổi. Hãy đăng nhập lại.');
        if (account.mustChangePassword && !allowPending) fail(403, 'Bạn cần đổi mật khẩu trước.');
        return account;
      }
    }
    if (key) db.deleteSession(tokenHash(key));
    fail(401, 'Phiên đăng nhập đã hết hiệu lực.');
  }
  function administrator(req) {
    const account = actor(req);
    if (!canOpen(account, 'users')) fail(403, 'Chức năng này dành cho quản trị.');
    return account;
  }
  return {
    actor,
    async devLogin(req, res) {
      const account = await developmentAdministrator(db);
      createSession(req, res, account);
      audit(db, account, 'session', 'Đăng nhập tự động trên máy phát triển');
      return profilesFor(db, account);
    },
    async handle(operation, payload, req, res) {
      if (operation === 'login') {
        const now = Date.now();
        pruneFailures(now);
        const { address } = requestPeer(req, tls, tunnelOrigin);
        const password = payload.password;
        const username = typeof payload.username === 'string' ? payload.username.trim().toLowerCase() : '';
        checkLoginAllowed(address, username, now);
        // Tính lượt trước khi băm mật khẩu (mất vài trăm mili giây): các yêu cầu gửi song song
        // cũng bị đếm ngay nên không vượt được giới hạn theo máy hay theo tài khoản.
        recordLoginFailure(address, username, now);
        const candidate = accountsOf(db).find((account) => account.username === username && account.active);
        if (typeof password !== 'string' || password.length > 128 ||
            !await verify(password, candidate?.proof ?? dummyProof) || !candidate) {
          fail(401, 'Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.');
        }
        const latest = accountsOf(db).find((account) =>
          account.id === candidate.id && account.active && account.sessionVersion === candidate.sessionVersion);
        if (!latest) fail(401, 'Tài khoản vừa thay đổi. Hãy đăng nhập lại.');
        refundLoginAttempt(address);
        accountFailures.delete(username);
        requireLinkedEmployee(db, latest);
        createSession(req, res, latest);
        audit(db, latest, 'session', 'Đăng nhập');
        return profilesFor(db, latest);
      }
      if (operation === 'session') return profilesFor(db, actor(req, true));
      if (operation === 'logout') {
        const account = actor(req, true);
        db.deleteSession(tokenHash(token(req)));
        setCookie(req, res, '', 0);
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
      if (operation === 'delete-account') {
        const admin = administrator(req);
        const target = accountsOf(db).find(({ id }) => id === payload.id);
        if (!target) fail(404, 'Tài khoản không còn trong danh sách.');
        if (target.role === 'admin') fail(400, 'Không thể xóa tài khoản quản trị.');
        const entry = activityEntry(admin, 'accounts', 'Xóa tài khoản', target.username);
        if (!db.deleteStaffAccount(target.id, entry)) fail(409, 'Tài khoản vừa thay đổi. Hãy tải lại danh sách.');
        return profilesFor(db, admin);
      }
      fail(404, 'Chức năng không tồn tại.');
    },
  };
}

module.exports = { createAccess, initializeAdministrator, initializeDefaultAdministrator, canOpen, requirePage, audit, activityEntry, fail };
