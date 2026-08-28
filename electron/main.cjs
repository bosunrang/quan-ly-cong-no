const { app, BrowserWindow, ipcMain, Menu, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { openDatabase } = require('./database.cjs');

app.enableSandbox();
let database;

function isDatasetKey(value) {
  return typeof value === 'string' && /^mkt-cost\.[a-z0-9.-]+$/i.test(value) && value.length <= 120;
}

function configureDatabase() {
  database = openDatabase(path.join(app.getPath('userData'), 'mkt-cost.sqlite'));
  ipcMain.on('database:read-dataset', (event, key) => {
    try {
      if (!isDatasetKey(key)) throw new Error('Khóa dữ liệu không hợp lệ.');
      event.returnValue = { ok: true, value: database.readDataset(key) ?? null };
    } catch (error) {
      event.returnValue = { ok: false, error: error instanceof Error ? error.message : 'Không thể đọc SQLite.' };
    }
  });
  ipcMain.on('database:write-dataset', (event, payload) => {
    try {
      if (!payload || !isDatasetKey(payload.key)) throw new Error('Khóa dữ liệu không hợp lệ.');
      event.returnValue = { ok: true, value: database.writeDataset(payload.key, payload.version, payload.data) };
    } catch (error) {
      event.returnValue = { ok: false, error: error instanceof Error ? error.message : 'Không thể ghi SQLite.' };
    }
  });
  ipcMain.on('database:query-products', (event, options) => {
    try {
      event.returnValue = { ok: true, value: database.queryProducts(options) };
    } catch (error) {
      event.returnValue = { ok: false, error: error instanceof Error ? error.message : 'Không thể truy vấn danh sách sản phẩm.' };
    }
  });
  ipcMain.on('database:read-product-detail', (event, productId) => {
    try {
      event.returnValue = { ok: true, value: database.readProductDetail(productId) };
    } catch (error) {
      event.returnValue = { ok: false, error: error instanceof Error ? error.message : 'Không thể đọc chi tiết sản phẩm.' };
    }
  });
  ipcMain.on('database:write-misa-details', (event, payload) => {
    try {
      if (!payload || !Number.isInteger(payload.version)) throw new Error('Phiên bản dữ liệu MISA không hợp lệ.');
      event.returnValue = { ok: true, value: database.writeMisaDetails(payload.version, payload.rows) };
    } catch (error) {
      event.returnValue = { ok: false, error: error instanceof Error ? error.message : 'Không thể ghi chi tiết MISA.' };
    }
  });
  ipcMain.on('database:query-misa-details', (event, options) => {
    try {
      event.returnValue = { ok: true, value: database.queryMisaDetails(options) };
    } catch (error) {
      event.returnValue = { ok: false, error: error instanceof Error ? error.message : 'Không thể truy vấn chi tiết MISA.' };
    }
  });
  ipcMain.on('database:query-misa-range', (event, options) => {
    try {
      event.returnValue = { ok: true, value: database.queryMisaRange(options) };
    } catch (error) {
      event.returnValue = { ok: false, error: error instanceof Error ? error.message : 'Không thể truy vấn MISA theo khoảng ngày.' };
    }
  });
  ipcMain.on('database:status', (event) => {
    try {
      event.returnValue = { ok: true, value: database.status() };
    } catch (error) {
      event.returnValue = { ok: false, error: error instanceof Error ? error.message : 'Không thể kiểm tra SQLite.' };
    }
  });
}

function configureSession() {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
}

function createWindow() {
  const appEntry = path.join(__dirname, '..', 'dist', 'index.html');
  const appEntryUrl = pathToFileURL(appEntry).toString();
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#f2f5f7',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
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

  window.loadFile(appEntry);
  window.once('ready-to-show', () => window.show());
}

app.whenReady().then(() => {
  configureDatabase();
  configureSession();
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  database?.close();
  database = undefined;
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
