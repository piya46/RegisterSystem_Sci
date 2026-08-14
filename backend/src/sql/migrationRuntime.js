const { boolEnv } = require('../utils/cloudCostGuardrail');
const { hydrateRuntimeSecrets } = require('../utils/secretProvider');

function mayUseRuntimeCredentials() {
  return process.env.NODE_ENV !== 'production'
    && boolEnv('SQL_MIGRATION_ALLOW_RUNTIME_CREDENTIALS', false);
}

function isLocalSqlHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  return normalized === 'localhost'
    || normalized === '::1'
    || normalized === '0.0.0.0'
    || normalized === '127.0.0.1'
    || normalized.startsWith('127.');
}

function assertRemoteSqlMigrationTarget() {
  if (!boolEnv('SQL_REMOTE_MIGRATION_ONLY', false)) return;
  if (String(process.env.SQL_SOCKET_PATH || '').trim()) {
    throw new Error('SQL_REMOTE_MIGRATION_ONLY=true rejects SQL_SOCKET_PATH; set SQL_HOST to the real database host');
  }
  const host = String(process.env.SQL_HOST || '').trim();
  if (!host || isLocalSqlHost(host)) {
    throw new Error('SQL_REMOTE_MIGRATION_ONLY=true requires SQL_HOST to be the real remote database host, not localhost');
  }
}

function migrationPasswordSecretName() {
  return mayUseRuntimeCredentials() && !process.env.SQL_MIGRATION_PASSWORD
    ? 'SQL_PASSWORD'
    : 'SQL_MIGRATION_PASSWORD';
}

async function hydrateSqlMigrationSecrets(additionalRequiredNames = []) {
  const passwordName = migrationPasswordSecretName();
  const tlsNames = process.env.SQL_SSL_CA_SECRET_NAME ? ['SQL_SSL_CA'] : [];
  const requiredNames = [...new Set([...additionalRequiredNames, passwordName, ...tlsNames])];
  await hydrateRuntimeSecrets({ requiredNames, managedNames: requiredNames });
  return { passwordName };
}

function applySqlMigrationCredentials() {
  assertRemoteSqlMigrationTarget();
  const allowRuntime = mayUseRuntimeCredentials();
  const migrationUser = process.env.SQL_MIGRATION_USER || (allowRuntime ? process.env.SQL_USER : '');
  const migrationPassword = process.env.SQL_MIGRATION_PASSWORD || (allowRuntime ? process.env.SQL_PASSWORD : '');
  if (!migrationUser) throw new Error('SQL_MIGRATION_USER is required for SQL migration work');
  if (!migrationPassword) throw new Error('SQL_MIGRATION_PASSWORD is required for SQL migration work');

  process.env.SQL_USER = migrationUser;
  process.env.SQL_PASSWORD = migrationPassword;
  process.env.SQL_ENABLED = 'true';
  process.env.SQL_PRIMARY_STORE = 'false';
}

module.exports = {
  applySqlMigrationCredentials,
  assertRemoteSqlMigrationTarget,
  hydrateSqlMigrationSecrets,
  isLocalSqlHost,
};
