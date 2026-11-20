const { isIP } = require('node:net');
const { fail } = require('./access-errors.cjs');

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function parseTunnelOrigin(value) {
  if (value === undefined) return undefined;
  let url;
  try { url = new URL(value); } catch {}
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash || !url.hostname.includes('.') || isIP(url.hostname)) {
    throw new Error('Địa chỉ Cloudflare Tunnel phải là một tên miền HTTPS, ví dụ https://congno.example.com.');
  }
  return url.origin;
}

function requestPeer(req, tls, tunnelOrigin) {
  const socket = req.socket.remoteAddress || 'unknown';
  const host = req.headers.host;
  const ip = req.headers['cf-connecting-ip'];
  const optedHost = tunnelOrigin && typeof host === 'string' && 'https://' + host.toLowerCase() === tunnelOrigin;
  const fromConnector = LOOPBACK.has(socket) && (ip !== undefined || req.headers['cf-ray'] !== undefined);
  if (optedHost || fromConnector) {
    if (!optedHost || !fromConnector || req.headers['x-forwarded-proto'] !== 'https' ||
        typeof ip !== 'string' || !isIP(ip)) {
      fail(403, 'Yêu cầu Cloudflare Tunnel không hợp lệ.');
    }
    return { origin: tunnelOrigin, address: ip, secure: true };
  }
  return { origin: (tls ? 'https://' : 'http://') + host, address: socket, secure: Boolean(tls) };
}

module.exports = { parseTunnelOrigin, requestPeer };
