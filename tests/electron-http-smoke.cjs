// Runs the real desktop entry against a temporary copy of the golden database.
// No windows or changes to installed application data.
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

if (!process.versions.electron) {
  const { spawn } = require('node:child_process');
  const directory = mkdtempSync(join(tmpdir(), 'cong-no-desktop-'));
  const env = { ...process.env, CONG_NO_SMOKE_DIRECTORY: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [__filename], { env, windowsHide: true, stdio: 'inherit' });
  child.on('error', (error) => { console.error(error); process.exitCode = 1; });
  child.on('exit', (code) => {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    process.exitCode = code ?? 1;
  });
} else {
  const { app, BrowserWindow, dialog } = require('electron');
  const directory = process.env.CONG_NO_SMOKE_DIRECTORY;
  app.getAppPath = () => join(__dirname, '..');
  app.setPath('userData', directory);
  app.enableSandbox();
  // The real entry is required after preparing the database, when app is already ready.
  app.enableSandbox = () => {};
  app.disableHardwareAcceleration();
  BrowserWindow.prototype.show = () => {};
  dialog.showErrorBox = (_title, message) => { console.error(message); app.exit(1); };
  process.argv.push('--local');
  const timeout = setTimeout(() => { console.error('Desktop HTTP smoke timed out'); app.exit(1); }, 45_000);
  let passed = false;
  app.on('quit', () => {
    clearTimeout(timeout);
    if (!passed) process.exitCode = 1;
  });

  async function waitFor(window, expression) {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await window.webContents.executeJavaScript(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Renderer did not reach expected state: ${expression}`);
  }

  app.whenReady().then(async () => {
    const { openDatabase } = require('../electron/database.cjs');
    const { initializeAdministrator } = require('../server/access.cjs');
    const db = openDatabase(join(directory, 'cong-no.sqlite'));
    try {
      const backup = JSON.parse(readFileSync(join(__dirname, 'fixtures/golden-backup.json'), 'utf8'));
      db.changeBusinessData({ type: 'restore', backup });
      await initializeAdministrator(db, 'smoke-temporary-123');
    } finally { db.close(); }

    app.once('browser-window-created', (_event, window) => {
      window.webContents.once('did-finish-load', () => {
        void (async () => {
          const url = window.webContents.getURL();
          assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
          assert.ok(!window.webContents.getLastWebPreferences().preload);
          assert.equal(await window.webContents.executeJavaScript('typeof window.congNoDatabase'), 'undefined');
          await waitFor(window, `document.querySelector('h1')?.textContent === 'Đăng nhập'`);
          assert.equal(await window.webContents.executeJavaScript('Boolean(document.querySelector("nav"))'), false);
          // Authenticate through the production form and cookie path.
          await window.webContents.executeJavaScript(`
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            for (const [id, value] of [['login-username', 'admin'], ['login-password', 'smoke-temporary-123']]) {
              const input = document.getElementById(id);
              setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
            }
          `);
          await window.webContents.executeJavaScript(`document.querySelector('form').requestSubmit()`);
          await waitFor(window, `document.querySelector('h1')?.textContent === 'Đổi mật khẩu'`);
          const result = await window.webContents.executeJavaScript(`(async () => {
            const call = async (method, resource, payload) => {
              const response = await fetch('/api/' + resource, { method, headers: { 'Content-Type': 'application/json', 'X-Cong-No-LAN': '1' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
              return { status: response.status, ...await response.json() };
            };
            const changed = await call('PATCH', 'session/password', { password: 'smoke-password-456' });
            if (!changed.ok) throw new Error(changed.error);
            const backup = await call('GET', 'business-backup');
            return { status: backup.status, companyId: backup.value.companyId, customers: backup.value.data.customers.length, sales: backup.value.data.salesBook.rows.length };
          })()`);
          assert.deepEqual(result, { status: 200, companyId: null, customers: 6, sales: 22 });
          await window.webContents.executeJavaScript('location.reload()');
          await waitFor(window, 'Boolean(document.querySelector("nav"))');
          console.log(JSON.stringify({ desktop: 'http', address: 'loopback', legacyDatabase: true, bridge: false, login: true, passwordChange: true, cookieRestore: true, ...result }));
          passed = true;
          app.quit();
        })().catch((error) => { console.error(error); app.exit(1); });
      });
    });
    require('../electron/main.cjs');
  }).catch((error) => { console.error(error); app.exit(1); });
}
