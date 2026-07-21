const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('../backend/node_modules/dotenv');
const {
  buildRuntimeValues,
  buildSecretSourceValues,
} = require('./sync-secrets');

const ROOT = path.resolve(__dirname, '..');
const SECRET_KEYS = new Set([
  'CSRF_SECRET',
  'DATA_BLIND_INDEX_SECRET',
  'DATA_ENCRYPTION_KEY',
  'DATA_ENCRYPTION_KEYS',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'JWT_SECRET',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_LOGIN_CHANNEL_SECRET',
  'LINE_WEBHOOK_CHANNEL_SECRET',
  'MONGODB_URI',
  'SESSION_TOKEN_HASH_SECRET',
  'SLIP_PROOF_SECRET',
  'SMTP_PASS',
  'SMTP_USER',
  'SQL_MIGRATION_PASSWORD',
  'SQL_PASSWORD',
  'TURNSTILE_SECRET_KEY',
  'VENDOR_QR_SECRET',
]);

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('deployment environment files contain non-secret configuration only', () => {
  for (const environment of ['staging', 'production']) {
    const values = dotenv.parse(read(`deploy/environments/${environment}.env`));
    for (const key of SECRET_KEYS) assert.equal(Object.hasOwn(values, key), false, `${key} leaked into ${environment}.env`);
    assert.equal(values.MIN_INSTANCES, '0');
    assert.equal(values.MOCK_EMAIL, 'false');
    assert.equal(values.PARTICIPANT_EMAIL_LOGIN_ENABLED, 'true');
    assert.equal(values.GCS_LOCATION, values.REGION);
    assert.match(values.SECRET_MANAGER_PREFIX, new RegExp(environment));
  }
});

test('container build excludes secrets and runs as a non-root user', () => {
  const dockerfile = read('Dockerfile');
  const dockerignore = read('.dockerignore');
  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.doesNotMatch(dockerfile, /npm install/);
  assert.match(dockerfile, /USER node/);
  assert.doesNotMatch(dockerfile, /COPY .*\.env/);
  assert.match(dockerignore, /\*\*\/\.env/);
  assert.match(dockerignore, /gha-creds-\*\.json/);
});

