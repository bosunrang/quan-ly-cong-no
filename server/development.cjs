const { join, resolve } = require('node:path');
const { createLanServer, listenLanServer, stopLanServer } = require('./lan.cjs');
const company = Object.freeze({ id: 'local', name: 'Phát triển công nợ', port: 0 });

function developmentOptions(directory = process.env.CONG_NO_DEV_DATA_DIR || join(__dirname, '..', 'data', 'dev')) {
  directory = resolve(directory);
  return { company, directory, databasePath: join(directory, 'cong-no.sqlite'),
    staticRoot: join(__dirname, '..'), loopback: true, host: '127.0.0.1' };
}

async function startDevelopmentServer(directory, staticRoot, { devLoginKey } = {}) {
  const options = developmentOptions(directory);
  const server = createLanServer({ ...options, ...(staticRoot ? { staticRoot } : {}), devLoginKey });
  await listenLanServer(server, 0, '127.0.0.1');
  return { server, target: `http://127.0.0.1:${server.address().port}`, stop: () => stopLanServer(server) };
}

module.exports = { developmentOptions, startDevelopmentServer };

if (require.main === module) {
  startDevelopmentServer(undefined, join(__dirname, '..', 'dist')).then((backend) => {
    console.log(`Quản lý công nợ - ${backend.target}/`);
    const stop = () => void backend.stop().catch((error) => { console.error(error.message); process.exitCode = 1; });
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
