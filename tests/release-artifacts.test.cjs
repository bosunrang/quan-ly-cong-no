const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createReadStream, readFileSync, statSync } = require('node:fs');
const { createRequire } = require('node:module');
const { join } = require('node:path');
const test = require('node:test');

// Dùng đúng bộ đọc ASAR/YAML của electron-builder đang đóng gói ứng dụng.
const builderRequire = createRequire(require.resolve('electron-builder'));
const packagingRequire = createRequire(builderRequire.resolve('app-builder-lib'));
const asar = packagingRequire('@electron/asar');
const yaml = packagingRequire('js-yaml');
const source = require('../package.json');
const resources = join(__dirname, '../release/win-unpacked/resources');

test('bộ cài chứa nghiệp vụ máy chủ và kênh cập nhật GitHub đã bật', () => {
  const archive = join(resources, 'app.asar');
  const packaged = JSON.parse(asar.extractFile(archive, 'package.json').toString());
  assert.equal(packaged.version, source.version);
  assert.equal(packaged.congNoUpdate, true);
  for (const file of [
    join('dist', 'index.html'),
    join('server', 'generated', 'domain.cjs'),
    join('server', 'database.cjs'),
    join('server', 'account-store.cjs'),
    join('src', 'domain', 'access', 'permissions.mjs'),
    join('src', 'domain', 'settings', 'business-data.rules.mjs'),
  ]) assert.ok(asar.statFile(archive, file).size > 0, file);
  const appIcon = asar.extractFile(archive, join('public', 'assets', 'app-icon.png'));
  assert.ok(appIcon.length > 0);
  assert.deepEqual(asar.extractFile(archive, join('dist', 'assets', 'app-icon.png')), appIcon);
  assert.match(asar.extractFile(archive, join('dist', 'index.html')).toString(), /rel="icon"[^>]*app-icon\.png/);
  const feed = yaml.load(readFileSync(join(resources, 'app-update.yml'), 'utf8'));
  assert.equal(feed.provider, 'github');
  assert.equal(feed.owner, 'bosunrang');
  assert.equal(feed.repo, 'quan-ly-cong-no');
});

test('latest.yml khớp phiên bản, kích thước và SHA-512 của bộ cài, có blockmap', async () => {
  const name = `Quan-Ly-Cong-No-Setup-${source.version}.exe`;
  const installer = join(__dirname, '../release', name);
  const metadata = yaml.load(readFileSync(join(__dirname, '../release/latest.yml'), 'utf8'));
  assert.equal(metadata.version, source.version);
  assert.equal(metadata.path, name);
  assert.ok(statSync(installer + '.blockmap').size > 0);
  const file = metadata.files.find((item) => item.url === name);
  assert.ok(file, 'latest.yml phải trỏ đúng tên bộ cài');
  assert.equal(file.size, statSync(installer).size);
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(installer)) hash.update(chunk);
  const sha512 = hash.digest('base64');
  assert.equal(metadata.sha512, sha512);
  assert.equal(file.sha512, sha512);
});
