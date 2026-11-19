const { app, BrowserWindow, dialog, ipcMain, Menu, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const { openDatabase } = require('./database.cjs');
const { automaticBackups, backupDirectory } = require('../server/automatic-backup.cjs');
const { chooseMode, startLanHost } = require('./lan-host.cjs');

app.enableSandbox();
let database;
let localBackups;
let lanHost = false;
const localCompany = Object.freeze({ id: 'local', name: 'Bản cục bộ' });

// Bản JSON đầy đủ trước thao tác xóa/khôi phục; đặt tên theo cùng quy ước với
// saveBeforeChange để được dọn chung (giữ 5 bản gần nhất).
function saveBeforeChangeSync() {
  const directory = backupDirectory(app.getPath('userData'), localCompany);
  fs.mkdirSync(directory, { recursive: true });
  const name = `cong-no-${localCompany.id}-truoc-khi-thay-doi-${Date.now()}-${randomUUID()}.json`;
  fs.writeFileSync(path.join(directory, name), JSON.stringify(database.exportBusinessBackup()), { flag: 'wx' });
}

function isDatasetKey(value) {
  return typeof value === 'string' && /^cong-no\.[a-z0-9.-]+$/i.test(value) && value.length <= 120;
}

function configureDatabase() {
  const databasePath = path.join(app.getPath('userData'), 'cong-no.sqlite');
  database = openDatabase(databasePath);
  // Bản desktop cũng giữ 14 bản SQLite theo ngày như máy chủ LAN.
  localBackups = automaticBackups(databasePath, app.getPath('userData'), localCompany);
  localBackups.start();
  ipcMain.handle('database:export-business-backup', () => {
    try { return { ok: true, value: database.exportBusinessBackup() }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle('database:change-business-data', (_event, change) => {
    try {
      saveBeforeChangeSync();
      return { ok: true, value: database.changeBusinessData(change) };
    }
    catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.on('database:read-dataset', (event, key) => {
    try {
      if (!isDatasetKey(key)) throw new Error('Khóa dữ liệu không hợp lệ.');
      event.returnValue = { ok: true, value: database.readDataset(key) ?? null };
    } catch (error) {
      event.returnValue = { ok: false, error: error instanceof Error ? error.message : 'Không thể đọc SQLite.' };
    }
  });
  // Sổ bán hàng và sổ đối soát có thể lớn: đọc/ghi bất đồng bộ để không khóa giao diện.
  ipcMain.handle('database:read-dataset-async', (_event, key) => {
    try {
      if (!isDatasetKey(key)) throw new Error('Khóa dữ liệu không hợp lệ.');
      return { ok: true, value: database.readDataset(key) ?? null };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Không thể đọc SQLite.' };
    }
  });
  ipcMain.handle('database:dataset-stamp', (_event, key) => {
    try {
      if (!isDatasetKey(key)) throw new Error('Khóa dữ liệu không hợp lệ.');
      return { ok: true, value: database.datasetStamp(key) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Không thể đọc SQLite.' };
    }
  });
  ipcMain.on('database:write-dataset', (event, payload) => {
    try {
      if (!payload || !isDatasetKey(payload.key)) throw new Error('Khóa dữ liệu không hợp lệ.');
      if (payload.key === 'cong-no.accounts.v1') throw new Error('Tài khoản cần được cập nhật qua luồng Người dùng.');
      event.returnValue = { ok: true, value: database.writeDataset(payload.key, payload.version, payload.data) };
    } catch (error) {
      event.returnValue = { ok: false, error: error instanceof Error ? error.message : 'Không thể ghi SQLite.' };
    }
  });
  ipcMain.handle('database:write-receipt-ledger', (_event, payload) => {
    try {
      if (typeof payload?.revision !== 'string' || typeof payload?.data?.revision !== 'string' ||
          !Array.isArray(payload.data.receipts) || !Array.isArray(payload.data.allocations) ||
          (payload.salesBookImportedAt !== undefined && typeof payload.salesBookImportedAt !== 'string')) {
        throw new Error('Dữ liệu đối soát không hợp lệ.');
      }
      return { ok: true, value: database.writeReceiptLedger(payload.revision, payload.data, payload.salesBookImportedAt) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Không thể lưu đối soát.' };
    }
  });
  ipcMain.handle('database:write-misa-sales-book', (_event, payload) => {
    try {
      if (!payload || (payload.expectedImportedAt !== null && typeof payload.expectedImportedAt !== 'string') ||
          typeof payload.data?.importedAt !== 'string' || typeof payload.data.fileName !== 'string' ||
          !Array.isArray(payload.data.rows)) {
        throw new Error('Dữ liệu sổ bán hàng không hợp lệ.');
      }
      return { ok: true, value: database.writeMisaSalesBook(payload.expectedImportedAt, payload.data) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Không thể lưu sổ bán hàng.' };
    }
  });
  ipcMain.on('database:clear-all-data', (event, branding) => {
    try {
      if (!branding || typeof branding.displayName !== 'string' || typeof branding.tagline !== 'string' || (typeof branding.logoDataUrl !== 'string' && branding.logoDataUrl !== null)) {
        throw new Error('Thông tin nhận diện không hợp lệ.');
      }
      saveBeforeChangeSync();
      event.returnValue = { ok: true, value: database.clearAllData(branding) };
    } catch (error) {
      event.returnValue = { ok: false, error: error instanceof Error ? error.message : 'Không thể xóa dữ liệu SQLite.' };
    }
  });
  ipcMain.on('database:append-activity', (event, entry) => {
    try {
      const fields = { id: 64, time: 32, actorId: 64, actorName: 140, category: 32, action: 140, detail: 500 };
      if (!entry || Object.entries(fields).some(([key, limit]) => typeof entry[key] !== 'string' || entry[key].length > limit)) {
        throw new Error('Bản ghi nhật ký không hợp lệ.');
      }
      const payload = Object.fromEntries(Object.keys(fields).map((key) => [key, entry[key]]));
      event.returnValue = { ok: true, value: database.appendActivity(payload) };
    } catch (error) {
      event.returnValue = { ok: false, error: error instanceof Error ? error.message : 'Không thể ghi nhật ký.' };
    }
  });
  ipcMain.on('database:write-accounts', (event, payload) => {
    try {
      if (!Array.isArray(payload?.expected) || !Array.isArray(payload?.accounts))
        throw new Error('Danh sách tài khoản không hợp lệ.');
      event.returnValue = { ok: true, value: database.writeAccounts(payload.expected, payload.accounts) };
    } catch (error) {
      event.returnValue = { ok: false, error: error instanceof Error ? error.message : 'Không thể ghi tài khoản.' };
    }
  });
  ipcMain.on('database:read-activities', (event) => {
    try {
      event.returnValue = { ok: true, value: database.readActivities() };
    } catch (error) {
      event.returnValue = { ok: false, error: error instanceof Error ? error.message : 'Không thể đọc nhật ký.' };
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

function createWindow({ url } = {}) {
  const appEntry = path.join(__dirname, '..', 'dist', 'index.html');
  const appEntryUrl = url ?? pathToFileURL(appEntry).toString();
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#f2f5f7',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      ...(url ? {} : { preload: path.join(__dirname, 'preload.cjs') }),
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
  const loaded = url ? window.loadURL(url) : window.loadFile(appEntry);
  void loaded.catch((error) => {
    if (error.code !== 'ERR_ABORTED') dialog.showErrorBox('Không mở được ứng dụng', error.message);
  });
  return window;
}

app.whenReady().then(async () => {
  if (process.argv.includes('--lan') || (app.isPackaged && !process.argv.includes('--local'))) {
    const mode = await chooseMode(process.argv);
    if (!mode) return app.quit();
    if (mode !== 'local') {
      lanHost = true;
      return startLanHost(mode, { createWindow, configureSession });
    }
  }
  configureDatabase();
  configureSession();
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  dialog.showErrorBox('Không khởi động được Quản lý công nợ', error.message);
  app.quit();
});

app.on('before-quit', () => {
  void localBackups?.stop();
  localBackups = undefined;
  database?.close();
  database = undefined;
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

app.on('window-all-closed', () => {
  if (!lanHost && process.platform !== 'darwin') app.quit();
});
