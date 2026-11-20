const assert = require('node:assert/strict');
const { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

if (!process.versions.electron) {
  const { spawn } = require('node:child_process');
  const directory = mkdtempSync(join(tmpdir(), 'cong-no-workstation-'));
  const env = { ...process.env, CONG_NO_SMOKE_DIRECTORY: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [__filename], { env, windowsHide: true, stdio: 'inherit' });
  child.on('error', (error) => { console.error(error); process.exitCode = 1; });
  child.on('close', (code) => {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    process.exitCode = code ?? 1;
  });
} else {
  const { app, BrowserWindow, dialog } = require('electron');
  const { createLanServer, listenLanServer, stopLanServer } = require('../server/lan.cjs');
  const directory = process.env.CONG_NO_SMOKE_DIRECTORY;
  const hostDirectory = join(directory, 'server');
  const profile = join(directory, 'workstation');
  app.setPath('userData', directory);
  app.enableSandbox();
  app.enableSandbox = () => {};
  app.disableHardwareAcceleration();
  BrowserWindow.prototype.show = () => {};
  dialog.showErrorBox = (_title, message) => { console.error(message); app.exit(1); };
  process.argv.push('--client');
  const timeout = setTimeout(() => { console.error('Electron workstation smoke timed out'); app.exit(1); }, 45_000);
  let passed = false;
  app.on('quit', () => {
    clearTimeout(timeout);
    if (!passed) process.exitCode = 1;
  });

  async function waitFor(contents, expression) {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await contents.executeJavaScript(expression)) return;
      await delay(100);
    }
    throw new Error('Renderer did not reach expected state: ' + expression);
  }

  app.whenReady().then(async () => {
    const company = { id: 'winbio', name: 'Winbio' };
    const server = createLanServer({ company, directory: hostDirectory, staticRoot: join(__dirname, '../dist') });
    await server.initializeAdministrator('workstation-smoke-123');
    await listenLanServer(server, 0, '127.0.0.1');
    const origin = 'http://127.0.0.1:' + server.address().port;
    let configured = false;
    app.on('browser-window-created', (_event, window) => {
      const contents = window.webContents;
      contents.once('did-finish-load', () => {
        void (async () => {
          if (!configured) {
            assert.match(contents.getURL(), /^file:\/\/.*\/workstation\.html$/);
            assert.equal(await contents.executeJavaScript('typeof window.workstationSetup.save'), 'function');
            configured = true;
            await contents.executeJavaScript("document.getElementById('server').value = " + JSON.stringify(origin) +
              "; document.querySelector('form').requestSubmit()");
            return;
          }

          assert.equal(contents.getURL(), origin + '/');
          const preferences = contents.getLastWebPreferences();
          assert.equal(preferences.sandbox, true);
          assert.equal(preferences.contextIsolation, true);
          assert.equal(preferences.nodeIntegration, false);
          assert.ok(!preferences.preload);
          assert.equal(await contents.executeJavaScript('typeof window.workstationSetup'), 'undefined');
          assert.equal(await contents.executeJavaScript("window.open('https://example.invalid') === null"), true);
          await waitFor(contents, "document.querySelector('h1')?.textContent === 'Đăng nhập'");
          assert.equal(await contents.executeJavaScript("(" + async function login() {
            const response = await fetch('/api/session', {
              method: 'POST', headers: { 'X-Cong-No-LAN': '1', 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: 'admin', password: 'workstation-smoke-123' }),
            });
            return response.status;
          } + ")()"), 200);
          await contents.executeJavaScript('location.reload()');
          await waitFor(contents, "document.querySelector('h1')?.textContent === 'Đổi mật khẩu'");
          assert.deepEqual(JSON.parse(readFileSync(join(profile, 'server.json'), 'utf8')), { origin });
          assert.ok(readdirSync(join(profile, 'logs')).some((name) => name.endsWith('.log')));
          assert.ok(!existsSync(join(directory, 'cong-no.sqlite')));
          assert.ok(!readdirSync(profile, { recursive: true }).some((name) => name.endsWith('.sqlite')));
          assert.ok(existsSync(join(hostDirectory, 'cong-no-winbio.sqlite')));
          // Như app cước phí: bấm X chỉ ẩn cửa sổ xuống khay, máy trạm vẫn chạy.
          const window = BrowserWindow.fromWebContents(contents);
          window.close();
          await delay(200);
          assert.equal(window.isDestroyed(), false);
          assert.equal(window.isVisible(), false);
          await stopLanServer(server);
          console.log(JSON.stringify({ desktop: 'workstation', setupForm: true, savedOrigin: true, remoteLogin: true, remoteCookie: true, bridge: false, localDatabase: false, closeHidesToTray: true }));
          passed = true;
          app.quit();
        })().catch((error) => { console.error(error); app.exit(1); });
      });
    });
    require('../electron/main.cjs');
  }).catch((error) => { console.error(error); app.exit(1); });
}
