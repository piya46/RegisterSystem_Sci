require('dotenv').config();

const { closeSQL, connectSQL, executeSql } = require('../config/sql');
const { clearSecretCache, hydrateRuntimeSecrets } = require('../utils/secretProvider');

const PROTECTION_AUDITS = Object.freeze([
  Object.freeze({
    name: 'participant_qr',
    sql: `SELECT COALESCE(SUM(CASE
      WHEN qr_code = '' OR BINARY qr_code NOT REGEXP '^[0-9a-f]{64}$' THEN 1 ELSE 0 END), 0) AS violations
      FROM participants_core`,
  }),
  Object.freeze({
    name: 'participant_identity_indices',
    sql: `SELECT COALESCE(SUM(CASE WHEN
      (email_blind_index IS NOT NULL AND email_blind_index <> ''
        AND BINARY email_blind_index NOT REGEXP '^[0-9a-f]{64}$')
      OR (phone_blind_index IS NOT NULL AND phone_blind_index <> ''
        AND BINARY phone_blind_index NOT REGEXP '^[0-9a-f]{64}$')
      OR (name_blind_index IS NOT NULL AND name_blind_index <> ''
        AND BINARY name_blind_index NOT REGEXP '^[0-9a-f]{64}$')
      OR (line_user_blind_index IS NOT NULL AND line_user_blind_index <> ''
        AND BINARY line_user_blind_index NOT REGEXP '^[0-9a-f]{64}$')
      THEN 1 ELSE 0 END), 0) AS violations
      FROM participants_core`,
  }),
  Object.freeze({
    name: 'vendor_qr',
    sql: `SELECT COALESCE(SUM(CASE
      WHEN qr_code_id = '' OR BINARY qr_code_id NOT REGEXP '^[0-9a-f]{64}$' THEN 1 ELSE 0 END), 0) AS violations
      FROM vendors`,
  }),
  Object.freeze({
    name: 'transaction_tokens',
    sql: `SELECT COALESCE(SUM(CASE WHEN
      (idempotency_key IS NOT NULL AND idempotency_key <> ''
        AND BINARY idempotency_key NOT REGEXP '^[0-9a-f]{64}$')
      OR (verification_code <> '' AND BINARY verification_code NOT REGEXP '^[0-9a-f]{64}$')
      THEN 1 ELSE 0 END), 0) AS violations
      FROM wallet_transactions`,
  }),
  Object.freeze({
    name: 'receipt_number',
    sql: `SELECT COALESCE(SUM(CASE
      WHEN receipt_number = '' OR BINARY receipt_number NOT REGEXP '^[0-9a-f]{64}$' THEN 1 ELSE 0 END), 0) AS violations
      FROM receipts`,
  }),
]);

async function auditSqlMirrorProtection() {
  if (process.env.SQL_PROTECTION_AUDIT !== 'true') {
    throw new Error('SQL_PROTECTION_AUDIT=true is required for the read-only SQL mirror audit');
  }
  if (process.env.SQL_ENABLED !== 'true') throw new Error('SQL_ENABLED=true is required for the SQL mirror audit');

  const requiredNames = ['SQL_PASSWORD'];
  if (process.env.SQL_SSL_CA_SECRET_NAME) requiredNames.push('SQL_SSL_CA');
  await hydrateRuntimeSecrets({ requiredNames, managedNames: requiredNames });
  await connectSQL();

  const checks = [];
  for (const audit of PROTECTION_AUDITS) {
    const result = await executeSql(audit.sql, [], { operation: 'read' });
    const violations = Number(result.rows[0]?.violations || 0);
    if (!Number.isSafeInteger(violations) || violations < 0) {
      throw new Error(`Invalid aggregate result for SQL protection audit ${audit.name}`);
    }
    checks.push({ name: audit.name, violations, passed: violations === 0 });
  }
  return {
    passed: checks.every((check) => check.passed),
    checks,
  };
}

async function main() {
  try {
    const result = await auditSqlMirrorProtection();
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) {
      const error = new Error('SQL mirror protection audit found non-protected values');
      error.code = 'SQL_MIRROR_PROTECTION_AUDIT_FAILED';
      throw error;
    }
  } finally {
    await closeSQL().catch(() => {});
    clearSecretCache();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`SQL mirror protection audit failed: ${error.code || 'SQL_MIRROR_PROTECTION_AUDIT_FAILED'}`);
    process.exitCode = 1;
  });
}

module.exports = {
  PROTECTION_AUDITS,
  auditSqlMirrorProtection,
};
