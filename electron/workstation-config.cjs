const { isIP } = require('node:net');
const { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');

function isLocalHost(host) {
  if (host === 'localhost' || host.endsWith('.local') || /^[a-z][a-z0-9-]*$/.test(host)) return true;
  if (isIP(host) === 4) {
    const [a, b] = host.split('.').map(Number);
    return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 169 && b === 254);
  }
  const ipv6 = host.slice(1, -1);
  return isIP(ipv6) === 6 && (ipv6 === '::1' || /^(?:f[cd]|fe[89ab])/i.test(ipv6));
}

function workstationOrigin(input) {
  let url;
  try { url = new URL(input.trim()); } catch {}
  if (!url || !['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash)
    throw new Error('Nhập địa chỉ gốc của máy chủ, ví dụ http://192.168.1.20:3300 hoặc https://congno.example.com.');
  if (url.protocol === 'http:' && !isLocalHost(url.hostname))
    throw new Error('Địa chỉ ngoài mạng nội bộ cần dùng HTTPS.');
  return url.origin;
}

function readWorkstation(directory) {
  try {
    const data = JSON.parse(readFileSync(join(directory, 'server.json'), 'utf8'));
    return workstationOrigin(data.origin);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  }
}

function saveWorkstation(directory, value) {
  const origin = workstationOrigin(value);
  mkdirSync(directory, { recursive: true });
  const temporary = join(directory, 'server-' + randomUUID() + '.tmp');
  try {
    writeFileSync(temporary, JSON.stringify({ origin }) + '\n', { flag: 'wx', mode: 0o600 });
    renameSync(temporary, join(directory, 'server.json'));
  } finally { rmSync(temporary, { force: true }); }
  return origin;
}

module.exports = { workstationOrigin, readWorkstation, saveWorkstation };
