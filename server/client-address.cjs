const { isIP } = require('node:net');
const { fail } = require('./access-errors.cjs');

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function tunnelHostnameOrigin(value) {
  if (value === undefined) return undefined;
  let url;
  try { url = new URL(value); } catch {}
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash || !url.hostname.includes('.') || isIP(url.hostname)) return undefined;
  return url.origin;
}

function parseTunnelOrigin(value) {
  const origin = tunnelHostnameOrigin(value);
  if (value !== undefined && !origin) {
    throw new Error('Địa chỉ Cloudflare Tunnel phải là một tên miền HTTPS, ví dụ https://congno.example.com.');
  }
  return origin;
}

function requestPeer(req, tls, { tunnelOrigin, allowTunnel = false } = {}) {
  const socket = req.socket.remoteAddress || 'unknown';
  const host = req.headers.host;
  const ip = req.headers['cf-connecting-ip'];
  const hostOrigin = typeof host === 'string' ? 'https://' + host.toLowerCase() : undefined;
  const optedHost = tunnelOrigin && hostOrigin === tunnelOrigin;
  // Chỉ tin header Cloudflare khi connector kết nối từ chính máy chủ.
  const fromConnector = LOOPBACK.has(socket) && (ip !== undefined || req.headers['cf-ray'] !== undefined);
  if (optedHost || fromConnector) {
    const origin = tunnelHostnameOrigin(hostOrigin);
    if (!fromConnector || !origin || origin !== hostOrigin ||
        (tunnelOrigin ? !optedHost : !allowTunnel) ||
        req.headers['x-forwarded-proto'] !== 'https' || typeof ip !== 'string' || !isIP(ip)) {
      fail(403, 'Yêu cầu Cloudflare Tunnel không hợp lệ.');
    }
    return { origin, address: ip, secure: true };
  }
  return { origin: (tls ? 'https://' : 'http://') + host, address: socket, secure: Boolean(tls) };
}

module.exports = { parseTunnelOrigin, requestPeer };
