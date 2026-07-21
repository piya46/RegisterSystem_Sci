const test = require('node:test');
const assert = require('node:assert/strict');
const {
  broadDeleteRuleTouchesManagedRoot,
  managedLifecycleRules,
} = require('../src/scripts/configureGcsBucket');

const ORIGINAL_PREFIX = process.env.GCS_OBJECT_PREFIX;

test.afterEach(() => {
  if (ORIGINAL_PREFIX === undefined) delete process.env.GCS_OBJECT_PREFIX;
  else process.env.GCS_OBJECT_PREFIX = ORIGINAL_PREFIX;
});

test('bucket configurator replaces only its slip rule and rejects other overlapping deletes', () => {
  process.env.GCS_OBJECT_PREFIX = 'psevent/production';
  const [managedSlipRule] = managedLifecycleRules();
  const eventMediaRule = {
    action: { type: 'Delete' },
    condition: { age: 30, matchesPrefix: ['psevent/production/event_media/'] },
  };
  const projectWideRule = {
    action: { type: 'Delete' },
    condition: { age: 30, matchesPrefix: ['psevent/'] },
  };

  assert.equal(broadDeleteRuleTouchesManagedRoot(managedSlipRule), false);
  assert.equal(broadDeleteRuleTouchesManagedRoot(eventMediaRule), true);
  assert.equal(broadDeleteRuleTouchesManagedRoot(projectWideRule), true);
});
