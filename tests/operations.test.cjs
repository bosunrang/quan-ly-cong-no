const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { EventEmitter, once } = require('node:events');
const { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { request } = require('node:http');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { setImmediate } = require('node:timers/promises');
const { loginItem } = require('../electron/lan-startup.cjs');
const { updateConfig } = require('../electron/update-config.cjs');
const { registerInstance } = require('../electron/update-instances.cjs');
const { createUpdateController } = require('../electron/updater.cjs');
const { readWorkstation, saveWorkstation, workstationOrigin } = require('../electron/workstation-config.cjs');
const { parseTunnelOrigin, requestPeer } = require('../server/client-address.cjs');
const { createFileLog } = require('../server/file-log.cjs');
const { createLanServer, listenLanServer, stopLanServer } = require('../server/lan.cjs');
const { lanOptions } = require('../server/lan-options.cjs');
const { startDevelopmentServer } = require('../server/development.cjs');
const { openDatabase, DATASET_KEYS } = require('../server/database.cjs');
const { createAccountingState } = require('../server/accounting-state.cjs');
const { customerScope } = require('../server/customer-scope.cjs');

function workspace(t) {
  const directory = mkdtempSync(join(tmpdir(), 'cong-no-operations-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function http(port, headers, { method = 'GET', url = '/', body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1', port, method, path: url,
      headers: { 'X-Cong-No-LAN': '1', 'Content-Type': 'application/json', ...headers },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(body && JSON.stringify(body));
  });
}

test('Dashboard giữ kết quả toàn công ty khi lọc nhiều nhân viên và tính lại khi danh mục đổi', (t) => {
  const db = openDatabase(join(workspace(t), 'cong-no.sqlite'));
  try {
    const time = '2026-01-01T00:00:00.000Z';
    const customers = Array.from({ length: 40 }, (_, i) => ({ id: 'c' + i, misaCode: 'KH' + i, name: 'Khách ' + i,
      group: 'unknown', taxCode: '', province: 'Tỉnh ' + (i % 4), address: '', status: 'active', createdAt: time, updatedAt: time,
      assignments: [{ id: 'a' + i, employeeId: 'e' + (i % 20), employeeName: 'NV ' + (i % 20), province: '', source: 'direct',
        effectiveFrom: '2026-01-01', effectiveTo: null }] }));
    db.writeDataset(DATASET_KEYS.customers, 2, customers);
    db.writeMisaSalesBook(null, { fileName: 'a.xlsx', importedAt: time, rows: customers.map((customer, i) => ({
      rowNumber: i + 2, date: '2026-01-02', documentNumber: 'BH' + i, invoiceNumber: String(i), customerName: customer.name,
      productName: 'Hàng', unit: 'Hộp', quantity: 1, unitPrice: 100, salesAmount: 100, paymentTotal: 100,
      source: { customerCode: customer.misaCode, invoiceSeries: 'C26', invoiceDate: '2026-01-02', debitAccount: '131' } })) });
    const state = createAccountingState(db);
    const query = (extra = '') => new URLSearchParams('from=2026-01-01&through=2026-01-31' + extra);
    const admin = customerScope(db, { role: 'admin' });
    const whole = state.summary(query(), admin);
    assert.equal(whole.remaining, 4000);
    for (let i = 0; i < 20; i++) assert.equal(state.summary(query('&employee=e' + i), admin).remaining, 200);
    assert.equal(state.summary(query('&province=T%E1%BB%89nh%201'), admin).remaining, 1000);
    assert.equal(state.summary(query(), admin), whole, 'kết quả toàn công ty không bị đẩy khỏi bộ đệm');
    assert.equal(state.catalog(), state.catalog(), 'không dựng lại khóa danh mục khi chưa có gì ghi');

    db.writeDataset(DATASET_KEYS.customers, 2, customers.slice(1));
    const changed = state.summary(query(), admin);
    assert.notEqual(changed, whole);
    assert.equal(changed.remaining, 3900);
    state.warm();
  } finally {
    db.close();
  }
});

test('tự đăng nhập dev cần khóa nội bộ, cấp phiên quản trị và giữ tài khoản đang chờ đổi mật khẩu', async (t) => {
  const directory = workspace(t);
  const request = { method: 'POST', url: '/api/dev-login' };
  const key = { 'X-Cong-No-Dev-Login': 'test-key' };
  const normal = await startDevelopmentServer(directory);
  try {
    await normal.server.initializeAdministrator('pending-dev-password');
    assert.equal((await http(normal.server.address().port, key, request)).status, 404);
  } finally { await normal.stop(); }

  const dev = await startDevelopmentServer(directory, undefined, { devLoginKey: key['X-Cong-No-Dev-Login'] });
  try {
    const { port } = dev.server.address();
    assert.equal((await http(port, {}, request)).status, 403);
    assert.equal((await http(port, { ...key, Origin: 'https://other.example.test' }, request)).status, 403);
    const login = await http(port, key, request);
    assert.equal(login.status, 200);
    const [cookie] = login.headers['set-cookie'];
    assert.match(cookie, /; HttpOnly/);
    const dashboard = { url: '/api/dashboard?from=2026-01-01&through=2026-01-31' };
    assert.equal((await http(port, { Cookie: cookie.split(';')[0] }, dashboard)).status, 200);

    const manual = await http(port, {}, { method: 'POST', url: '/api/session',
      body: { username: 'admin', password: 'pending-dev-password' } });
    assert.equal(manual.status, 200);
    assert.equal((await http(port, { Cookie: manual.headers['set-cookie'][0].split(';')[0] }, dashboard)).status, 403);
  } finally { await dev.stop(); }
});

test('Default tunnel routing secures public sessions without configuring a hostname', async (t) => {
  const directory = workspace(t);
  mkdirSync(join(directory, 'ui'));
  writeFileSync(join(directory, 'ui', 'index.html'), '<head></head><body>Quản lý công nợ</body>');
  const company = { id: 'local', name: 'Kiểm thử' };
  const settings = lanOptions(['--tunnel'], directory);
  assert.equal(settings.host, '127.0.0.1');
  assert.equal(settings.tls, undefined);
  const startup = loginItem(company, settings, 'app.exe');
  assert.ok(startup.args.includes('--tunnel'));
  assert.equal(lanOptions(startup.args, 'unused').host, settings.host);
  const server = createLanServer({ ...settings, company, staticRoot: join(directory, 'ui') });
  await listenLanServer(server, 0, settings.host);
  try {
    const { port } = server.address();
    const body = { username: 'admin', password: 'tunnel-test-password' };
    await server.initializeAdministrator(body.password);
    const viaTunnel = { Host: 'congno.example.test', Origin: 'https://congno.example.test',
      'CF-Connecting-IP': '2001:db8::4', 'CF-Ray': 'example-SIN', 'X-Forwarded-Proto': 'https' };
    assert.equal((await http(port, viaTunnel)).status, 200);
    assert.equal((await http(port, { ...viaTunnel, 'X-Forwarded-Proto': 'http' })).status, 403);
    assert.equal((await http(port, { ...viaTunnel, 'CF-Connecting-IP': 'invalid' })).status, 403);
    const legacy = await http(port, viaTunnel, { url: '/local/api/branding?view=summary' });
    assert.equal(legacy.status, 307);
    assert.equal(legacy.headers.location, '/api/branding?view=summary');

    const login = { method: 'POST', url: '/api/session', body };
    const rejected = await http(port, { ...viaTunnel, Origin: 'https://other.example.test' }, login);
    assert.equal(rejected.status, 403);
    const connected = await http(port, viaTunnel, login);
    assert.equal(connected.status, 200);
    const [cookie] = connected.headers['set-cookie'];
    assert.match(cookie, /; HttpOnly/);
    assert.match(cookie, /; Secure/);
    assert.equal((await http(port, { ...viaTunnel, Cookie: cookie.split(';')[0] }, { url: '/api/session' })).status, 200);
    const closed = await http(port, { ...viaTunnel, Cookie: cookie.split(';')[0] }, { method: 'DELETE', url: '/api/session' });
    assert.equal(closed.status, 200);
    assert.match(closed.headers['set-cookie'][0], /; Secure/);

    const lan = await http(port, { Origin: 'http://127.0.0.1:' + port }, login);
    assert.equal(lan.status, 200);
    assert.doesNotMatch(lan.headers['set-cookie'][0], /; Secure/);
  } finally { await stopLanServer(server); }

  const logs = join(directory, 'logs', company.id);
  const log = readFileSync(join(logs, readdirSync(logs)[0]), 'utf8');
  assert.match(log, /server\.started/);
  assert.match(log, /server\.stopped/);
  assert.doesNotMatch(log, /tunnel-test-password|2001:db8|congno\.example/);
});

test('Only company servers trust local Cloudflare headers and honor an optional fixed hostname', () => {
  const tunnelOrigin = 'https://congno.example.test';
  const headers = { host: 'congno.example.test', 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-proto': 'https' };
  const req = { socket: { remoteAddress: '::ffff:127.0.0.1' }, headers };
  const peer = { origin: tunnelOrigin, address: '198.51.100.7', secure: true };
  const enabled = { allowTunnel: true };
  const pinned = { ...enabled, tunnelOrigin };
  assert.deepEqual(requestPeer(req, false, enabled), peer);
  assert.deepEqual(requestPeer(req, false, pinned), peer);
  assert.throws(() => requestPeer(req, false), { status: 403 });
  assert.throws(() => requestPeer({ ...req, headers: { ...headers, host: 'other.example.test' } }, false, pinned), { status: 403 });
  assert.throws(() => requestPeer({ ...req, headers: { ...headers, host: 'example.test/path' } }, false, enabled), { status: 403 });
  assert.throws(() => requestPeer({ ...req, socket: { remoteAddress: '192.168.1.7' } }, false, pinned), { status: 403 });
  assert.deepEqual(requestPeer({
    socket: { remoteAddress: '192.168.1.7' }, headers: { ...headers, host: '192.168.1.20:3300' },
  }, false, enabled), { origin: 'http://192.168.1.20:3300', address: '192.168.1.7', secure: false });
  assert.ok(loginItem({ id: 'local' }, { directory: tmpdir(), tunnelOrigin }, 'app.exe').args.includes('--tunnel-origin=' + tunnelOrigin));
  assert.throws(() => parseTunnelOrigin('https://congno.example.test/api'));
  assert.throws(() => parseTunnelOrigin('http://congno.example.test'));
});

test('daily file logs prune old files, cap bytes and accept only stable error codes', (t) => {
  const directory = workspace(t);
  writeFileSync(join(directory, 'app-2026-10-01.log'), '');
  writeFileSync(join(directory, 'notes.txt'), '');
  const log = createFileLog(directory, { now: () => new Date('2026-11-20T10:30:00Z'), maxBytes: 145 });
  log.write('ERROR', 'test.failed', 'secret with spaces');
  log.write('ERROR', 'test.second', 'ERR_TEST');
  assert.deepEqual(readdirSync(directory).sort(), ['app-2026-11-20.log', 'notes.txt']);
  const records = readFileSync(join(directory, 'app-2026-11-20.log'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(records, [{ at: '2026-11-20T10:30:00.000Z', level: 'ERROR', event: 'test.failed' }]);
});

test('workstation replaces its address atomically and limits plain HTTP to the LAN', (t) => {
  const directory = workspace(t);
  assert.equal(readWorkstation(directory), undefined);
  assert.equal(saveWorkstation(directory, 'http://192.168.1.20:3300/'), 'http://192.168.1.20:3300');
  assert.equal(saveWorkstation(directory, 'https://congno.example.test'), 'https://congno.example.test');
  assert.equal(readWorkstation(directory), 'https://congno.example.test');
  assert.deepEqual(readdirSync(directory), ['server.json']);
  assert.equal(workstationOrigin('http://[fd00::1]:3300'), 'http://[fd00::1]:3300');
  assert.throws(() => saveWorkstation(directory, 'http://congno.example.test'));
  assert.throws(() => workstationOrigin('https://user:pass@congno.example.test/'));
  assert.throws(() => workstationOrigin('https://congno.example.test/api'));
  assert.equal(readWorkstation(directory), 'https://congno.example.test');
});

test('Windows updates require a provisioned HTTPS source and user consent before shutdown', async () => {
  assert.equal(updateConfig(), undefined);
  assert.deepEqual(updateConfig('https://updates.example.test/congno', 'Example Org'), {
    url: 'https://updates.example.test/congno/', publisher: 'Example Org',
  });
  assert.throws(() => updateConfig('http://updates.example.test', 'Example Org'));
  assert.throws(() => updateConfig('https://updates.example.test'));
  const events = [];
  const notifications = [];
  const logs = [];
  const updater = new EventEmitter();
  updater.quitAndInstall = (...args) => events.push(['install', ...args]);
  let response = 1;
  updater.checkForUpdates = async () => {
    updater.emit('update-available');
    const error = new Error('Download failed');
    updater.emit('error', error);
    return { isUpdateAvailable: true, downloadPromise: Promise.reject(error) };
  };
  const controller = createUpdateController({
    updater, log: { write: (_level, event) => logs.push(event) }, onChanged() {},
    notify: async (options) => { notifications.push(options); return { response }; }, claimInstall: () => () => {},
    prepareInstall: async () => { events.push('closed-server'); }, onInstallFailure: assert.fail,
  });
  try {
    assert.equal(updater.autoInstallOnAppQuit, false);
    assert.equal(updater.allowDowngrade, false);
    controller.menuItem().click();
    await setImmediate();
    assert.equal(controller.menuItem().enabled, true);
    assert.deepEqual(logs, ['update.failed']);
    updater.emit('update-available');
    assert.equal(controller.menuItem().enabled, false);
    const beforeDownload = notifications.length;
    updater.emit('update-downloaded');
    await setImmediate();
    assert.equal(notifications.length, beforeDownload + 1, 'download completion automatically asks before installing');
    assert.equal(notifications.at(-1).defaultId, 1);
    assert.deepEqual(events, []);
    response = 0;
    controller.menuItem().click();
    await setImmediate();
    assert.deepEqual(events, ['closed-server', ['install', false, true]]);
  } finally { controller.dispose(); }
});

test('an update claim excludes other running profiles', async (t) => {
  const directory = workspace(t);
  const instances = registerInstance(directory);
  t.after(instances.close);
  const child = spawn(process.execPath, ['-e', [
    'const { registerInstance } = require(process.argv[1]);',
    'const instances = registerInstance(process.argv[2]);',
    'process.send(instances.installationInProgress());',
    'process.on("message", () => process.exit(0));',
  ].join('\n'), join(__dirname, '../electron/update-instances.cjs'), directory], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  try {
    const [blocked] = await once(child, 'message');
    assert.equal(blocked, false);
    assert.equal(instances.tryInstall(), undefined);
    const exit = once(child, 'exit');
    child.send('exit');
    assert.deepEqual(await exit, [0, null]);
    const release = instances.tryInstall();
    assert.equal(typeof release, 'function');
    assert.equal(instances.tryInstall(), undefined);
    release();
  } finally { if (child.exitCode === null) child.kill(); }
});
