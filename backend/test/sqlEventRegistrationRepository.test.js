const test = require('node:test');
const assert = require('node:assert/strict');

const repository = require('../src/sql/eventRegistrationRepository');

test('event registration SQL repository exposes the runtime cutover surface', () => {
  for (const name of [
    'checkinParticipantByQr',
    'createParticipant',
    'findParticipantByQr',
    'listParticipantFields',
    'listParticipants',
    'listRegistrationPoints',
  ]) {
    assert.equal(typeof repository[name], 'function', `${name} should be exported`);
  }
});

test('event registration SQL primary flag requires an event context', () => {
  const previous = process.env.SQL_EVENT_REGISTRATION_PRIMARY;
  process.env.SQL_EVENT_REGISTRATION_PRIMARY = 'true';
  try {
    assert.equal(repository.sqlEventRegistrationPrimaryEnabled({}), false);
    assert.equal(
      repository.sqlEventRegistrationPrimaryEnabled({ eventId: '6a3f90702a898b13ea8b4d11' }),
      true
    );
  } finally {
    if (previous === undefined) delete process.env.SQL_EVENT_REGISTRATION_PRIMARY;
    else process.env.SQL_EVENT_REGISTRATION_PRIMARY = previous;
  }
});
