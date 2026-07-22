const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { createProxyMiddleware } = require('http-proxy-middleware');

const PROXY_PATH = /^\/(?:api|health|uploads)(?:\/|$)/;
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._-]{8,128}$/;

function requestHostname(req) {
  const rawHost = String(req.headers.host || '').trim().toLowerCase();
  if (rawHost.startsWith('[')) return rawHost.slice(1, rawHost.indexOf(']'));
  return rawHost.split(':')[0].replace(/\.$/, '');
}

function validRequestId(value) {
  return REQUEST_ID_PATTERN.test(String(value || ''));
}

function securityMiddleware() {
  return helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://challenges.cloudflare.com', 'https://accounts.google.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https:', 'wss:'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'self'", 'https://challenges.cloudflare.com', 'https://accounts.google.com'],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'no-referrer' },
  });
}

function createUpstreamProxy(config) {
  return createProxyMiddleware({
    target: config.upstreamOrigin,
    pathFilter: (pathname) => PROXY_PATH.test(pathname),
    changeOrigin: true,
    xfwd: false,
    ws: false,
    secure: true,
    autoRewrite: true,
    cookieDomainRewrite: '',
    proxyTimeout: config.upstreamTimeoutMs,
    timeout: config.upstreamTimeoutMs,
    on: {
      proxyReq(proxyReq, req) {
        const incomingRequestId = req.headers['x-request-id'];
        const requestId = validRequestId(incomingRequestId) ? incomingRequestId : crypto.randomUUID();
        proxyReq.setHeader('X-Request-ID', requestId);
        proxyReq.setHeader('X-PSEvent-Gateway', 'plesk');
        proxyReq.setHeader('X-Forwarded-For', req.ip || req.socket.remoteAddress || 'unknown');
        proxyReq.setHeader('X-Forwarded-Host', requestHostname(req));
        proxyReq.setHeader('X-Forwarded-Proto', req.protocol);
      },
      proxyRes(proxyRes) {
        delete proxyRes.headers['x-powered-by'];
        delete proxyRes.headers.server;
      },
      error(error, req, res) {
        console.error(`[gateway] upstream unavailable (${error.code || 'proxy_error'})`);
        if (res.headersSent || typeof res.writeHead !== 'function') return;
        res.writeHead(502, {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(JSON.stringify({ error: 'upstream_unavailable' }));
      },
    },
  });
}

async function upstreamReadiness(config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(config.upstreamTimeoutMs, 10000));
  try {
    const response = await fetch(`${config.upstreamOrigin}/health/ready`, {
      headers: { 'User-Agent': 'psevent-plesk-gateway-readiness' },
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const payload = await response.json();
    return payload?.ready === true && payload?.status === 'ready';
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function createGatewayApp(config) {
  const app = express();
  const allowedHosts = new Set(config.publicHosts);
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use((req, res, next) => {
    if (allowedHosts.size > 0 && !allowedHosts.has(requestHostname(req))) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(421).json({ error: 'misdirected_request' });
    }
    res.setHeader('X-Gateway-Release', config.releaseId);
    return next();
  });
  app.use(securityMiddleware());

  app.get('/gateway/health/live', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ status: 'ok', release: config.releaseId });
  });
  app.get('/gateway/health/ready', async (req, res) => {
    const upstreamReady = await upstreamReadiness(config);
    res.setHeader('Cache-Control', 'no-store');
    res.status(upstreamReady ? 200 : 503).json({
      ready: upstreamReady,
      status: upstreamReady ? 'ready' : 'not_ready',
      checks: { gateway: 'up', upstream: upstreamReady ? 'up' : 'down' },
      release: config.releaseId,
    });
  });

  app.use(createUpstreamProxy(config));
  app.use(express.static(config.publicDir, {
    dotfiles: 'deny',
    index: false,
    fallthrough: true,
    setHeaders(res, filePath) {
      const isAsset = filePath.includes(`${path.sep}assets${path.sep}`);
      res.setHeader('Cache-Control', isAsset
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }));

  app.get(/.*/, (req, res) => {
    if (PROXY_PATH.test(req.path)) return res.status(404).json({ error: 'not_found' });
    res.setHeader('Cache-Control', 'no-store');
    return res.sendFile(config.indexPath);
  });
  app.use((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}

function assertFrontendBuild(config) {
  if (!fs.existsSync(config.indexPath)) {
    throw new Error(`Plesk frontend build is missing at ${config.indexPath}`);
  }
}

module.exports = {
  PROXY_PATH,
  assertFrontendBuild,
  createGatewayApp,
  requestHostname,
  upstreamReadiness,
};
