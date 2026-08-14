function explicitMigrationApply({
  writeFlag,
  mongoSafetyGate = false,
  args = process.argv.slice(2),
  env = process.env,
} = {}) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(String(writeFlag || ''))) {
    throw new Error('A valid migration write flag is required');
  }
  const requested = args.includes('--apply');
  const enabled = String(env[writeFlag] || '').trim().toLowerCase() === 'true';
  if (requested && !enabled) {
    throw new Error(`Applying this migration requires ${writeFlag}=true`);
  }
  if (enabled && !requested) {
    throw new Error(`${writeFlag}=true requires the explicit --apply argument`);
  }
  if (requested && enabled && mongoSafetyGate) {
    assertMongoMigrationSafety(env);
  }
  return requested && enabled;
}

function evidenceReference(value) {
  const normalized = String(value || '').trim();
  if (normalized.length < 8) return false;
  return !/[<>]|change-me|example|pending|placeholder|todo|approved-id|none|n\/a/i.test(normalized);
}

function assertMongoMigrationSafety(env = process.env) {
  if (String(env.MONGO_MIGRATION_MAINTENANCE_CONFIRMED || '').toLowerCase() !== 'true') {
    throw new Error('MONGO_MIGRATION_MAINTENANCE_CONFIRMED=true is required');
  }
  if (!evidenceReference(env.MONGO_MIGRATION_BACKUP_REFERENCE)) {
    throw new Error('MONGO_MIGRATION_BACKUP_REFERENCE must identify the approved source backup');
  }
  if (!evidenceReference(env.MONGO_MIGRATION_RESTORE_DRILL_REFERENCE)) {
    throw new Error('MONGO_MIGRATION_RESTORE_DRILL_REFERENCE must identify a successful restore drill');
  }
}

function legacyScopeDecision({
  value,
  required = false,
  variableName = 'LEGACY_SCOPE_DECISION',
} = {}) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    if (required) {
      throw new Error(`${variableName} must be either global or current-event`);
    }
    return null;
  }
  if (!['global', 'current-event'].includes(normalized)) {
    throw new Error(`${variableName} must be either global or current-event`);
  }
  return normalized;
}

module.exports = {
  assertMongoMigrationSafety,
  evidenceReference,
  explicitMigrationApply,
  legacyScopeDecision,
};
