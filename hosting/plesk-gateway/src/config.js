const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_UPSTREAM_TIMEOUT_MS = 30000;
const MAX_UPSTREAM_TIMEOUT_MS = 300000;

function parseInteger(value, fallback, { minimum, maximum, name }) {
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function parseHosts(value) {
  const hosts = [...new Set(String(value || '')
    .split(',')
    .map((host) => host.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean))];
  for (const host of hosts) {
    const labels = host.split('.');
    if (host.length > 253 || labels.some((label) => (
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label) || label.length > 63
    ))) {
      throw new Error(`Invalid PUBLIC_HOST value: ${host}`);
    }
  }
  return hosts;
}

function readReleaseId(rootDir, publicDir, explicitValue) {
  const releaseFile = path.join(rootDir, '.release-id');
  const values = [explicitValue];
  if (fs.existsSync(releaseFile)) values.push(fs.readFileSync(releaseFile, 'utf8').trim());
  const metadataFile = path.join(publicDir, '.psevent-release.json');
  if (fs.existsSync(metadataFile)) {
    try {
      values.push(JSON.parse(fs.readFileSync(metadataFile, 'utf8')).releaseId);
    } catch {
      // Invalid optional metadata falls through to the non-sensitive unknown marker.
    }
  }
  const value = values.find((candidate) => /^[a-zA-Z0-9._-]{1,64}$/.test(String(candidate || '')));
  return value || 'unknown';
}

function parseUpstream(value, { production, allowNonGoogleUpstream }) {
  if (!value) throw new Error('UPSTREAM_ORIGIN is required');
  let upstream;
  try {
    upstream = new URL(value);
  } catch {
    throw new Error('UPSTREAM_ORIGIN must be a valid absolute URL');
  }
  if (upstream.username || upstream.password || upstream.port || upstream.search || upstream.hash) {
    throw new Error('UPSTREAM_ORIGIN cannot contain credentials, a custom port, query parameters, or a fragment');
  }
  if (upstream.pathname !== '/' && upstream.pathname !== '') {
    throw new Error('UPSTREAM_ORIGIN must not contain a path');
  }
  if (production && upstream.protocol !== 'https:') {
    throw new Error('Production UPSTREAM_ORIGIN must use HTTPS');
  }
  if (production && !allowNonGoogleUpstream && !upstream.hostname.endsWith('.run.app')) {
    throw new Error('Production UPSTREAM_ORIGIN must be a Cloud Run run.app origin');
  }
  return upstream.origin;
}

function loadConfig(env = process.env, options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '..');
  const production = String(env.NODE_ENV || '').toLowerCase() === 'production';
  const publicHosts = parseHosts(env.PUBLIC_HOSTS || env.PUBLIC_HOST);
  if (production && publicHosts.length === 0) {
    throw new Error('PUBLIC_HOST or PUBLIC_HOSTS is required in production');
  }

  const publicDir = path.resolve(env.PLESK_PUBLIC_DIR || path.join(rootDir, 'public'));
  if (production && publicDir !== path.join(rootDir, 'public')) {
    throw new Error('Production PLESK_PUBLIC_DIR cannot point outside the application public directory');
  }
  const indexPath = path.join(publicDir, 'index.html');
  if (!options.allowMissingPublicDir && !fs.existsSync(indexPath)) {
    throw new Error(`Plesk frontend build is missing at ${indexPath}`);
  }

  return Object.freeze({
    production,
    publicHosts,
    publicDir,
    indexPath,
    releaseId: readReleaseId(rootDir, publicDir, env.GATEWAY_RELEASE_ID),
    upstreamOrigin: parseUpstream(env.UPSTREAM_ORIGIN, {
      production,
      allowNonGoogleUpstream: env.ALLOW_NON_GOOGLE_UPSTREAM === 'true' || options.allowNonGoogleUpstream,
    }),
    port: parseInteger(env.PORT, 3000, {
      minimum: 1,
      maximum: 65535,
      name: 'PORT',
    }),
    upstreamTimeoutMs: parseInteger(env.UPSTREAM_TIMEOUT_MS, DEFAULT_UPSTREAM_TIMEOUT_MS, {
      minimum: 1000,
      maximum: MAX_UPSTREAM_TIMEOUT_MS,
      name: 'UPSTREAM_TIMEOUT_MS',
    }),
  });
}

module.exports = {
  loadConfig,
  parseHosts,
  parseUpstream,
};
