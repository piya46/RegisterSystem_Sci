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

test('SQL mirror aggregate checksum is order-independent and resumable', () => {
  const first = '1'.repeat(64);
  const second = '2'.repeat(64);
  assert.equal(xorChecksum(xorChecksum(null, first), second), xorChecksum(xorChecksum(null, second), first));
  assert.equal(xorChecksum(xorChecksum(null, first), first), '0'.repeat(64));
});
