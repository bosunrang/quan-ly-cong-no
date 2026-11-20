const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const badRequest = (message) => new HttpError(400, message);

async function readJsonBody(req, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, 'Dữ liệu gửi lên quá lớn.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'Dữ liệu gửi lên quá lớn.');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new HttpError(415, 'Yêu cầu JSON.');
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed;
  } catch {
    throw badRequest('Dữ liệu gửi lên không đúng định dạng.');
  }
}

function compile(pattern) {
  const names = [];
  const source = pattern
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) {
        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      names.push(segment.slice(1));
      return '([^/]+)';
    })
    .join('/');
  return { regex: new RegExp(`^${source}$`), names };
}

function createRouter() {
  const routes = [];
  /**
   * options.maxBodyBytes: giới hạn body riêng của route.
   * options.page: thẻ bắt buộc, được kiểm tra trước khi đọc body lớn.
   */
  const add = (method, pattern, handler, options) => {
    if (!options || !Array.isArray(options.pages) || !Number.isSafeInteger(options.maxBodyBytes))
      throw new Error('Route must declare pages and body limit: ' + pattern);
    const { regex, names } = compile(pattern);
    routes.push({ method, regex, names, handler, options });
  };
  return {
    get: (pattern, handler, options) => add('GET', pattern, handler, options),
    post: (pattern, handler, options) => add('POST', pattern, handler, options),
    put: (pattern, handler, options) => add('PUT', pattern, handler, options),
    patch: (pattern, handler, options) => add('PATCH', pattern, handler, options),
    delete: (pattern, handler, options) => add('DELETE', pattern, handler, options),
    /** Tìm route khớp. Trả về null nếu không có đường dẫn nào khớp. */
    match(method, pathname) {
      let pathExists = false;
      for (const route of routes) {
        const found = route.regex.exec(pathname);
        if (!found) continue;
        pathExists = true;
        if (route.method !== method) continue;
        const params = {};
        try {
          route.names.forEach((name, index) => {
            params[name] = decodeURIComponent(found[index + 1]);
          });
        } catch {
          throw badRequest('Đường dẫn không hợp lệ.');
        }
        return { handler: route.handler, params, options: route.options };
      }
      if (pathExists) throw new HttpError(405, 'Phương thức không được hỗ trợ.');
      return null;
    },
  };
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}

function sendError(res, error) {
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error('Lỗi máy chủ công nợ:', error.stack || error.message);
  if (status === 413) res.setHeader("Connection", "close");
  sendJson(res, status, { ok: false, code: 'HTTP_' + status,
    error: status >= 500 ? 'Máy chủ không thể hoàn tất thao tác.' : error.message });
}

module.exports = { createRouter, readJsonBody, sendJson, sendError };