test('quality gate scans Git candidate files for credential leakage', () => {
  const release = read('scripts/release.sh');
  const scanner = read('scripts/scan-secrets.js');
  assert.match(release, /scripts\/scan-secrets\.js/);
  assert.match(scanner, /gitCandidateFiles/);
  assert.match(scanner, /localSecretValues/);
  assert.doesNotMatch(scanner, /console\.(?:log|error)\([^\n]*\.value/);
});

test('local and GitHub quality gates use the same Node major version', () => {
  const release = read('scripts/release.sh');
  const workflow = read('.github/workflows/ci.yml');
  assert.equal(read('.nvmrc').trim(), '22');
  assert.equal(read('.node-version').trim(), '22');
  assert.match(release, /require_ci_node_version/);
  assert.match(release, /major" == "22"/);
  assert.match(workflow, /node-version: 22/);
});

test('release deployment resolves a pushed image digest before Cloud Run', () => {
  const release = read('scripts/release.sh');
  assert.match(release, /containerimage\.digest/);
  assert.match(release, /IMAGE_URI=.*@\$digest/);
  assert.match(release, /--no-traffic --tag/);
  assert.match(release, /rollback_revision "\$previous_revision"/);
});

test('disabled optional release steps do not abort the command under errexit', () => {
  const result = spawnSync('bash', [path.join(ROOT, 'scripts/release.sh'), 'plan', 'staging'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PROJECT_ID: 'psevent-test1',
      PROJECT_NUMBER: '123456789012',
      LOAD_LOCAL_DEPLOY_CONFIG: 'false',
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Deploy readiness: BLOCKED/);
});

test('GitHub workflows use OIDC, minimal permissions, and immutable action pins', () => {
  const ci = read('.github/workflows/ci.yml');
  const deploy = read('.github/workflows/deploy.yml');
  assert.match(ci, /contents: read/);
  assert.match(deploy, /id-token: write/);
  assert.doesNotMatch(deploy, /service_account_key|credentials_json|GCP_SA_KEY/);
  assert.match(deploy, /environment: production/);
  assert.match(deploy, /CONFIRM_PRODUCTION_DEPLOY: production/);
  for (const workflow of [ci, deploy]) {
    const actionLines = workflow.split('\n').filter((line) => line.trim().startsWith('uses:'));
    assert.ok(actionLines.length > 0);
    for (const line of actionLines) assert.match(line, /@[0-9a-f]{40}(?:\s|$)/, `Action is not SHA-pinned: ${line}`);
  }
});

test('runtime renderer emits secret references without secret values', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'psevent-deploy-test-'));
  const pinsPath = path.join(tempDir, 'pins.json');
  const outputPath = path.join(tempDir, 'runtime.yaml');
  const pinNames = [
    'MONGODB_URI',
    'JWT_SECRET',
    'SESSION_TOKEN_HASH_SECRET',
    'CSRF_SECRET',
    'VENDOR_QR_SECRET',
    'SLIP_PROOF_SECRET',
    'TURNSTILE_SECRET_KEY',
    'DATA_BLIND_INDEX_SECRET',
    'DATA_ENCRYPTION_KEY',
    'SMTP_USER',
    'SMTP_PASS',
  ];
  const pins = Object.fromEntries(pinNames.map((name, index) => [
    name,
    `projects/psevent-test1/secrets/psevent-staging-${name}/versions/${index + 1}`,
  ]));
  fs.writeFileSync(pinsPath, JSON.stringify(pins));
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/render-runtime-env.js'), 'staging'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DEPLOY_ENVIRONMENT: 'staging',
      PROJECT_ID: 'psevent-test1',
      PROJECT_NUMBER: '123456789012',
      RELEASE_ID: 'abcdef1234567890',
      SMTP_HOST: 'smtp.example.test',
      SECRET_VERSIONS_FILE: pinsPath,
      RUNTIME_ENV_FILE: outputPath,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const rendered = fs.readFileSync(outputPath, 'utf8');
  assert.match(rendered, /SECRET_MANAGER_REQUIRE_PINNED_VERSIONS: "true"/);
  assert.match(rendered, /SERVE_FRONTEND: "true"/);
  assert.match(rendered, /GCS_LOCATION: "asia-southeast3"/);
  for (const name of ['PORT', 'K_SERVICE', 'K_REVISION', 'K_CONFIGURATION']) {
    assert.doesNotMatch(rendered, new RegExp(`^${name}:`, 'm'), `${name} is reserved by Cloud Run`);
  }
  assert.doesNotMatch(rendered, /^X_GOOGLE_[A-Z0-9_]*:/m);
  for (const name of pinNames) assert.doesNotMatch(rendered, new RegExp(`^${name}:`, 'm'));
});

test('local secret payloads cannot enable disabled deployment integrations', () => {
  const localSecrets = {
    GOOGLE_CLIENT_ID: 'local-drive-client',
    GOOGLE_CLIENT_SECRET: 'local-drive-secret',
    GOOGLE_DRIVE_FOLDER_ID: 'local-folder',
    LINE_LOGIN_CHANNEL_ID: 'local-line-channel',
    LINE_LOGIN_CHANNEL_SECRET: 'local-line-secret',
  };
  const config = {
    GOOGLE_DRIVE_ENABLED: 'false',
    LINE_LOGIN_ENABLED: 'false',
  };
  const runtime = buildRuntimeValues(config, { PROJECT_ID: 'psevent-test1' });
  const source = buildSecretSourceValues(localSecrets, config, { PROJECT_ID: 'psevent-test1' });

  assert.equal(runtime.GOOGLE_CLIENT_ID, undefined);
  assert.equal(runtime.LINE_LOGIN_CHANNEL_ID, undefined);
  assert.equal(source.GOOGLE_CLIENT_SECRET, 'local-drive-secret');
  assert.equal(source.LINE_LOGIN_CHANNEL_SECRET, 'local-line-secret');
});

test('legacy deploy entrypoints delegate to the guarded release script', () => {
  for (const file of ['deploy-cloudrun.sh', 'deploy-cloudrun-split.sh']) {
    const source = read(file);
    assert.match(source, /scripts\/release\.sh/);
    assert.doesNotMatch(source, /backend\/\.env/);
    assert.doesNotMatch(source, /npm install/);
  }
});
