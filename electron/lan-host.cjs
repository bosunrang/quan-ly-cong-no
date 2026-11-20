const { app, dialog, Menu, nativeImage, shell, Tray } = require('electron');
const { mkdirSync } = require('node:fs');
const { networkInterfaces } = require('node:os');
const { join } = require('node:path');
const { backupDirectory } = require('../server/automatic-backup.cjs');
const { createLanServer, listenLanServer, stopLanServer } = require('../server/lan.cjs');
const { lanOptions } = require('../server/lan-options.cjs');
const { createFileLog } = require('../server/file-log.cjs');
const { loginItem } = require('./lan-startup.cjs');
const appIcon = require('./app-icon.cjs');

function lanAddresses(company, settings) {
  const protocol = settings.tls ? 'https' : 'http';
  const ipv4 = settings.loopback ? [] : Object.values(networkInterfaces())
    .flat().filter((entry) => entry?.family === 'IPv4' && !entry.internal)
    .map((entry) => `${protocol}://${entry.address}:${company.port}/`);
  return [...new Set([...ipv4, ...(settings.tunnelOrigin ? [settings.tunnelOrigin] : [])])];
}

function showLanAddresses(company, settings) {
  void dialog.showMessageBox({
    type: 'info',
    title: company.name,
    message: 'Địa chỉ cho máy nhân viên',
    detail: lanAddresses(company, settings).join('\n') || 'Máy chủ hiện chỉ truy cập được trên máy này.',
    buttons: ['Đóng'],
  });
}

function announceFirstAdministrator(company, settings, administrator) {
  const addresses = lanAddresses(company, settings);
  return dialog.showMessageBox({
    type: 'info',
    title: company.name,
    message: 'Đây là lần chạy đầu tiên.',
    detail: `Tên đăng nhập: ${administrator.username}\nMật khẩu mặc định: ${administrator.password}\n\n` +
      'Sau khi đăng nhập, ứng dụng sẽ bắt buộc bạn đặt mật khẩu mới trước khi sử dụng.' +
      (addresses.length ? `\n\nMáy nhân viên truy cập qua:\n${addresses.join('\n')}` : ''),
    buttons: ['Tiếp tục'],
    noLink: true,
  });
}

