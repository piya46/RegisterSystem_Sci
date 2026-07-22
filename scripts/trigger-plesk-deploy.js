#!/usr/bin/env node

const crypto = require('node:crypto');

function fail(message) {
  console.error(`Plesk deployment trigger failed: ${message}`);
  process.exitCode = 1;
}

function resolveConfig(env = process.env) {
  const rawUrl = env.PLESK_GIT_WEBHOOK_URL;
  if (!rawUrl) throw new Error('PLESK_GIT_WEBHOOK_URL is required');
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('Plesk webhook must be an HTTPS URL without credentials or a fragment');
  }
  const expectedHost = String(env.PLESK_WEBHOOK_HOST || '').trim().toLowerCase();
  if (!expectedHost) throw new Error('PLESK_WEBHOOK_HOST is required');
  let expectedOrigin;
  try {
    expectedOrigin = new URL(`https://${expectedHost}`);
  } catch {
    throw new Error('PLESK_WEBHOOK_HOST must be a valid hostname');
  }
  if (expectedOrigin.hostname !== expectedHost || expectedOrigin.host !== expectedHost) {
    throw new Error('PLESK_WEBHOOK_HOST must be a hostname without a port or path');
  }
  if (url.hostname.toLowerCase() !== expectedHost) {
    throw new Error('Plesk webhook hostname does not match PLESK_WEBHOOK_HOST');
  }

  const branch = String(env.PLESK_DEPLOY_BRANCH || 'plesk-production');
  const approvedSha = String(env.APPROVED_SHA || env.GITHUB_SHA || '').toLowerCase();
  const repository = String(env.GITHUB_REPOSITORY || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(branch) || branch.endsWith('.lock')) {
    throw new Error('PLESK_DEPLOY_BRANCH is invalid');
  }
  if (!/^[0-9a-f]{40}$/.test(approvedSha)) throw new Error('APPROVED_SHA must be a full Git commit SHA');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('GITHUB_REPOSITORY must use owner/repository format');
  }
  return { approvedSha, branch, repository, url };
}

async function triggerPleskDeploy(env = process.env, fetchImpl = fetch) {
  const config = resolveConfig(env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const deliveryId = crypto.randomUUID();
    const payload = {
      ref: `refs/heads/${config.branch}`,
      after: config.approvedSha,
      repository: { full_name: config.repository },
    };
    const response = await fetchImpl(config.url, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'GitHub-Hookshot/psevent',
        'X-GitHub-Delivery': deliveryId,
        'X-GitHub-Event': 'push',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Plesk webhook returned HTTP ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

if (require.main === module) {
  triggerPleskDeploy()
    .then(() => process.stdout.write('Plesk Git deployment webhook accepted\n'))
    .catch((error) => fail(error.message));
}

module.exports = { resolveConfig, triggerPleskDeploy };
