require('dotenv').config();

const { closeSQL, connectSQL, executeSql, sqlStatus } = require('../config/sql');
const { assertRemoteSqlMigrationTarget, isLocalSqlHost } = require('../sql/migrationRuntime');
const { migrationChecksum, migrations, validateMigrationPlan } = require('../sql/migrations');
const { boolEnv } = require('../utils/cloudCostGuardrail');

const EVENT_REGISTRATION_MIGRATION_ID = '003_event_registration_primary_schema';
const EVENT_REGISTRATION_TABLES = [
  'event_runtime_configs',
  'event_registration_points',
  'event_participant_fields',
  'event_registrations',
  'event_registration_field_values',
  'event_registration_idempotency_keys',
  'event_registration_checkins',
  'event_scoped_registration_sessions',
  'event_registration_reconciliation_snapshots',
  'event_registration_cutover_runs',
];

function envValue(name) {
  return String(process.env[name] || '').trim();
}

function present(name) {
  return envValue(name).length > 0;
}

function addCheck(checks, name, ok, message, severity = 'error') {
  checks.push({
    name,
    status: ok ? 'pass' : severity,
    message,
  });
}

function targetSummary() {
  const host = envValue('SQL_HOST');
  const usesSocket = present('SQL_SOCKET_PATH');
  return {
    provider: envValue('SQL_PROVIDER') || 'self_managed',
    dialect: envValue('SQL_DIALECT') || 'mariadb',
    hostClass: usesSocket ? 'socket' : (isLocalSqlHost(host) ? 'local' : 'remote'),
    hostConfigured: present('SQL_HOST'),
    port: Number(process.env.SQL_PORT || 3306),
    databaseConfigured: present('SQL_DATABASE'),
    sslMode: String(process.env.SQL_SSL_MODE || (process.env.NODE_ENV === 'production' ? 'verify_identity' : 'disabled')).toLowerCase(),
    sqlEnabled: boolEnv('SQL_ENABLED', false),
    remoteOnly: boolEnv('SQL_REMOTE_MIGRATION_ONLY', false),
    primaryStoreFlag: boolEnv('SQL_PRIMARY_STORE', false),
    eventRegistrationPrimary: boolEnv('SQL_EVENT_REGISTRATION_PRIMARY', false),
  };
}