async function startLanHost(company, { createWindow, configureSession, createUpdater }) {
  const local = company === 'local';
  if (local) company = Object.freeze({ id: 'local', name: 'Bản cục bộ', port: 0 });
  const localDirectory = app.getPath('userData');
  const defaultDirectory = app.isPackaged
    ? join(app.getPath('appData'), 'QuanLyCongNo', 'lan')
    : join(app.getAppPath(), 'data', 'lan');
  const settings = local
    ? { directory: localDirectory, databasePath: join(localDirectory, 'cong-no.sqlite'), staticRoot: join(app.getAppPath(), 'dist'), host: '127.0.0.1', loopback: true }
    : lanOptions(process.argv, defaultDirectory);
  const browserProfile = join(app.getPath('userData'), 'lan-profiles', company.id);
  mkdirSync(browserProfile, { recursive: true });
  if (!local) app.setPath('userData', browserProfile);
  const hidden = process.argv.includes('--hidden');
  if (!app.requestSingleInstanceLock({ hidden })) return app.quit();
  configureSession();
  Menu.setApplicationMenu(null);
  const log = createFileLog(join(settings.directory, 'logs', company.id));
  const server = createLanServer({ ...settings, company, log });
  // Lần chạy đầu: tạo sẵn tài khoản quản trị trước khi mở cổng, để máy chủ không chạy
  // trong tình trạng không ai đăng nhập được.
  // Như app cước phí: tài khoản admin/admin, bắt đổi mật khẩu ở lần đăng nhập đầu.
  let seeded;
  try {
    if (!server.hasAdministrator()) {
      seeded = await server.initializeDefaultAdministrator();
      log.write('INFO', 'account.first-admin.created');
    }
  } catch (error) {
    await stopLanServer(server).catch(() => {});
    throw error;
  }
  try {
    await listenLanServer(server, company.port, settings.host);
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      throw new Error(`Cổng ${company.port} đang được sử dụng. Tắt máy chủ công nợ đang dùng cổng này rồi thử lại.`);
    }
    throw error;
  }

  let quitting = false;
  let stopping;
  let stoppedForUpdate = false;
  let exitRequested = false;
  let window;
  let tray;
  const protocol = settings.tls ? 'https' : 'http';
  const port = server.address().port;
  const url = `${protocol}://127.0.0.1:${port}/`;
  const startup = local ? undefined : loginItem(company, settings, process.execPath);
  const canAutoStart = !local && app.isPackaged && process.platform === 'win32';
  const backups = backupDirectory(settings.directory, company);

  function stop() {
    if (!stopping) stopping = stopLanServer(server);
    return stopping;
  }
  const updater = createUpdater({ log, onChanged: () => updateMenu(),
    async prepareInstall() {
      quitting = true;
      await stop();
      stoppedForUpdate = true;
    },
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', (event) => {
    if (stoppedForUpdate) return;
    event.preventDefault();
    if (exitRequested) return;
    exitRequested = true;
    tray?.destroy();
    void stop()
      .then(() => app.exit(0))
      .catch((error) => {
        console.error(error);
        app.exit(1);
      });
  });

  function showWindow() {
    if (quitting) return;
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      return;
    }
    window = createWindow({ url });
    window.on('close', (event) => {
      if (quitting) return;
      // Bản cục bộ chỉ phục vụ máy này: đóng cửa sổ là thoát hẳn và dừng máy chủ.
      // Máy chủ LAN thì ẩn xuống khay để các máy trạm vẫn dùng được.
      if (local) {
        app.quit();
        return;
      }
      event.preventDefault();
      window.hide();
    });
    window.on('closed', () => { window = undefined; });
  }

  const icon = nativeImage.createFromPath(appIcon);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip(`${company.name} · Công nợ · Cổng ${port}${settings.loopback || settings.tls ? '' : ' · HTTP chưa mã hóa'}`);
  function updateMenu() {
    const items = [
      { label: 'Mở ứng dụng', click: showWindow },
      { label: 'Mở thư mục nhật ký…', click: () => void shell.openPath(log.directory) },
      ...(updater ? [updater.menuItem()] : []),
      // Bản cục bộ chỉ nghe trên 127.0.0.1 nên không có địa chỉ cho máy khác.
      ...(local ? [] : [{ label: 'Địa chỉ cho máy nhân viên…', click: () => showLanAddresses(company, settings) }]),
      {
        label: 'Mở thư mục sao lưu…',
        click: async () => {
          try {
            mkdirSync(backups, { recursive: true });
            const error = await shell.openPath(backups);
            if (error) throw new Error(error);
          } catch (error) {
            dialog.showErrorBox('Không mở được thư mục sao lưu', error.message);
          }
        },
      },
    ];
    if (canAutoStart) {
      const status = app.getLoginItemSettings({ path: startup.path, args: startup.args });
      items.push({
        label: 'Khởi động cùng Windows',
        type: 'checkbox',
        checked: status.launchItems?.some((item) => item.name === startup.name && item.enabled) ??
          status.openAtLogin,
        click: (item) => {
          try {
            app.setLoginItemSettings({ ...startup, openAtLogin: item.checked });
          } catch (error) {
            dialog.showErrorBox('Không đổi được thiết lập khởi động', error.message);
          }
          updateMenu();
        },
      });
    }
    tray.setContextMenu(Menu.buildFromTemplate([
      ...items,
      { type: 'separator' },
      { label: 'Thoát và dừng máy chủ', click: () => app.quit() },
    ]));
  }
  updateMenu();
  tray.on('double-click', showWindow);
  app.on('second-instance', (_event, _argv, _cwd, data) => {
    if (!data?.hidden) showWindow();
  });
  app.on('activate', showWindow);
  if (!hidden) {
    // Như app cước phí: báo tài khoản mặc định trước khi mở cửa sổ đăng nhập.
    if (seeded) await announceFirstAdministrator(company, settings, seeded);
    showWindow();
  }
}

module.exports = { startLanHost };
