const test = require('node:test');
const assert = require('node:assert/strict');
const { promotePleskRef, resolveConfig: resolvePromotionConfig } = require('./promote-plesk-ref');
const { resolveConfig: resolveTriggerConfig, triggerPleskDeploy } = require('./trigger-plesk-deploy');

const SHA = 'a'.repeat(40);
const OLD_SHA = 'b'.repeat(40);
const ENV = {
  GITHUB_TOKEN: 'test-token',
  GITHUB_REPOSITORY: 'owner/repository',
  APPROVED_SHA: SHA,
  PLESK_DEPLOY_BRANCH: 'plesk-production',
  GITHUB_API_URL: 'https://api.github.test',
};

function response(status, payload) {
  return { status, json: async () => payload };
}

test('promotion config rejects missing credentials and invalid refs', () => {
  assert.throws(() => resolvePromotionConfig({ ...ENV, GITHUB_TOKEN: '' }), /GITHUB_TOKEN/);
  assert.throws(() => resolvePromotionConfig({ ...ENV, APPROVED_SHA: 'abc' }), /APPROVED_SHA/);
  assert.throws(() => resolvePromotionConfig({ ...ENV, PLESK_DEPLOY_BRANCH: '../main' }), /PLESK_DEPLOY_BRANCH/);
});

test('creates a dedicated deployment branch at the CI-approved SHA', async () => {
  const calls = [];
  const result = await promotePleskRef(ENV, async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1 ? response(404) : response(201, { object: { sha: SHA } });
  });
  assert.equal(result.action, 'created');
  assert.equal(calls[1].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    ref: 'refs/heads/plesk-production',
    sha: SHA,
  });
});

test('updates the deployment branch without allowing a force push', async () => {
  const calls = [];
  const result = await promotePleskRef(ENV, async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1
      ? response(200, { object: { sha: OLD_SHA } })
      : response(200, { object: { sha: SHA } });
  });
  assert.equal(result.action, 'updated');
  assert.equal(calls[1].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[1].options.body), { sha: SHA, force: false });
});

test('does not write the ref when it already matches the approved SHA', async () => {
  let calls = 0;
  const result = await promotePleskRef(ENV, async () => {
    calls += 1;
    return response(200, { object: { sha: SHA } });
  });
  assert.equal(result.action, 'unchanged');
  assert.equal(calls, 1);
});

test('Plesk trigger requires an expected webhook host and binds the approved ref payload', async () => {
  const triggerEnv = {
    ...ENV,
    PLESK_GIT_WEBHOOK_URL: 'https://panel.example.test/modules/git/web-hook.php?token=secret',
    PLESK_WEBHOOK_HOST: 'panel.example.test',
  };
  assert.throws(
    () => resolveTriggerConfig({ ...triggerEnv, PLESK_WEBHOOK_HOST: '' }),
    /PLESK_WEBHOOK_HOST is required/
  );
  assert.throws(
    () => resolveTriggerConfig({ ...triggerEnv, PLESK_WEBHOOK_HOST: 'attacker.example' }),
    /hostname does not match/
  );

  let request;
  await triggerPleskDeploy(triggerEnv, async (url, options) => {
    request = { url: String(url), options };
    return { ok: true, status: 200 };
  });
  assert.equal(request.url, triggerEnv.PLESK_GIT_WEBHOOK_URL);
  assert.deepEqual(JSON.parse(request.options.body), {
    ref: 'refs/heads/plesk-production',
    after: SHA,
    repository: { full_name: 'owner/repository' },
  });
});
