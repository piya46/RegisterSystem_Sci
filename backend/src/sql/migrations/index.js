const crypto = require('crypto');
const initialReportingMirror = require('./001_initial_reporting_mirror');
const transactionReversalLookup = require('./002_transaction_reversal_lookup');

const migrations = [initialReportingMirror, transactionReversalLookup];

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

function validateMigrationPlan(plan = migrations) {
  const ids = new Set();
  for (const migration of plan) {
    if (!/^\d{3}_[a-z0-9_]+$/.test(migration.id)) throw new Error(`Invalid SQL migration id: ${migration.id}`);
    if (ids.has(migration.id)) throw new Error(`Duplicate SQL migration id: ${migration.id}`);
    if (!Array.isArray(migration.statements) || migration.statements.length === 0) {
      throw new Error(`SQL migration ${migration.id} has no statements`);
    }
    if (migration.statements.some((statement) => /\bDROP\s+(DATABASE|TABLE)\b/i.test(statement))) {
      throw new Error(`Destructive SQL is not allowed in migration ${migration.id}`);
    }
    ids.add(migration.id);
  }
  return true;
}

module.exports = {
  migrationChecksum,
  migrations,
  validateMigrationPlan,
};
