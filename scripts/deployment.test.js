const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('../backend/node_modules/dotenv');
const {
  buildRuntimeValues,
  buildSecretAccessPlan,
  buildSecretSourceValues,
} = require('./sync-secrets');

const ROOT = path.resolve(__dirname, '..');
const SECRET_KEYS = new Set([
  'BREVO_API_KEY',
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
  'SENDGRID_API_KEY',
  'SMTP_PASS',
  'SMTP_USER',
  'SQL_MIGRATION_PASSWORD',
  'SQL_MIRROR_IDENTITY_HASH_SECRET',
  'SQL_PASSWORD',
  'SQL_SSL_CA',
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
    assert.equal(values.PROJECT_ID, 'cusa-reunion');
    assert.equal(values.PLESK_ORIGIN, 'https://reunion.scicu-alumni.com');
    assert.equal(values.PLESK_GIT_BRANCH, 'main');
    assert.equal(values.PLESK_MANUAL_DEPLOY, 'true');
    assert.equal(values.PLESK_CD_ENABLED, 'false');
    assert.equal(values.MIN_INSTANCES, '0');
    assert.equal(values.MOCK_EMAIL, 'false');
    assert.equal(values.PARTICIPANT_EMAIL_LOGIN_ENABLED, 'true');
    assert.equal(values.EMAIL_PROVIDER, 'brevo');
    assert.equal(values.BREVO_FROM_EMAIL, 'noreply-event@pstpyst.com');
    assert.equal(values.BREVO_CANARY_CONFIRMED, 'false');
    assert.equal(values.SMTP_HOST, '');
    assert.equal(
      values.MONGO_SECURITY_POSTURE_REQUIRED,
      environment === 'production' ? 'true' : 'false'
    );
    assert.equal(values.GCS_LOCATION, values.REGION);
    assert.match(values.SECRET_MANAGER_PREFIX, new RegExp(environment));
    assert.equal(values.SQL_ENABLED, environment === 'production' ? 'true' : 'false');
    assert.equal(values.VERIFY_SQL_TRANSPORT, environment === 'production' ? 'true' : 'false');
    assert.equal(values.SQL_PROVIDER, 'plesk');
    assert.equal(values.SQL_HOST, '203.170.190.137');
    assert.equal(values.SQL_EXPECTED_HOST, values.SQL_HOST);
    assert.equal(values.SQL_SSL_MODE, environment === 'production' ? 'disabled' : 'verify_identity');
    assert.equal(values.SQL_AT_REST_ENCRYPTION_CONFIRMED, environment === 'production' ? 'true' : 'false');
    assert.equal(values.SQL_BACKUP_ENCRYPTION_CONFIRMED, environment === 'production' ? 'true' : 'false');
    assert.equal(values.SQL_STATIC_EGRESS_ENABLED, 'false');
    assert.equal(values.SQL_NETWORK_ALLOWLIST_CONFIRMED, 'false');
    if (environment === 'production') {
      assert.equal(values.SQL_EVENT_REGISTRATION_PRIMARY, 'true');
      assert.equal(values.SQL_ALLOW_INSECURE_PRODUCTION, 'true');
      assert.equal(values.SQL_SSL_CA_SECRET_NAME, '');
    }
    assert.equal(values.RUN_SQL_MIGRATIONS, 'false');
    assert.equal(values.RUN_SQL_BACKFILL, 'false');
    assert.equal(values.RUN_SQL_PROTECTION_AUDIT, 'false');
    assert.equal(values.SQL_BACKFILL_BATCH_SIZE, '100');
    assert.equal(values.LEGACY_EVENT_MIGRATION_WRITE, 'false');
    assert.match(values.SQL_EGRESS_SUBNET_CIDR, /^10\./);
    assert.ok(Number(values.SQL_EGRESS_MONTHLY_BUDGET_THB) <= 250);
    assert.ok(
      Number(values.GCS_MONTHLY_BUDGET_THB)
        + Number(values.SQL_EGRESS_MONTHLY_BUDGET_THB)
        + Number(values.GOOGLE_CLOUD_CORE_RESERVE_THB)
        <= Number(values.GOOGLE_CLOUD_MONTHLY_BUDGET_THB)
    );
    for (const restrictedName of ['SQL_DATABASE', 'SQL_USER', 'SQL_MIGRATION_USER']) {
      assert.equal(Object.hasOwn(values, restrictedName), false, `${restrictedName} must come from protected deployment variables`);
    }
  }
});

