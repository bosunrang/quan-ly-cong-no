const { parentPort, workerData } = require('node:worker_threads');
const { startDevelopmentServer } = require('./development.cjs');

startDevelopmentServer(undefined, undefined, workerData).then((backend) => {
  parentPort.once('message', async () => {
    try { await backend.stop(); }
    finally { parentPort.close(); }
  });
  parentPort.postMessage(backend.target);
}).catch((error) => {
  throw error;
});
