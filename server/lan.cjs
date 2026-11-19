const { createServer: httpServer } = require('node:http');
const { createServer: httpsServer } = require('node:https');
const { createReadStream, mkdirSync, readFileSync, statSync } = require('node:fs');
const { extname, resolve, sep } = require('node:path');
const { openDatabase } = require('../electron/database.cjs');
const { createAccess, fail, initializeAdministrator } = require('./access.cjs');
const { automaticBackups } = require('./automatic-backup.cjs');
const { createApi } = require('./index.cjs');
const { sendError } = require('./http.cjs');

const contentTypes = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function companyDatabasePath(directory, company) {
  return resolve(directory, `cong-no-${company.id}.sqlite`);
}

function openCompanyDatabase(directory, company) {
  mkdirSync(directory, { recursive: true });
  return openDatabase(companyDatabasePath(directory, company));
}

function createLanServer({ company, directory, staticRoot, tls, databasePath }) {
  const root = resolve(staticRoot);
  const index = readFileSync(resolve(root, 'index.html'), 'utf8')
    .replace('</head>', '<meta name="cong-no-lan-api" content="/api/"></head>');
  const legacyPath = `/${company.id}`;
  mkdirSync(directory, { recursive: true });
  const source = databasePath ?? companyDatabasePath(directory, company);
  const db = openDatabase(source);
  const backups = automaticBackups(source, directory, company);
  const api = createApi({ company, db, backups, access: createAccess(db, company, Boolean(tls)) }, tls);
  const respond = async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    const pathname = String(req.url).split('?')[0];
    try {
      if (req.method === 'GET' &&
          [legacyPath, `${legacyPath}/`, `${legacyPath}/index.html`].includes(pathname)) {
        res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' });
        return res.end();
      }
      if (pathname.startsWith(legacyPath + '/api/')) {
        res.writeHead(307, { Location: pathname.slice(legacyPath.length), 'Cache-Control': 'no-store' });
        return res.end();
      }
      if (pathname === '/api' || pathname.startsWith('/api/')) return await api(req, res, pathname);
      if (req.method !== 'GET') fail(405, 'Phương thức không được hỗ trợ.');
      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(index);
      }
      const suffix = pathname.startsWith(`${legacyPath}/`)
        ? pathname.slice(legacyPath.length + 1)
        : pathname.slice(1);
      if (!/^(?:assets|fonts)\/[\w.-]+$/.test(suffix)) fail(404, 'Không tìm thấy tệp.');
      const path = resolve(root, suffix);
      const file = path.startsWith(root + sep) && statSync(path, { throwIfNoEntry: false });
      const mime = contentTypes[extname(path)];
      if (!file?.isFile() || !mime) fail(404, 'Không tìm thấy tệp.');
      res.writeHead(200, { 'Content-Type': mime, 'Content-Length': file.size });
      return createReadStream(path)
        .on('error', (error) => {
          console.error('Không đọc được tệp giao diện:', error.message);
          res.destroy();
        })
        .pipe(res);
    } catch (error) {
      if (res.headersSent || res.destroyed) return res.end();
      return sendError(res, error);
    }
  };
  const server = tls ? httpsServer(tls, respond) : httpServer(respond);
  server.hasAdministrator = () => Boolean(db.readDataset('cong-no.accounts.v1')?.data?.length);
  server.initializeAdministrator = (password) => initializeAdministrator(db, password);
  server.once('listening', () => backups.start());
  server.dataClosed = new Promise((resolve, reject) => {
    server.once('close', () => {
      backups.stop().then(() => db.close()).then(resolve, reject);
    });
  });
  return server;
}

async function listenLanServer(server, port, host) {
  try {
    await new Promise((resolve, reject) => {
      const failToListen = (error) => reject(error);
      server.once('error', failToListen);
      server.listen(port, host, () => {
        server.off('error', failToListen);
        resolve();
      });
    });
  } catch (error) {
    await stopLanServer(server);
    throw error;
  }
}

function stopLanServer(server) {
  server.close();
  return server.dataClosed;
}

module.exports = {
  companyDatabasePath, createLanServer, openCompanyDatabase, listenLanServer, stopLanServer,
};
