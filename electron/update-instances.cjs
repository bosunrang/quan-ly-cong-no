const { mkdirSync, readdirSync, rmSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

function registerInstance(directory) {
  mkdirSync(directory, { recursive: true });
  const registered = join(directory, 'pid-' + process.pid);
  const claim = join(directory, 'install-' + process.pid);
  writeFileSync(registered, '', { mode: 0o600 });

  function remove(path) {
    try { rmSync(path, { force: true }); } catch {}
  }
  function release() { remove(claim); }
  function close() {
    process.off('exit', close);
    remove(registered);
    release();
  }
  process.once('exit', close);

  function otherLiveMarkers() {
    return readdirSync(directory).filter((name) => {
      const match = /^(pid|install)-(\d+)$/.exec(name);
      if (!match || Number(match[2]) === process.pid) return false;
      if (alive(Number(match[2]))) return true;
      remove(join(directory, name));
      return false;
    });
  }

  function tryInstall() {
    try { writeFileSync(claim, '', { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code === 'EEXIST') return undefined; throw error; }

    // Instances register before checking for a claim. Publishing the claim before
    // scanning also blocks a new instance from opening its SQLite database.
    try {
      if (otherLiveMarkers().length === 0) return release;
    } catch (error) {
      release();
      throw error;
    }
    release();
    return undefined;
  }

  return { installationInProgress: () => otherLiveMarkers().some((name) => name.startsWith('install-')), tryInstall, close };
}

module.exports = { registerInstance };
