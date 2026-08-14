const test = require('node:test');
const assert = require('node:assert/strict');
const {
  donationBackfillReasons,
  participantBackfillReasons,
} = require('../src/scripts/backfillPrivacyAndEventYear');

const protectedValue = {
  __enc: 'aes-256-gcm',
  kid: 'v1',
  iv: 'aXY=',
  tag: 'dGFn',
  data: 'ZGF0YQ==',
};

test('privacy backfill updates only missing or unprotected participant data', () => {
  const protectedParticipant = {
    eventYear: '2027',
    fields: {
      name: protectedValue,
      email: protectedValue,
      dept: protectedValue,
      date_year: protectedValue,
    },
    secureIndex: {
      name: 'a'.repeat(64),
      email: 'b'.repeat(64),
    },
    secureSearch: ['c'.repeat(64)],
    specialAssistance: protectedValue,
  };
  const ready = participantBackfillReasons(protectedParticipant);
  assert.equal(ready.missingEventYear, false);
  assert.equal(ready.needsSecurityBackfill, false);

  const legacy = participantBackfillReasons({
    eventYear: '',
    fields: { name: 'Legacy User', email: 'legacy@example.test', dept: 'Science' },
    secureIndex: {},
    secureSearch: [],
    specialAssistance: 'wheelchair',
  });
  assert.equal(legacy.missingEventYear, true);
  assert.deepEqual(
    legacy.plaintextSensitiveFields.sort(),
    ['dept', 'email', 'name'].sort()
  );
  assert.equal(legacy.plaintextSpecialAssistance, true);
  assert.deepEqual(legacy.missingBlindIndexes.sort(), ['email', 'name']);
  assert.equal(legacy.missingSearchIndex, true);
});

test('privacy backfill classifies department and class year as encrypted quasi-identifiers', () => {
  const reasons = participantBackfillReasons({
    eventYear: '2027',
    fields: { dept: 'Science', date_year: '2520' },
    secureIndex: {},
    secureSearch: [],
    specialAssistance: '',
  });
  assert.deepEqual(reasons.plaintextSensitiveFields.sort(), ['date_year', 'dept']);
  assert.equal(reasons.needsSecurityBackfill, true);
});

test('privacy backfill identifies only plaintext donation fields', () => {
  const reasons = donationBackfillReasons({
    eventYear: '',
    firstName: 'Legacy',
    lastName: protectedValue,
    address: '',
    slipUrl: protectedValue,
  });
  assert.equal(reasons.missingEventYear, true);
  assert.deepEqual(reasons.plaintextSensitiveFields, ['firstName']);
  assert.equal(reasons.needsSecurityBackfill, true);
});
