#!/usr/bin/env node

const MAX_ATTEMPTS = Number(process.env.PLESK_SMOKE_ATTEMPTS || 30);
const RETRY_DELAY_MS = Number(process.env.PLESK_SMOKE_RETRY_DELAY_MS || 10000);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function resolveOrigin() {
  const origin = new URL(process.env.PLESK_ORIGIN || '');
  if (origin.protocol !== 'https:' || origin.username || origin.password
      || origin.search || origin.hash || origin.pathname !== '/') {
    throw new Error('PLESK_ORIGIN must be an HTTPS origin without path, credentials, query, or fragment');
  }
  return origin.origin;
}

async function request(url, accept) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: { Accept: accept, 'User-Agent': 'psevent-plesk-smoke' },
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function smoke(origin) {
  const readyResponse = await request(`${origin}/gateway/health/ready`, 'application/json');
  const ready = await readyResponse.json();
  if (ready?.ready !== true || ready?.status !== 'ready'
      || ready?.checks?.gateway !== 'up' || ready?.checks?.upstream !== 'up') {
    throw new Error('gateway readiness contract failed');
  }

  const rootResponse = await request(`${origin}/`, 'text/html');
  const html = await rootResponse.text();
  if (!/<(?:!doctype|html)\b/i.test(html)) throw new Error('SPA HTML was not served');
  if (!rootResponse.headers.get('x-gateway-release')) {
    throw new Error('SPA bypassed the Node.js gateway or omitted its release header');
  }
  if (!rootResponse.headers.get('content-security-policy')
      || rootResponse.headers.get('x-content-type-options') !== 'nosniff'
      || !rootResponse.headers.get('strict-transport-security')) {
    throw new Error('gateway security headers are incomplete');
  }

  const providerResponse = await request(`${origin}/api/participant-auth/providers`, 'application/json');
  const providers = await providerResponse.json();
  if (providers?.success !== true || typeof providers?.data?.email !== 'boolean'
      || typeof providers?.data?.line !== 'boolean') {
    throw new Error('same-origin API proxy contract failed');
  }
}

async function main() {
  const origin = resolveOrigin();
  if (!Number.isInteger(MAX_ATTEMPTS) || MAX_ATTEMPTS < 1 || MAX_ATTEMPTS > 60) {
    throw new Error('PLESK_SMOKE_ATTEMPTS must be between 1 and 60');
  }
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await smoke(origin);
      process.stdout.write(`Plesk gateway smoke test passed on attempt ${attempt}\n`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
    }
  }
  throw new Error(lastError?.message || 'smoke test failed');
}

main().catch((error) => {
  console.error(`Plesk gateway smoke test failed: ${error.message}`);
  process.exitCode = 1;
});
