const test = require('node:test');
const assert = require('node:assert/strict');
const {
  explicitMigrationApply,
  legacyScopeDecision,
} = require('../src/utils/migrationMode');

test('migration mode defaults to read-only', () => {
  assert.equal(explicitMigrationApply({
    writeFlag: 'TEST_MIGRATION_WRITE',
    args: [],
    env: {},
  }), false);
});

test('migration apply requires both the argument and write flag', () => {
  assert.throws(() => explicitMigrationApply({
    writeFlag: 'TEST_MIGRATION_WRITE',
    args: ['--apply'],
    env: {},
  }), /TEST_MIGRATION_WRITE=true/);
  assert.throws(() => explicitMigrationApply({
    writeFlag: 'TEST_MIGRATION_WRITE',
    args: [],
    env: { TEST_MIGRATION_WRITE: 'true' },
  }), /requires the explicit --apply/);
  assert.equal(explicitMigrationApply({
    writeFlag: 'TEST_MIGRATION_WRITE',
    args: ['--apply'],
    env: { TEST_MIGRATION_WRITE: 'true' },
  }), true);
});

test('migration mode rejects an unsafe flag name', () => {
  assert.throws(() => explicitMigrationApply({
    writeFlag: 'bad-name',
    args: [],
    env: {},
  }), /valid migration write flag/);
});

test('Mongo apply requires maintenance, backup, and restore evidence references', () => {
  const base = {
    writeFlag: 'TEST_MIGRATION_WRITE',
    mongoSafetyGate: true,
    args: ['--apply'],
  };
  assert.throws(
    () => explicitMigrationApply({
      ...base,
      env: { TEST_MIGRATION_WRITE: 'true' },
    }),
    /MONGO_MIGRATION_MAINTENANCE_CONFIRMED/
  );
  assert.throws(
    () => explicitMigrationApply({
      ...base,
      env: {
        TEST_MIGRATION_WRITE: 'true',
        MONGO_MIGRATION_MAINTENANCE_CONFIRMED: 'true',
        MONGO_MIGRATION_BACKUP_REFERENCE: 'pending',
        MONGO_MIGRATION_RESTORE_DRILL_REFERENCE: 'restore-20260726',
      },
    }),
    /BACKUP_REFERENCE/
  );
  assert.throws(
    () => explicitMigrationApply({
      ...base,
      env: {
        TEST_MIGRATION_WRITE: 'true',
        MONGO_MIGRATION_MAINTENANCE_CONFIRMED: 'true',
        MONGO_MIGRATION_BACKUP_REFERENCE: 'atlas-snapshot-<approved-id>',
        MONGO_MIGRATION_RESTORE_DRILL_REFERENCE: 'restore-20260726',
      },
    }),
    /BACKUP_REFERENCE/
  );
  assert.equal(explicitMigrationApply({
    ...base,
    env: {
      TEST_MIGRATION_WRITE: 'true',
      MONGO_MIGRATION_MAINTENANCE_CONFIRMED: 'true',
      MONGO_MIGRATION_BACKUP_REFERENCE: 'atlas-snapshot-20260726',
      MONGO_MIGRATION_RESTORE_DRILL_REFERENCE: 'restore-20260726',
    },
  }), true);
});

test('legacy scope apply requires an explicit global or current-event decision', () => {
  assert.equal(legacyScopeDecision({ value: '', required: false }), null);
  assert.equal(legacyScopeDecision({ value: ' GLOBAL ', required: true }), 'global');
  assert.equal(legacyScopeDecision({ value: 'current-event', required: true }), 'current-event');
  assert.throws(
    () => legacyScopeDecision({
      value: '',
      required: true,
      variableName: 'REG_POINT_LEGACY_SCOPE_DECISION',
    }),
    /REG_POINT_LEGACY_SCOPE_DECISION/
  );
  assert.throws(
    () => legacyScopeDecision({ value: 'guess', required: true }),
    /global or current-event/
  );
});
