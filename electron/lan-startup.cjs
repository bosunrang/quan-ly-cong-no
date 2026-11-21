const { pathToFileURL } = require('node:url');

function loginItem(company, settings, executable) {
  const args = [
    '--lan',
    `--company=${company.id}`,
    '--hidden',
    `--data-dir-url=${pathToFileURL(settings.directory).href}`,
  ];
  if (settings.tunnelOnly) args.push('--tunnel');
  else if (settings.loopback) args.push('--loopback');
  if (settings.tunnelOrigin) args.push('--tunnel-origin=' + settings.tunnelOrigin);
  if (settings.tls) args.push('--require-tls');
  return { name: `QuanLyCongNo-${company.id}`, path: executable, args };
}

module.exports = { loginItem };
