// Runs the real desktop entry on an empty store: the first administrator is created
// automatically as admin/admin (like the freight app) and must change the password.
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

if (!process.versions.electron) {
  const { spawn } = require('node:child_process');
  const directory = mkdtempSync(join(tmpdir(), 'cong-no-first-admin-'));
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
  app.disableHardwareAcceleration();
  BrowserWindow.prototype.show = () => {};
  dialog.showErrorBox = (_title, message) => { console.error(message); app.exit(1); };
  const announcements = [];
  dialog.showMessageBox = async (...args) => {
    announcements.push(args.find((value) => value && typeof value === 'object' && 'message' in value));
    return { response: 0 };
  };
  process.argv.push('--local');
  const timeout = setTimeout(() => { console.error('First admin smoke timed out'); app.exit(1); }, 45_000);
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

  app.once('browser-window-created', (_event, window) => {
    window.webContents.once('did-finish-load', () => {
      void (async () => {
        assert.equal(announcements.length, 1);
        assert.match(announcements[0].detail, /Tên đăng nhập: admin\nMật khẩu mặc định: admin/);
        await waitFor(window, `document.querySelector('h1')?.textContent === 'Đăng nhập'`);
        const login = await window.webContents.executeJavaScript(`(async () => {
          const response = await fetch('/api/session', { method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Cong-No-LAN': '1' },
            body: JSON.stringify({ username: 'admin', password: 'admin' }) });
          const body = await response.json();
          return { status: response.status, mustChangePassword: body.value.profile.mustChangePassword };
        })()`);
        assert.deepEqual(login, { status: 200, mustChangePassword: true });
        await window.webContents.executeJavaScript('location.reload()');
        await waitFor(window, `document.querySelector('h1')?.textContent === 'Đổi mật khẩu'`);
        console.log(JSON.stringify({ desktop: 'first-admin', announced: true, defaultLogin: true, mustChangePassword: true }));
        passed = true;
        app.quit();
      })().catch((error) => { console.error(error); app.exit(1); });
    });
  });
  require('../electron/main.cjs');
}
