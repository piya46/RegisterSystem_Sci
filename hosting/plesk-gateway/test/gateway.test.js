const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createGatewayApp } = require('../src/gateway');

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  if (!server.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

async function fixture(t) {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'psevent-gateway-'));
  fs.mkdirSync(path.join(publicDir, 'assets'));
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<!doctype html><main>PSEvent</main>');
  fs.writeFileSync(path.join(publicDir, 'assets', 'app.js'), 'console.log("ok")');

  const upstreamRequests = [];
  const upstream = http.createServer((req, res) => {
    upstreamRequests.push({ headers: req.headers, method: req.method, url: req.url });
    if (req.url === '/health/ready') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ready: true, status: 'ready', internal: 'not-forwarded' }));
      return;
    }
    if (req.url.startsWith('/api/cookie')) {
      res.setHeader('Set-Cookie', 'session=abc; Domain=upstream.example; Path=/; HttpOnly');
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ method: req.method, url: req.url }));
  });
  const upstreamOrigin = await listen(upstream);
  const app = createGatewayApp({
    publicHosts: ['reunion.example.test'],
    publicDir,
    indexPath: path.join(publicDir, 'index.html'),
    releaseId: 'abcdef123456',
    upstreamOrigin,
    upstreamTimeoutMs: 3000,
  });
  const gateway = http.createServer(app);
  const gatewayOrigin = await listen(gateway);

  t.after(async () => {
    await close(gateway);
    await close(upstream);
    fs.rmSync(publicDir, { force: true, recursive: true });
  });
  return { gatewayOrigin, upstreamRequests };
}

function gatewayFetch(origin, pathname, options = {}) {
  const url = new URL(pathname, origin);
  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method: options.method || 'GET',
      headers: { Host: 'reunion.example.test', ...(options.headers || {}) },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: response.statusCode,
          headers: new Headers(response.headers),
          json: async () => JSON.parse(body),
          text: async () => body,
        });
      });
    });
    request.once('error', reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

test('rejects unconfigured Host headers before serving or proxying', async (t) => {
  const { gatewayOrigin, upstreamRequests } = await fixture(t);
  const response = await gatewayFetch(gatewayOrigin, '/api/private', { headers: { Host: 'attacker.example' } });
  assert.equal(response.status, 421);
  assert.deepEqual(await response.json(), { error: 'misdirected_request' });
  assert.equal(upstreamRequests.length, 0);
});

test('serves immutable assets and no-store SPA navigation with security headers', async (t) => {
  const { gatewayOrigin } = await fixture(t);
  const asset = await gatewayFetch(gatewayOrigin, '/assets/app.js');
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');

  const spa = await gatewayFetch(gatewayOrigin, '/events/cusa-reunion');
  assert.equal(spa.status, 200);
  assert.equal(spa.headers.get('cache-control'), 'no-store');
  assert.match(await spa.text(), /PSEvent/);
  assert.match(spa.headers.get('content-security-policy'), /challenges\.cloudflare\.com/);
  assert.match(spa.headers.get('content-security-policy'), /accounts\.google\.com/);
  assert.equal(spa.headers.get('x-powered-by'), null);
  assert.equal(spa.headers.get('x-gateway-release'), 'abcdef123456');
});

test('proxies API paths unchanged and strips an upstream cookie domain', async (t) => {
  const { gatewayOrigin, upstreamRequests } = await fixture(t);
  const response = await gatewayFetch(gatewayOrigin, '/api/cookie?event=1', {
    method: 'POST',
    headers: {
      'X-Request-ID': 'request-12345678',
      'X-Forwarded-For': '192.0.2.99, 198.51.100.7',
      'X-Forwarded-Proto': 'https',
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { method: 'POST', url: '/api/cookie?event=1' });
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /^session=abc;/);
  assert.doesNotMatch(cookie, /Domain=/i);
  assert.equal(upstreamRequests[0].headers['x-psevent-gateway'], 'plesk');
  assert.equal(upstreamRequests[0].headers['x-request-id'], 'request-12345678');
  assert.equal(upstreamRequests[0].headers['x-forwarded-for'], '198.51.100.7');
  assert.equal(upstreamRequests[0].headers['x-forwarded-host'], 'reunion.example.test');
  assert.equal(upstreamRequests[0].headers['x-forwarded-proto'], 'https');
});

test('reports sanitized gateway readiness only when Cloud Run is ready', async (t) => {
  const { gatewayOrigin } = await fixture(t);
  const response = await gatewayFetch(gatewayOrigin, '/gateway/health/ready');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ready: true,
    status: 'ready',
    checks: { gateway: 'up', upstream: 'up' },
    release: 'abcdef123456',
  });
});

test('does not serve the SPA fallback for unknown API methods', async (t) => {
  const { gatewayOrigin } = await fixture(t);
  const response = await gatewayFetch(gatewayOrigin, '/missing', { method: 'POST' });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'not_found' });
});
