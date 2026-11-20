const { dialog } = require('electron');

/** Download in the background. Install only after the user chooses it. */
function createUpdateController({ updater, log, onChanged, prepareInstall, claimInstall, onInstallFailure,
  notify = (options) => dialog.showMessageBox(options), initialDelay = 10_000, pollInterval = 6 * 60 * 60 * 1000 }) {
  let state = 'idle';
  let installing = false;
  let confirming = false;
  let release;
  const labels = {
    idle: 'Kiểm tra cập nhật…', checking: 'Đang kiểm tra cập nhật…',
    downloading: 'Đang tải bản cập nhật…', ready: 'Cài bản cập nhật…', installing: 'Đang cài bản cập nhật…',
  };
  function change(next) {
    state = next;
    onChanged();
  }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;
  updater.allowDowngrade = false;
  updater.logger = {
    info() {}, debug() {},
    warn() { log.write('WARN', 'update.warning'); },
    error() { log.write('ERROR', 'update.provider.error'); },
  };

  function failed(error) {
    log.write('ERROR', 'update.failed', error?.code);
    if (installing) {
      installing = false;
      release?.();
      release = undefined;
      onInstallFailure();
      return;
    }
    if (state !== 'ready') change('idle');
  }
  updater.on('error', failed);
  updater.on('update-available', () => change('downloading'));
  updater.on('update-not-available', () => change('idle'));
  updater.on('update-downloaded', () => {
    log.write('INFO', 'update.ready');
    change('ready');
  });

  async function check(interactive = false) {
    if (state !== 'idle') return;
    change('checking');
    try {
      const found = await updater.checkForUpdates();
      await found?.downloadPromise;
      if (state === 'checking') change('idle');
      if (interactive && found?.isUpdateAvailable === false)
        await notify({ type: 'info', message: 'Bạn đang dùng bản mới nhất.' });
    } catch (error) {
      if (state === 'checking' || state === 'downloading') failed(error);
      if (interactive) await notify({ type: 'warning', message: 'Không kiểm tra được bản cập nhật.' });
    }
  }

  async function install() {
    if (confirming || installing || state !== 'ready') return;
    confirming = true;
    try {
      const { response } = await notify({
        type: 'question', message: 'Cài bản cập nhật và khởi động lại?',
        detail: 'Các cửa sổ và máy chủ công nợ của phiên này sẽ đóng để cài đặt.',
        buttons: ['Cài và khởi động lại', 'Để sau'], defaultId: 1, cancelId: 1, noLink: true,
      });
      if (response !== 0) return;
      release = claimInstall();
      if (!release) {
        await notify({ type: 'warning', message: 'Hãy thoát các phiên Quản lý công nợ khác rồi thử lại.' });
        return;
      }
      installing = true;
      change('installing');
      await prepareInstall();
      log.write('INFO', 'update.install');
      updater.quitAndInstall(false, true);
    } catch (error) {
      const hadStarted = installing;
      failed(error);
      if (!hadStarted) await notify({ type: 'warning', message: 'Không thể bắt đầu cài bản cập nhật.' });
    } finally { confirming = false; }
  }

  const firstCheck = setTimeout(() => void check(), initialDelay);
  const periodic = setInterval(() => void check(), pollInterval);
  firstCheck.unref();
  periodic.unref();
  return {
    menuItem() {
      return { label: labels[state], enabled: state === 'idle' || state === 'ready',
        click: () => { void (state === 'ready' ? install() : check(true)).catch(failed); } };
    },
    dispose() { clearTimeout(firstCheck); clearInterval(periodic); },
  };
}

module.exports = { createUpdateController };