test('checked-in staging Secret Manager pins are bound to the selected project and environment', () => {
  const pins = JSON.parse(read('deploy/secret-versions/staging.json'));
  assert.ok(Object.keys(pins).length > 0);
  for (const [name, resource] of Object.entries(pins)) {
    assert.match(
      resource,
      new RegExp(`^projects/cusa-reunion/secrets/psevent-staging-${name}/versions/[0-9]+$`)
    );
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
  assert.match(dockerignore, /^hosting$/m);
  assert.doesNotMatch(dockerignore, /\*\*\* (?:Add|Update|Delete) File:/);
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
  assert.equal(read('.nvmrc').trim(), '22.22.0');
  assert.equal(read('.node-version').trim(), '22.22.0');
  assert.match(release, /require_ci_node_version/);
  assert.match(release, /major === 22 && minor >= 22/);
  assert.match(workflow, /node-version: 22\.22\.0/);
});

test('release deployment resolves a pushed image digest before Cloud Run', () => {
  const release = read('scripts/release.sh');
  assert.match(release, /containerimage\.digest/);
  assert.match(release, /IMAGE_URI=.*@\$digest/);
  assert.match(release, /--no-traffic --tag/);
  assert.match(release, /rollback_revision "\$previous_revision"/);
});

test('Plesk MariaDB egress is explicit, static, allowlistable, and shared by service and migration job', () => {
  const release = read('scripts/release.sh');
  const deployWorkflow = read('.github/workflows/deploy.yml');
  const migrationWorkflow = read('.github/workflows/sql-migrate.yml');
  const secretSync = read('scripts/sync-secrets.js');
  assert.match(release, /CONFIRM_SQL_STATIC_EGRESS/);
  assert.match(release, /compute addresses create/);
  assert.match(release, /compute routers nats (?:create|update)/);
  assert.match(release, /--nat-external-ip-pool/);
  assert.match(release, /--vpc-egress all-traffic/);
  assert.match(release, /CLOUD_RUN_NETWORK_ARGS=\(--clear-network\)/);
  assert.match(release, /CLOUD_RUN_NETWORK_ARGS/);
  assert.match(release, /SQL_NETWORK_ALLOWLIST_CONFIRMED=true/);
  assert.match(release, /APPROVED_PLESK_SQL_HOST="203\.170\.190\.137"/);
  assert.match(release, /verifySqlTransport\.js/);
  assert.match(release, /SQL_ENABLED=true requires VERIFY_SQL_TRANSPORT=true/);
  assert.match(release, /jobs deploy "\$SERVICE-migrate"[\s\S]*--execute-now --wait/);
  assert.match(release, /jobs deploy "\$SERVICE-sql-transport"[\s\S]*--execute-now --wait/);
  assert.match(release, /jobs deploy "\$SERVICE-sql-backfill"[\s\S]*--execute-now --wait/);
  assert.match(release, /jobs deploy "\$SERVICE-sql-protection-audit"[\s\S]*--execute-now --wait/);
  assert.match(release, /CONFIRM_SQL_MIRROR_MIGRATION/);
  assert.match(release, /SQL_PRIMARY_STORE is not implemented/);
  assert.match(release, /PSEvent \$PROJECT_ID total <= 1000 THB/);
  assert.doesNotMatch(release, /PSEvent \$DEPLOY_ENVIRONMENT <= 1000 THB/);
  assert.match(release, /billing budgets update/);
  for (const name of ['SQL_DATABASE', 'SQL_USER', 'SQL_MIGRATION_USER', 'SQL_SSL_SERVERNAME']) {
    assert.match(deployWorkflow, new RegExp(`${name}: \\$\\{\\{ vars\\.${name} \\}\\}`));
    assert.match(migrationWorkflow, new RegExp(`${name}: \\$\\{\\{ vars\\.${name} \\}\\}`));
  }
  assert.match(secretSync, /name === 'SQL_MIGRATION_PASSWORD'[\s\S]*revokeSecretAccess\(projectId, secretId, runtimeAccount\)/);
  assert.match(secretSync, /SECRET_SYNC_PROFILE[\s\S]*sql-migration/);
  assert.match(secretSync, /sqlBackfillEnabled[\s\S]*MONGODB_URI[\s\S]*SQL_MIRROR_IDENTITY_HASH_SECRET/);
  assert.match(secretSync, /CONFIRM_SQL_MIGRATION_ACCESS_REVOKE/);
  assert.match(migrationWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(migrationWorkflow, /if:\s*vars\.SQL_MIGRATION_ENABLED/);
  assert.match(migrationWorkflow, /Require the protected migration gate/);
  assert.match(migrationWorkflow, /\[\[ "\$SQL_MIGRATION_ENABLED" != "true" \]\]/);
  assert.match(migrationWorkflow, /CONFIRM_SQL_MIRROR_MIGRATION: \$\{\{ inputs\.environment \}\}/);
  assert.match(migrationWorkflow, /SQL_PRIMARY_STORE: "false"/);
  assert.doesNotMatch(migrationWorkflow, /SQL_OUTBOX_ENABLED: "true"/);
});

test('SQL migration Secret access is temporary and limited to the selected job profile', () => {
  const runtime = buildSecretAccessPlan({});
  assert.deepEqual(runtime.migrationAccessNames, []);

  const schemaOnly = buildSecretAccessPlan({
    RUN_SQL_MIGRATIONS: 'true',
    SQL_SSL_CA_SECRET_NAME: 'SQL_SSL_CA',
  });
  assert.deepEqual(schemaOnly.migrationAccessNames, [
    'SQL_MIGRATION_PASSWORD',
    'SQL_SSL_CA',
  ]);

  const backfill = buildSecretAccessPlan({
    SECRET_SYNC_PROFILE: 'sql-migration',
    SQL_SSL_CA_SECRET_NAME: 'SQL_SSL_CA',
  });
  assert.deepEqual(backfill.migrationAccessNames, [
    'MONGODB_URI',
    'SQL_MIGRATION_PASSWORD',
    'SQL_MIRROR_IDENTITY_HASH_SECRET',
    'SQL_SSL_CA',
  ]);

  const hostatomWithoutCa = buildSecretAccessPlan({
    SECRET_SYNC_PROFILE: 'sql-migration',
    SQL_SSL_CA_SECRET_NAME: '',
  });
  assert.deepEqual(hostatomWithoutCa.migrationAccessNames, [
    'MONGODB_URI',
    'SQL_MIGRATION_PASSWORD',
    'SQL_MIRROR_IDENTITY_HASH_SECRET',
  ]);

  const cleanup = buildSecretAccessPlan({ SECRET_SYNC_PROFILE: 'sql-migration-cleanup' });
  assert.equal(cleanup.cleanupOnly, true);
  assert.deepEqual(cleanup.migrationAccessNames, []);
  assert.throws(
    () => buildSecretAccessPlan({ SECRET_SYNC_PROFILE: 'unsupported' }),
    /sql-migration or sql-migration-cleanup/
  );
});

test('SQL migration cleanup revokes four IAM bindings without mutating Secret versions', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'psevent-secret-cleanup-test-'));
  const gcloudStub = path.join(tempDir, 'gcloud');
  const gcloudLog = path.join(tempDir, 'gcloud.log');
  const pinsPath = path.join(tempDir, 'pins.json');
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  fs.writeFileSync(gcloudStub, [
    '#!/bin/sh',
    'printf "%s\\n" "$*" >> "$GCLOUD_LOG"',
    'case "$*" in',
    '  *"projects get-iam-policy"*)',
    '    if [ "${GCLOUD_BROAD_ACCESS:-false}" = "true" ]; then',
    '      printf \'{"bindings":[{"role":"roles/secretmanager.secretAccessor","members":["serviceAccount:psevent-migration-staging@cusa-reunion.iam.gserviceaccount.com"]}]}\\n\'',
    '    else',
    '      printf \'{"bindings":[]}\\n\'',
    '    fi',
    '    ;;',
    '  *"secrets describe"*) printf "present\\n" ;;',
    '  *"secrets get-iam-policy"*)',
    '    printf \'{"bindings":[{"role":"roles/secretmanager.secretAccessor","members":["serviceAccount:psevent-migration-staging@cusa-reunion.iam.gserviceaccount.com"]}]}\\n\'',
    '    ;;',
    'esac',
    'exit 0',
    '',
  ].join('\n'), { mode: 0o755 });

  const env = {
    ...process.env,
    PATH: `${tempDir}${path.delimiter}${process.env.PATH || ''}`,
    GCLOUD_LOG: gcloudLog,
    PROJECT_ID: 'cusa-reunion',
    SECRET_MANAGER_PREFIX: 'psevent-staging',
    MIGRATION_SERVICE_ACCOUNT: 'psevent-migration-staging',
    SECRET_SYNC_PROFILE: 'sql-migration-cleanup',
    CONFIRM_SQL_MIGRATION_ACCESS_REVOKE: 'staging',
    ALLOW_SECRET_UPLOAD: 'true',
    SECRET_VERSIONS_FILE: pinsPath,
  };
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/sync-secrets.js'), 'staging'], {
    cwd: ROOT,
    encoding: 'utf8',
    env,
  });
  assert.equal(result.status, 0, result.stderr);
  const commands = fs.readFileSync(gcloudLog, 'utf8').trim().split('\n');
  const removals = commands.filter((command) => command.includes('secrets remove-iam-policy-binding'));
  assert.equal(removals.length, 4);
  for (const name of [
    'MONGODB_URI',
    'SQL_MIGRATION_PASSWORD',
    'SQL_MIRROR_IDENTITY_HASH_SECRET',
    'SQL_SSL_CA',
  ]) {
    assert.ok(removals.some((command) => command.includes(`psevent-staging-${name}`)), name);
  }
  assert.equal(commands.some((command) => /versions add|secrets create/.test(command)), false);
  assert.equal(fs.existsSync(pinsPath), false);

  const rejected = spawnSync(process.execPath, [path.join(ROOT, 'scripts/sync-secrets.js'), 'staging'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...env,
      CONFIRM_SQL_MIGRATION_ACCESS_REVOKE: '',
    },
  });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /CONFIRM_SQL_MIGRATION_ACCESS_REVOKE=staging/);

  const broadAccess = spawnSync(process.execPath, [path.join(ROOT, 'scripts/sync-secrets.js'), 'staging'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...env,
      GCLOUD_BROAD_ACCESS: 'true',
    },
  });
  assert.notEqual(broadAccess.status, 0);
  assert.match(broadAccess.stderr, /forbidden project-level Secret access/);
});

