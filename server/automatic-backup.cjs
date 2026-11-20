const { randomUUID } = require('node:crypto');
const { mkdir, readdir, rename, rm, stat, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { Worker } = require('node:worker_threads');

const retention = 14;
const checkInterval = 60 * 60 * 1000;

function backupDirectory(directory, company) {
  return join(directory, 'backups', company.id);
}

function dayStamp(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function copyDatabase(source, destination) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(join(__dirname, 'sqlite-snapshot.cjs'), {
      workerData: { source, destination },
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Sao lưu SQLite dừng với mã ${code}.`));
    });
  });
}

function automaticBackups(source, root, company, now = () => new Date(), log) {
  const directory = backupDirectory(root, company);
  const prefix = `cong-no-${company.id}-`;
  let active;
  let timer;
  let stopped = false;
  let lastError = false;

  async function files() {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    return entries
      .filter((entry) =>
        entry.isFile() && entry.name.startsWith(prefix) &&
        /^\d{4}-\d{2}-\d{2}\.sqlite$/.test(entry.name.slice(prefix.length)))
      .map((entry) => entry.name)
      .sort()
      .reverse();
  }

  async function snapshot() {
    const name = `${prefix}${dayStamp(now())}.sqlite`;
    await mkdir(directory, { recursive: true });
    if (!(await files()).includes(name)) {
      const temporary = join(directory, `${name}.${randomUUID()}.tmp`);
      try {
        await copyDatabase(source, temporary);
        await rename(temporary, join(directory, name));
      } finally {
        await rm(temporary, { force: true });
      }
    }
    for (const old of (await files()).slice(retention)) {
      await rm(join(directory, old), { force: true });
    }
  }

  function run() {
    if (stopped) return;
    if (!active) {
      active = snapshot().then(() => {
        lastError = false;
      }).catch((error) => {
        lastError = true;
        log?.write('WARN', 'backup.snapshot.failed', error.code);
        console.warn(`Sao lưu ${company.name}: ${error.message}`);
      }).finally(() => { active = undefined; });
    }
    return active;
  }

  return {
    run,
    start() {
      if (timer || stopped) return;
      void run();
      timer = setInterval(() => void run(), checkInterval);
      timer.unref();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await active;
    },
    async findSnapshot(fileName) {
      return (await files()).includes(fileName) ? join(directory, fileName) : undefined;
    },
    async saveBeforeChange(backup) {
      await mkdir(directory, { recursive: true });
      const safePrefix = `${prefix}truoc-khi-thay-doi-`;
      const name = safePrefix + Date.now() + "-" + randomUUID() + ".json";
      const temporary = join(directory, name + ".tmp");
      try {
        await writeFile(temporary, JSON.stringify(backup), { flag: 'wx' });
        await rename(temporary, join(directory, name));
      } finally {
        await rm(temporary, { force: true });
      }
      const entries = await readdir(directory, { withFileTypes: true });
      const previous = entries.filter((entry) => entry.isFile() &&
        entry.name.startsWith(safePrefix) &&
        /^\d{13}-[a-f0-9-]{36}\.json$/.test(entry.name.slice(safePrefix.length)))
        .map((entry) => entry.name).sort().reverse();
      for (const old of previous.slice(5)) await rm(join(directory, old), { force: true });
    },
    async status() {
      let backups = [];
      try {
        const names = await files();
        backups = (await Promise.all(names.map(async (fileName) => {
          try {
            const file = await stat(join(directory, fileName));
            return { fileName, createdAt: file.mtime.toISOString(), sizeBytes: file.size };
          } catch (error) {
            if (error.code === 'ENOENT') return undefined;
            throw error;
          }
        }))).filter(Boolean);
      } catch {
        return { backups, retention, failed: true };
      }
      return { backups, retention, failed: lastError };
    },
  };
}

module.exports = { automaticBackups, backupDirectory };
