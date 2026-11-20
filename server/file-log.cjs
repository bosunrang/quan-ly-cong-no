const { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } = require('node:fs');
const { join } = require('node:path');

const LOG_FILE = /^app-(\d{4}-\d{2}-\d{2})\.log$/;

function createFileLog(directory, { now = () => new Date(), maxBytes = 5 * 1024 * 1024, keepDays = 30 } = {}) {
  let lastDay;
  function write(level, event, code) {
    try {
      const at = now().toISOString();
      const day = at.slice(0, 10);
      const name = 'app-' + day + '.log';
      const path = join(directory, name);
      if (lastDay !== day) {
        mkdirSync(directory, { recursive: true });
        const cutoff = new Date(Date.parse(day) - (keepDays - 1) * 86_400_000).toISOString().slice(0, 10);
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const date = LOG_FILE.exec(entry.name)?.[1];
          if (!entry.isFile() || !date || date >= cutoff) continue;
          try { unlinkSync(join(directory, entry.name)); } catch {}
        }
        lastDay = day;
      }
      const record = { at, level, event };
      // Callers supply stable error codes only. No request URLs, headers, bodies, or exception messages.
      if (typeof code === 'string' && /^[A-Z0-9_:-]{1,64}$/.test(code)) record.code = code;
      const line = JSON.stringify(record) + '\n';
      const size = statSync(path, { throwIfNoEntry: false })?.size ?? 0;
      if (size + Buffer.byteLength(line) <= maxBytes) appendFileSync(path, line, { mode: 0o600 });
    } catch {
      // A full or read-only disk must not prevent serving data.
    }
  }
  return { directory, write };
}

module.exports = { createFileLog };
