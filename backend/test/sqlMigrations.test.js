const test = require('node:test');
const assert = require('node:assert/strict');
const {
  migrationChecksum,
  migrations,
  validateMigrationPlan,
} = require('../src/sql/migrations');
const { xorChecksum } = require('../src/sql/checksum');

test('SQL migration plan is ordered, non-destructive, and checksummed', () => {
  assert.equal(validateMigrationPlan(), true);
  assert.ok(migrations.length > 0);
  assert.deepEqual(
    migrations.map((migration) => migration.id),
    [...migrations].map((migration) => migration.id).sort()
  );
  for (const migration of migrations) {
    assert.match(migrationChecksum(migration), /^[a-f0-9]{64}$/);
  }
});

test('SQL migration plan rejects destructive or non-restart-safe DDL', () => {
  const migration = (id, statement) => [{
    id,
    description: 'test migration',
    statements: [statement],
  }];

  assert.throws(
    () => validateMigrationPlan(migration('900_unsafe_table', 'CREATE TABLE unsafe_table (id INT)')),
    /restart-safe/
  );
  assert.throws(
    () => validateMigrationPlan(migration('901_unsafe_index', 'CREATE INDEX unsafe_index ON safe_table (id)')),
    /restart-safe/
  );
  assert.throws(
    () => validateMigrationPlan(migration('902_destructive', 'DROP TABLE safe_table')),
    /Destructive SQL/
  );
});

test('SQL mirror aggregate checksum is order-independent and resumable', () => {
  const first = '1'.repeat(64);
  const second = '2'.repeat(64);
  assert.equal(xorChecksum(xorChecksum(null, first), second), xorChecksum(xorChecksum(null, second), first));
  assert.equal(xorChecksum(xorChecksum(null, first), first), '0'.repeat(64));
});
