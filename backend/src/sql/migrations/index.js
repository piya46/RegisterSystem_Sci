const crypto = require('crypto');
const initialReportingMirror = require('./001_initial_reporting_mirror');
const transactionReversalLookup = require('./002_transaction_reversal_lookup');
const eventRegistrationPrimarySchema = require('./003_event_registration_primary_schema');

const migrations = [initialReportingMirror, transactionReversalLookup, eventRegistrationPrimarySchema];

function migrationChecksum(migration) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      id: migration.id,
      description: migration.description,
      statements: migration.statements,
    }))
    .digest('hex');
}

function assertRestartSafeStatement(statement, migrationId) {
  if (typeof statement !== 'string' || !statement.trim()) {
    throw new Error(`SQL migration ${migrationId} contains an empty or non-string statement`);
  }

  const normalized = statement.replace(/\s+/g, ' ').trim();
  if (/\b(?:DROP|TRUNCATE)\b|\bDELETE\s+FROM\b|\bRENAME\s+TABLE\b/i.test(normalized)) {
    throw new Error(`Destructive SQL is not allowed in migration ${migrationId}`);
  }
  if (/^CREATE\s+TABLE\b/i.test(normalized) && !/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/i.test(normalized)) {
    throw new Error(`CREATE TABLE must be restart-safe in SQL migration ${migrationId}`);
  }
  if (
    /^CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(normalized)
    && !/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\b/i.test(normalized)
  ) {
    throw new Error(`CREATE INDEX must be restart-safe in SQL migration ${migrationId}`);
  }
  if (/^ALTER\s+TABLE\b/i.test(normalized) && !/\bIF\s+NOT\s+EXISTS\b/i.test(normalized)) {
    throw new Error(`ALTER TABLE must be restart-safe in SQL migration ${migrationId}`);
  }
}

function validateMigrationPlan(plan = migrations) {
  const ids = new Set();
  for (const migration of plan) {
    if (!/^\d{3}_[a-z0-9_]+$/.test(migration.id)) throw new Error(`Invalid SQL migration id: ${migration.id}`);
    if (ids.has(migration.id)) throw new Error(`Duplicate SQL migration id: ${migration.id}`);
    if (!Array.isArray(migration.statements) || migration.statements.length === 0) {
      throw new Error(`SQL migration ${migration.id} has no statements`);
    }
    migration.statements.forEach((statement) => assertRestartSafeStatement(statement, migration.id));
    ids.add(migration.id);
  }
  return true;
}

module.exports = {
  migrationChecksum,
  migrations,
  validateMigrationPlan,
};
