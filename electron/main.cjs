const { app, BrowserWindow, dialog, Menu, session } = require('electron');
const { chooseMode, startLanHost } = require('./lan-host.cjs');

app.enableSandbox();

function configureSession() {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
}

function createWindow({ url }) {
  const appEntryUrl = url;
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#f2f5f7',
    show: false,
    autoHideMenuBar: true,
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
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== appEntryUrl) event.preventDefault();
  });
  window.webContents.on('will-redirect', (event, url) => {
    if (url !== appEntryUrl) event.preventDefault();
  });

  window.once('ready-to-show', () => window.show());
  const loaded = window.loadURL(url);
  void loaded.catch((error) => {
    if (error.code !== 'ERR_ABORTED') dialog.showErrorBox('Không mở được ứng dụng', error.message);
  });
  return window;
}

app.whenReady().then(async () => {
  const mode = process.argv.includes('--local') ? 'local' : await chooseMode(process.argv);
  if (!mode) return app.quit();
  await startLanHost(mode, { createWindow, configureSession });
}).catch((error) => {
  dialog.showErrorBox('Không khởi động được Quản lý công nợ', error.message);
  app.quit();
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

// The host remains available from the tray until explicitly quit.
app.on('window-all-closed', () => {});
