const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { fileURLToPath } = require('node:url');

function lanOptions(argv, defaultDirectory) {
  const dataArgument = argv.find((arg) => arg.startsWith('--data-dir='));
  const dataUrl = argv.find((arg) => arg.startsWith('--data-dir-url='));
  const directory = dataUrl
    ? fileURLToPath(dataUrl.slice('--data-dir-url='.length))
    : resolve(dataArgument?.slice('--data-dir='.length) ||
      process.env.CONG_NO_LAN_DATA_DIR || defaultDirectory);
  const key = process.env.CONG_NO_LAN_TLS_KEY;
  const cert = process.env.CONG_NO_LAN_TLS_CERT;
  if (Boolean(key) !== Boolean(cert) || (!key && argv.includes('--require-tls'))) {
    throw new Error('Cần cung cấp cả khóa và chứng chỉ HTTPS.');
  }
  const tls = key ? { key: readFileSync(key), cert: readFileSync(cert) } : undefined;
  const loopback = argv.includes('--loopback');
  return {
    directory,
    tls,
    loopback,
    host: loopback ? '127.0.0.1' : '0.0.0.0',
    staticRoot: join(__dirname, '..', 'dist'),
  };
}

module.exports = { lanOptions };
