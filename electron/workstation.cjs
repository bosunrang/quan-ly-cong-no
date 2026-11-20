const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { readWorkstation, saveWorkstation } = require('./workstation-config.cjs');

function startWorkstation({ directory, createWindow, configureSession, initialOrigin, log, createUpdater }) {
  mkdirSync(directory, { recursive: true });
  app.setPath('userData', directory);
  if (!app.requestSingleInstanceLock({ workstation: true })) return app.quit();
  configureSession();
  let origin;
  try { origin = initialOrigin ? saveWorkstation(directory, initialOrigin) : readWorkstation(directory); }
  catch (error) {
    log.write('WARN', 'workstation.config.failed', error.code);
    if (initialOrigin) throw error;
  }
  let window;
  let setup;
  let quitting = false;
  let replacing = false;
  const form = join(__dirname, 'workstation.html');
  const formUrl = pathToFileURL(form).href;
  const updater = createUpdater({
    log, onChanged: () => updateMenu(),
    async prepareInstall() { quitting = true; },
  });

  function connectionFailed(error) {
    if (quitting || error.code === 'ERR_ABORTED') return;
    log.write('WARN', 'workstation.load.failed', error.code);
    const failedWindow = window;
    void dialog.showMessageBox(failedWindow, {
      type: 'warning', title: 'Không kết nối được máy chủ',
      message: 'Kiểm tra địa chỉ máy chủ và kết nối mạng.',
      buttons: ['Kết nối lại', 'Đổi địa chỉ', 'Đóng'], defaultId: 0, cancelId: 2, noLink: true,
    }).then(({ response }) => {
      if (window !== failedWindow || quitting) return;
      if (response === 0) connect();
      if (response === 1) showSetup();
      if (response === 2) app.quit();
    }).catch(() => {});
  }

  function connect() {
    if (quitting || !origin) return;
    replacing = true;
    try {
      const previous = window;
      const next = createWindow({
        url: origin + '/', showMenu: true,
        onLoadError(error) { if (window === next) connectionFailed(error); },
      });
      window = next;
      next.on('closed', () => {
        if (window === next) window = undefined;
        if (!replacing && !setup && !quitting) app.quit();
      });
      previous?.destroy();
      setup?.close();
      updateMenu();
    } finally { replacing = false; }
  }

  function showSetup() {
    if (quitting) return;
    if (setup && !setup.isDestroyed()) return setup.focus();
    setup = new BrowserWindow({
      width: 490, height: 330, resizable: false, show: false, parent: window,
      modal: Boolean(window), autoHideMenuBar: true,
      webPreferences: { preload: join(__dirname, 'workstation-preload.cjs'), sandbox: true,
        contextIsolation: true, nodeIntegration: false, devTools: false, webviewTag: false },
    });
    setup.setMenu(null);
    setup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    setup.webContents.on('will-navigate', (event) => event.preventDefault());
    setup.webContents.on('will-redirect', (event) => event.preventDefault());
    setup.on('closed', () => {
      setup = undefined;
      if (!window && !replacing && !quitting) app.quit();
    });
    setup.once('ready-to-show', () => setup?.show());
    void setup.loadFile(form).catch((error) => {
      log.write('ERROR', 'workstation.form.failed', error.code);
      dialog.showErrorBox('Không mở được thiết lập', 'Hãy mở lại ứng dụng để nhập địa chỉ máy chủ.');
      app.quit();
    });
  }

  function fromForm(event) {
    const frame = event.senderFrame;
    return setup && !setup.isDestroyed() && event.sender === setup.webContents &&
      frame?.url === formUrl && frame.parent === null;
  }
  ipcMain.handle('workstation:read', (event) => fromForm(event) ? origin : undefined);
  ipcMain.handle('workstation:save', (event, value) => {
    if (!fromForm(event) || typeof value !== 'string' || value.length > 512)
      return { ok: false, message: 'Yêu cầu không hợp lệ.' };
    try {
      origin = saveWorkstation(directory, value);
      // Let the setup renderer receive its response before replacing the window.
      setImmediate(connect);
      return { ok: true };
    } catch (error) { return { ok: false, message: error.code ? 'Không thể lưu cấu hình máy trạm.' : error.message }; }
  });

  function updateMenu() {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{
      label: 'Máy trạm',
      submenu: [
        { label: 'Đổi địa chỉ máy chủ…', click: showSetup },
        { label: 'Kết nối lại', enabled: Boolean(origin), click: connect },
        { label: 'Mở bằng trình duyệt', enabled: Boolean(origin), click: () => origin && void shell.openExternal(origin) },
        { label: 'Mở thư mục nhật ký…', click: () => void shell.openPath(log.directory) },
        ...(updater ? [updater.menuItem()] : []),
        { type: 'separator' },
        { label: 'Thoát', role: 'quit' },
      ],
    }]));
  }

  app.on('before-quit', () => { quitting = true; });
  app.on('second-instance', () => { if (setup) setup.focus(); else window?.focus(); });
  log.write('INFO', 'workstation.started');
  if (origin) connect();
  else showSetup();
}

module.exports = { startWorkstation };
