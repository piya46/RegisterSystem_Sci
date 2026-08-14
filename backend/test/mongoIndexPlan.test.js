const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyIndexChanges,
  summarize,
} = require('../src/scripts/migrateMongoIndexes');

test('MongoDB index plan summary separates creates from report-only drops', () => {
  assert.deepEqual(summarize([
    { model: 'A', creates: [{ key: { name: 1 } }], reconfigureTtl: [], replacements: [], reportOnlyDrops: [] },
    { model: 'B', creates: [], reconfigureTtl: [], replacements: [], reportOnlyDrops: ['legacy_1'] },
    { model: 'C', creates: [], reconfigureTtl: [], replacements: [], reportOnlyDrops: [] },
  ]), {
    models: 3,
    modelsWithChanges: 2,
    indexesToCreate: 1,
    ttlIndexesToReconfigure: 0,
    indexesRequiringReplacement: 0,
    reportOnlyDrops: 1,
  });
});

test('MongoDB index plan converts an existing plain date index to TTL without dropping it', () => {
  assert.deepEqual(classifyIndexChanges({
    actualIndexes: [{ name: 'expiresAt_1', key: { expiresAt: 1 } }],
    diff: {
      toCreate: [[{ expiresAt: 1 }, { expireAfterSeconds: 0, background: true }]],
      toDrop: ['expiresAt_1'],
    },
  }), {
    creates: [],
    reconfigureTtl: [{ name: 'expiresAt_1', expireAfterSeconds: 0 }],
    replacements: [],
    reportOnlyDrops: [],
  });
});

test('MongoDB index plan blocks partial-index replacement from generic apply', () => {
  const plan = classifyIndexChanges({
    actualIndexes: [{ name: 'name_1', key: { name: 1 }, unique: true }],
    diff: {
      toCreate: [[{ name: 1 }, {
        unique: true,
        partialFilterExpression: { eventId: null },
      }]],
      toDrop: ['name_1'],
    },
  });
  assert.equal(plan.replacements.length, 1);
  assert.deepEqual(plan.reportOnlyDrops, []);
});
