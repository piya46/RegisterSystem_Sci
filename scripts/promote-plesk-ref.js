#!/usr/bin/env node

function resolveConfig(env = process.env) {
  const token = String(env.GITHUB_TOKEN || '');
  if (!token) throw new Error('GITHUB_TOKEN is required');
  const repository = String(env.GITHUB_REPOSITORY || '');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('GITHUB_REPOSITORY must use owner/repository format');
  }
  const approvedSha = String(env.APPROVED_SHA || '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(approvedSha)) throw new Error('APPROVED_SHA must be a full Git commit SHA');
  const branch = String(env.PLESK_DEPLOY_BRANCH || 'plesk-production');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(branch) || branch.endsWith('.lock')) {
    throw new Error('PLESK_DEPLOY_BRANCH is invalid');
  }
  const apiBase = new URL(env.GITHUB_API_URL || 'https://api.github.com');
  if (apiBase.protocol !== 'https:' || apiBase.username || apiBase.password
      || apiBase.search || apiBase.hash) {
    throw new Error('GITHUB_API_URL must be an HTTPS URL without credentials, query, or fragment');
  }
  return { apiBase, approvedSha, branch, repository, token };
}

function apiUrl(config, endpoint) {
  const basePath = config.apiBase.pathname.replace(/\/$/, '');
  return new URL(`${basePath}/repos/${config.repository}${endpoint}`, config.apiBase.origin);
}

async function githubRequest(config, endpoint, { method = 'GET', body, accepted = [200] } = {}, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetchImpl(apiUrl(config, endpoint), {
      method,
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!accepted.includes(response.status)) {
      throw new Error(`GitHub ref operation returned HTTP ${response.status}`);
    }
    if (response.status === 204 || response.status === 404) return null;
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function promotePleskRef(env = process.env, fetchImpl = fetch) {
  const config = resolveConfig(env);
  const encodedBranch = encodeURIComponent(config.branch);
  const current = await githubRequest(
    config,
    `/git/ref/heads/${encodedBranch}`,
    { accepted: [200, 404] },
    fetchImpl
  );

  if (!current) {
    await githubRequest(config, '/git/refs', {
      method: 'POST',
      accepted: [201],
      body: { ref: `refs/heads/${config.branch}`, sha: config.approvedSha },
    }, fetchImpl);
    return { action: 'created', branch: config.branch, sha: config.approvedSha };
  }

  const currentSha = String(current?.object?.sha || '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(currentSha)) throw new Error('GitHub returned an invalid deployment ref');
  if (currentSha === config.approvedSha) {
    return { action: 'unchanged', branch: config.branch, sha: config.approvedSha };
  }

  await githubRequest(config, `/git/refs/heads/${encodedBranch}`, {
    method: 'PATCH',
    body: { sha: config.approvedSha, force: false },
  }, fetchImpl);
  return { action: 'updated', branch: config.branch, sha: config.approvedSha };
}

if (require.main === module) {
  promotePleskRef()
    .then(({ action, branch, sha }) => {
      process.stdout.write(`Plesk deployment ref ${branch} ${action} at ${sha}\n`);
    })
    .catch((error) => {
      console.error(`Plesk deployment ref promotion failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { promotePleskRef, resolveConfig };
