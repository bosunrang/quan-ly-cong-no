const { DatabaseSync } = require('node:sqlite');
const { workerData } = require('node:worker_threads');

const { source, destination } = workerData;
const db = new DatabaseSync(source, { readOnly: true });
try {
  db.exec('PRAGMA busy_timeout = 5000;');
  db.prepare('VACUUM INTO ?').run(destination);
} finally {
  db.close();
}
