const { app, BrowserWindow, dialog, session } = require('electron');
const { join } = require('node:path');
const { existsSync } = require('node:fs');
const { startWorkstation } = require('./workstation.cjs');
const { workstationOrigin } = require('./workstation-config.cjs');
const { registerInstance } = require('./update-instances.cjs');
const { createFileLog } = require('../server/file-log.cjs');
const { startLanHost } = require('./lan-host.cjs');
const { chooseCompany, chooseRole } = require('./startup-choice.cjs');
const { getCompany } = require('../server/companies.cjs');

app.enableSandbox();

function configureSession() {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
}

function createWindow({ url, onLoadError, showMenu = false }) {
  const allowed = new URL(url).origin;
  function guard(event, target) {
    try { if (new URL(target).origin === allowed) return; } catch {}
    event.preventDefault();
  }
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#f2f5f7',
    show: false,
    autoHideMenuBar: !showMenu,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
      webviewTag: false,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', guard);
  window.webContents.on('will-redirect', guard);

  window.once('ready-to-show', () => window.show());
  const loaded = window.loadURL(url);
  void loaded.catch((error) => {
    if (error.code === 'ERR_ABORTED') return;
    if (onLoadError) onLoadError(error);
    else dialog.showErrorBox('Không mở được ứng dụng', error.message);
  });
  return window;
}

app.whenReady().then(async () => {
  const root = app.getPath('userData');
  const startupLog = createFileLog(join(root, 'logs', 'desktop'));
  let instances;
  try {
    if (app.isPackaged && process.platform === 'win32') {
      instances = registerInstance(join(root, 'instances'));
      app.once('quit', instances.close);
      if (instances.installationInProgress()) throw new Error('Đang cài bản cập nhật. Hãy mở lại ứng dụng sau khi cài xong.');
    }
    const createUpdater = (options) => {
      if (!instances || !require('../package.json').congNoUpdate ||
          !existsSync(join(process.resourcesPath, 'app-update.yml'))) return undefined;
      const { createUpdateController } = require('./updater.cjs');
      const controller = createUpdateController({ ...options, updater: require('electron-updater').autoUpdater,
        claimInstall: instances.tryInstall, onInstallFailure: () => app.quit() });
      app.once('will-quit', () => controller.dispose());
      return controller;
    };
    const serverUrl = process.argv.find((arg) => arg.startsWith('--server-url='));
    const workstation = (directory) => {
      const log = createFileLog(join(directory, 'logs'));
      return startWorkstation({ directory, createWindow, configureSession, log, createUpdater,
        initialOrigin: serverUrl ? workstationOrigin(serverUrl.slice('--server-url='.length)) : undefined });
    };
    // Cờ dòng lệnh cho quản trị và lập trình: --client/--server-url (máy trạm), --local (bản thử một máy).
    if (serverUrl || process.argv.includes('--client')) return workstation(join(root, 'workstation'));
    if (process.argv.includes('--local'))
      return startLanHost('local', { createWindow, configureSession, createUpdater });
    // Như app cước phí: chọn công ty, rồi vai trò của máy cho công ty đó (chỉ hỏi lần đầu).
    const option = process.argv.find((arg) => arg.startsWith('--company='));
    const company = option ? getCompany(option.slice('--company='.length)) : await chooseCompany(root);
    if (!company) return app.quit();
    const role = await chooseRole(root, company, { autoStart: Boolean(option) });
    if (!role) return app.quit();
    if (role === 'client') return workstation(join(root, 'workstation', company.id));
    await startLanHost(company, { createWindow, configureSession, createUpdater });
  } catch (error) {
    startupLog.write('ERROR', 'desktop.start.failed', error.code);
    dialog.showErrorBox('Không khởi động được Quản lý công nợ', error.message);
    app.quit();
  }
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

// The host remains available from the tray until explicitly quit.
app.on('window-all-closed', () => {});
