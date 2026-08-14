const test = require('node:test');
const assert = require('node:assert/strict');
const {
  indexKeyMatches,
  isLegacyFullUniqueNameIndex,
} = require('../src/utils/mongoIndexMigration');

test('legacy name index detection never matches the replacement partial index', () => {
  assert.equal(isLegacyFullUniqueNameIndex({
    name: 'name_1',
    key: { name: 1 },
    unique: true,
  }), true);
  assert.equal(isLegacyFullUniqueNameIndex({
    name: 'name_1',
    key: { name: 1 },
    unique: true,
    partialFilterExpression: { eventId: null },
  }), false);
  assert.equal(isLegacyFullUniqueNameIndex({
    name: 'name_1',
    key: { eventId: 1, name: 1 },
    unique: true,
  }), false);
});

test('index key comparison preserves compound key order', () => {
  assert.equal(indexKeyMatches({ key: { eventId: 1, name: 1 } }, { eventId: 1, name: 1 }), true);
  assert.equal(indexKeyMatches({ key: { name: 1, eventId: 1 } }, { eventId: 1, name: 1 }), false);
});
