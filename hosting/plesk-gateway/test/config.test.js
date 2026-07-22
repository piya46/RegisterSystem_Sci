const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig, parseHosts, parseUpstream } = require('../src/config');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'psevent-gateway-config-'));
  const publicDir = path.join(rootDir, 'public');
  fs.mkdirSync(publicDir);
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<!doctype html>');
  return { rootDir, publicDir };
}

test('production config accepts only an explicit host and secure Cloud Run origin', () => {
  const { rootDir, publicDir } = fixture();
  fs.writeFileSync(
    path.join(publicDir, '.psevent-release.json'),
    JSON.stringify({ releaseId: 'abcdef123456' })
  );
  const config = loadConfig({
    NODE_ENV: 'production',
    PUBLIC_HOST: 'REUNION.SCICU-ALUMNI.COM.',
    UPSTREAM_ORIGIN: 'https://service-123.asia-southeast3.run.app',
  }, { rootDir });

  assert.deepEqual(config.publicHosts, ['reunion.scicu-alumni.com']);
  assert.equal(config.upstreamOrigin, 'https://service-123.asia-southeast3.run.app');
  assert.equal(config.releaseId, 'abcdef123456');
});

test('production config rejects missing hosts and unsafe upstream origins', () => {
  const { rootDir } = fixture();
  assert.throws(() => loadConfig({
    NODE_ENV: 'production',
    UPSTREAM_ORIGIN: 'https://service-123.asia-southeast3.run.app',
  }, { rootDir }), /PUBLIC_HOST/);
  assert.throws(() => parseUpstream('http://service-123.asia-southeast3.run.app', {
    production: true,
    allowNonGoogleUpstream: false,
  }), /HTTPS/i);
  assert.throws(() => parseUpstream('https://example.com', {
    production: true,
    allowNonGoogleUpstream: false,
  }), /run\.app/);
});

test('host parsing normalizes, de-duplicates, and drops empty values', () => {
  assert.deepEqual(
    parseHosts(' reunion.scicu-alumni.com.,REUNION.SCICU-ALUMNI.COM, '),
    ['reunion.scicu-alumni.com']
  );
  assert.throws(() => parseHosts('reunion.example.com/../../etc'), /Invalid PUBLIC_HOST/);
  assert.throws(() => parseHosts('-invalid.example.com'), /Invalid PUBLIC_HOST/);
});