function staticReadiness() {
  const checks = [];
  validateMigrationPlan();
  const target = targetSummary();
  const migrationIds = migrations.map((migration) => migration.id);

  addCheck(
    checks,
    'sql_target_is_remote',
    target.hostClass === 'remote',
    target.hostClass === 'remote'
      ? 'SQL_HOST points to a remote database host'
      : 'SQL_HOST must point to the real remote database host for this cutover'
  );
  addCheck(
    checks,
    'remote_only_guard_enabled',
    target.remoteOnly,
    target.remoteOnly
      ? 'SQL_REMOTE_MIGRATION_ONLY=true prevents accidental local SQL migration'
      : 'Set SQL_REMOTE_MIGRATION_ONLY=true before applying migrations to the real host',
    'warning'
  );
  addCheck(checks, 'sql_database_configured', target.databaseConfigured, 'SQL_DATABASE is required');
  addCheck(
    checks,
    'sql_enabled_for_connect',
    target.sqlEnabled,
    target.sqlEnabled
      ? 'SQL_ENABLED=true allows read-only transport checks and runtime SQL access'
      : 'Set SQL_ENABLED=true before running --connect or using MariaDB at runtime',
    'warning'
  );
  addCheck(checks, 'sql_runtime_user_configured', present('SQL_USER') && present('SQL_PASSWORD'), 'SQL_USER and SQL_PASSWORD are required for the runtime connection');
  addCheck(checks, 'sql_migration_user_configured', present('SQL_MIGRATION_USER') && present('SQL_MIGRATION_PASSWORD'), 'SQL_MIGRATION_USER and SQL_MIGRATION_PASSWORD are required for schema migration');
  addCheck(
    checks,
    'primary_store_runtime_guard',
    !target.primaryStoreFlag,
    'Keep SQL_PRIMARY_STORE=false until application repositories are switched domain-by-domain'
  );
  addCheck(
    checks,
    'event_registration_primary_scope',
    !target.eventRegistrationPrimary || target.sqlEnabled,
    target.eventRegistrationPrimary
      ? 'SQL_EVENT_REGISTRATION_PRIMARY=true is scoped to event registration runtime only'
      : 'SQL_EVENT_REGISTRATION_PRIMARY=false keeps registration runtime on MongoDB',
    'warning'
  );
  addCheck(
    checks,
    'event_registration_schema_in_plan',
    migrationIds.includes(EVENT_REGISTRATION_MIGRATION_ID),
    `${EVENT_REGISTRATION_MIGRATION_ID} is included in the SQL migration plan`
  );
  addCheck(
    checks,
    'migration_write_requires_apply_window',
    boolEnv('SQL_MIGRATION_WRITE', false),
    'Set SQL_MIGRATION_WRITE=true only in the approved migration window before running --apply',
    'warning'
  );

  if (process.env.NODE_ENV === 'production') {
    const productionTlsReady = target.sslMode === 'verify_identity'
      && present('SQL_SSL_CA')
      && envValue('SQL_SSL_CA_SECRET_NAME') === 'SQL_SSL_CA';
    addCheck(
      checks,
      'production_tls_identity',
      productionTlsReady,
      'Production TCP requires SQL_SSL_MODE=verify_identity, SQL_SSL_CA, and SQL_SSL_CA_SECRET_NAME=SQL_SSL_CA'
    );
    addCheck(checks, 'sql_at_rest_confirmed', boolEnv('SQL_AT_REST_ENCRYPTION_CONFIRMED', false), 'Confirm MariaDB/Plesk storage encryption before production cutover');
    addCheck(checks, 'sql_backup_confirmed', boolEnv('SQL_BACKUP_ENCRYPTION_CONFIRMED', false), 'Confirm encrypted backup and restore drill before production cutover');
  } else {
    addCheck(
      checks,
      'development_tls_mode_selected',
      ['disabled', 'required', 'verify_ca', 'verify_identity'].includes(target.sslMode),
      'Development migration may use SQL_SSL_MODE=disabled or required when the host does not provide a CA'
    );
  }

  return {
    target,
    migrations: migrations.map((migration) => ({
      id: migration.id,
      description: migration.description,
      statementCount: migration.statements.length,
      checksum: migrationChecksum(migration),
    })),
    eventRegistrationTables: EVENT_REGISTRATION_TABLES,
    checks,
  };
}

async function connectedSchemaStatus() {
  assertRemoteSqlMigrationTarget();
  await connectSQL();
  const tableRows = await executeSql(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN (${EVENT_REGISTRATION_TABLES.map(() => '?').join(', ')})`,
    EVENT_REGISTRATION_TABLES
  );
  const foundTables = new Set(tableRows.rows.map((row) => row.table_name || row.TABLE_NAME));
  let appliedMigrations = [];
  try {
    const migrationRows = await executeSql(
      `SELECT migration_id, checksum, applied_at
         FROM schema_migrations
        ORDER BY migration_id`
    );
    appliedMigrations = migrationRows.rows;
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
  }
  return {
    sqlStatus: sqlStatus(),
    eventRegistrationTables: EVENT_REGISTRATION_TABLES.map((table) => ({
      table,
      exists: foundTables.has(table),
    })),
    appliedMigrations,
  };
}

async function main() {
  const shouldConnect = process.argv.includes('--connect');
  const report = {
    dryRun: !shouldConnect,
    ...staticReadiness(),
  };

  if (shouldConnect) {
    try {
      report.connected = await connectedSchemaStatus();
    } finally {
      await closeSQL().catch(() => {});
    }
  }

  report.ready = report.checks.every((check) => check.status !== 'error');
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`SQL primary cutover readiness audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  EVENT_REGISTRATION_TABLES,
  staticReadiness,
};