test('disabled optional release steps do not abort the command under errexit', (t) => {
  const commandDir = fs.mkdtempSync(path.join(os.tmpdir(), 'psevent-release-test-'));
  const gcloudStub = path.join(commandDir, 'gcloud');
  const jqStub = path.join(commandDir, 'jq');
  fs.writeFileSync(gcloudStub, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(jqStub, '#!/bin/sh\nprintf "0\\n"\n', { mode: 0o755 });
  t.after(() => fs.rmSync(commandDir, { recursive: true, force: true }));

  const result = spawnSync('bash', [path.join(ROOT, 'scripts/release.sh'), 'plan', 'staging'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${commandDir}${path.delimiter}${process.env.PATH || ''}`,
      PROJECT_ID: 'cusa-reunion',
      PROJECT_NUMBER: '123456789012',
      LOAD_LOCAL_DEPLOY_CONFIG: 'false',
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Deploy readiness: (?:BLOCKED|configuration and secret pins are valid)/);

  const wrongProject = spawnSync('bash', [path.join(ROOT, 'scripts/release.sh'), 'plan', 'staging'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${commandDir}${path.delimiter}${process.env.PATH || ''}`,
      PROJECT_ID: 'another-project',
      PROJECT_NUMBER: '123456789012',
      LOAD_LOCAL_DEPLOY_CONFIG: 'false',
    },
  });
  assert.notEqual(wrongProject.status, 0);
  assert.match(wrongProject.stderr, /approved project cusa-reunion/);

  const excessiveBudget = spawnSync('bash', [path.join(ROOT, 'scripts/release.sh'), 'plan', 'staging'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${commandDir}${path.delimiter}${process.env.PATH || ''}`,
      PROJECT_ID: 'cusa-reunion',
      PROJECT_NUMBER: '123456789012',
      GOOGLE_CLOUD_MONTHLY_BUDGET_THB: '1001',
      LOAD_LOCAL_DEPLOY_CONFIG: 'false',
    },
  });
  assert.notEqual(excessiveBudget.status, 0);
  assert.match(excessiveBudget.stderr, /between 1 and 1000/);
});

test('GitHub workflows use OIDC, minimal permissions, and immutable action pins', () => {
  const ci = read('.github/workflows/ci.yml');
  const deploy = read('.github/workflows/deploy.yml');
  const sqlMigration = read('.github/workflows/sql-migrate.yml');
  assert.match(ci, /contents: read/);
  assert.match(deploy, /id-token: write/);
  assert.match(sqlMigration, /id-token: write/);
  assert.doesNotMatch(deploy, /service_account_key|credentials_json|GCP_SA_KEY/);
  assert.doesNotMatch(sqlMigration, /service_account_key|credentials_json|GCP_SA_KEY/);
  assert.match(deploy, /environment: production/);
  assert.match(deploy, /CONFIRM_PRODUCTION_DEPLOY: production/);
  assert.doesNotMatch(sqlMigration, /if:\s*vars\.SQL_MIGRATION_ENABLED/);
  assert.match(sqlMigration, /SQL_MIGRATION_ENABLED: \$\{\{ vars\.SQL_MIGRATION_ENABLED/);
  assert.match(sqlMigration, /\[\[ "\$SQL_MIGRATION_ENABLED" != "true" \]\]/);
  for (const workflow of [ci, deploy, sqlMigration]) {
    const actionLines = workflow.split('\n').filter((line) => line.trim().startsWith('uses:'));
    assert.ok(actionLines.length > 0);
    for (const line of actionLines) assert.match(line, /@[0-9a-f]{40}(?:\s|$)/, `Action is not SHA-pinned: ${line}`);
  }
});

test('Plesk web deployment is a guarded manual pull/deploy from main and never uses FTP or webhooks', () => {
  const release = read('scripts/plesk-release.sh');
  const sourceVerifier = read('scripts/verify-plesk-source.js');
  const rootRelease = read('scripts/release.sh');
  const smoke = read('scripts/smoke-plesk-gateway.js');

  assert.match(rootRelease, /scripts\/plesk-release\.sh/);
  assert.match(release, /verify-plesk-source\.js/);
  assert.match(release, /Manual deployment source verified/);
  assert.match(sourceVerifier, /PLESK_EXPECTED_BRANCH/);
  assert.match(sourceVerifier, /PLESK_APPROVED_SHA/);
  assert.match(sourceVerifier, /branch', '--show-current/);
  assert.match(sourceVerifier, /diff', '--quiet/);
  assert.match(sourceVerifier, /refs\/heads/);
  assert.match(sourceVerifier, /assertTrackedTreeMatches/);
  assert.match(release, /npm .* ci --omit=dev/);
  assert.match(release, /VITE_API_BASE_URL=\/api/);
  assert.match(release, /prepare-plesk-public\.js/);
  assert.match(release, /tmp\/restart\.txt/);
  assert.doesNotMatch(release, /\bftp\b|\bftps\b|\bsftp\b|webhook/i);
  assert.match(read('scripts/prepare-plesk-public.js'), /PLESK_INCOMPATIBLE_PUBLIC_FILES = \['\.htaccess'\]/);
  assert.match(read('scripts/prepare-plesk-public.js'), /--rollback/);
  assert.match(smoke, /gateway\/health\/ready/);
  assert.match(smoke, /api\/participant-auth\/providers/);
  assert.match(smoke, /x-gateway-release/);
  assert.match(smoke, /content-security-policy/);
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
    'BREVO_API_KEY',
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
      PUBLIC_WEB_ORIGIN: 'https://reunion.scicu-alumni.com',
      SECRET_VERSIONS_FILE: pinsPath,
      RUNTIME_ENV_FILE: outputPath,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const rendered = fs.readFileSync(outputPath, 'utf8');
  assert.match(rendered, /SECRET_MANAGER_REQUIRE_PINNED_VERSIONS: "true"/);
  assert.match(rendered, /EMAIL_PROVIDER: "brevo"/);
  assert.match(rendered, /BREVO_FROM_EMAIL: "noreply-event@pstpyst\.com"/);
  assert.match(rendered, /DEPLOY_ENVIRONMENT: "staging"/);
  assert.match(rendered, /SERVE_FRONTEND: "true"/);
  assert.match(rendered, /GCS_LOCATION: "asia-southeast3"/);
  assert.match(rendered, /PUBLIC_URL: "https:\/\/reunion\.scicu-alumni\.com"/);
  assert.match(rendered, /OBJECT_STORAGE_PUBLIC_API_ORIGIN: "https:\/\/reunion\.scicu-alumni\.com"/);
  assert.match(rendered, /CORS_ORIGIN: "https:\/\/psevent-staging-123456789012\.asia-southeast3\.run\.app,https:\/\/reunion\.scicu-alumni\.com"/);
  for (const name of ['PORT', 'K_SERVICE', 'K_REVISION', 'K_CONFIGURATION']) {
    assert.doesNotMatch(rendered, new RegExp(`^${name}:`, 'm'), `${name} is reserved by Cloud Run`);
  }
  assert.doesNotMatch(rendered, /^X_GOOGLE_[A-Z0-9_]*:/m);
  for (const name of pinNames) assert.doesNotMatch(rendered, new RegExp(`^${name}:`, 'm'));

  const crossProjectPins = { ...pins };
  crossProjectPins.JWT_SECRET = 'projects/other-project/secrets/psevent-staging-JWT_SECRET/versions/1';
  fs.writeFileSync(pinsPath, JSON.stringify(crossProjectPins));
  const rejected = spawnSync(process.execPath, [path.join(ROOT, 'scripts/render-runtime-env.js'), 'staging'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DEPLOY_ENVIRONMENT: 'staging',
      PROJECT_ID: 'psevent-test1',
      PROJECT_NUMBER: '123456789012',
      RELEASE_ID: 'abcdef1234567890',
      SECRET_VERSIONS_FILE: pinsPath,
      RUNTIME_ENV_FILE: outputPath,
    },
  });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /belongs to a different project/);
});

test('SQL backfill renderer fails before job deployment when a job-specific pin is missing', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'psevent-sql-render-test-'));
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
    'BREVO_API_KEY',
    'SQL_PASSWORD',
    'SQL_MIGRATION_PASSWORD',
    'SQL_SSL_CA',
  ];
  const pins = Object.fromEntries(pinNames.map((name, index) => [
    name,
    `projects/psevent-test1/secrets/psevent-staging-${name}/versions/${index + 1}`,
  ]));
  fs.writeFileSync(pinsPath, JSON.stringify(pins));
  const env = {
    ...process.env,
    DEPLOY_ENVIRONMENT: 'staging',
    PROJECT_ID: 'psevent-test1',
    PROJECT_NUMBER: '123456789012',
    RELEASE_ID: 'abcdef1234567890',
    PUBLIC_WEB_ORIGIN: 'https://reunion.scicu-alumni.com',
    SECRET_VERSIONS_FILE: pinsPath,
    RUNTIME_ENV_FILE: outputPath,
    SQL_ENABLED: 'true',
    SQL_SSL_CA_SECRET_NAME: 'SQL_SSL_CA',
    SQL_BACKFILL_MODE: 'true',
  };

  const rejected = spawnSync(process.execPath, [path.join(ROOT, 'scripts/render-runtime-env.js'), 'staging'], {
    cwd: ROOT,
    encoding: 'utf8',
    env,
  });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /SQL_MIRROR_IDENTITY_HASH_SECRET/);

  pins.SQL_MIRROR_IDENTITY_HASH_SECRET = 'projects/psevent-test1/secrets/psevent-staging-SQL_MIRROR_IDENTITY_HASH_SECRET/versions/99';
  fs.writeFileSync(pinsPath, JSON.stringify(pins));
  const accepted = spawnSync(process.execPath, [path.join(ROOT, 'scripts/render-runtime-env.js'), 'staging'], {
    cwd: ROOT,
    encoding: 'utf8',
    env,
  });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stdout, /SQL_MIGRATION_PASSWORD/);
  assert.match(accepted.stdout, /SQL_MIRROR_IDENTITY_HASH_SECRET/);
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
