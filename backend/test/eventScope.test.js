const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertEventMatchesRequestedIdentity,
  assertEventRegistrationOpen,
  eventScopeFromRequest,
  getEventContextFromRequest,
  requestedEventIdentity,
} = require('../src/utils/eventYear');

function request({ params = {}, query = {}, body = {} } = {}) {
  return { params, query, body };
}

test('event identity rejects conflicting values from route, query, and body', () => {
  assert.throws(
    () => requestedEventIdentity(request({ params: { eventId: 'event-a' }, body: { eventId: 'event-b' } })),
    (error) => error.statusCode === 400
  );
  assert.throws(
    () => requestedEventIdentity(request({ params: { slug: 'event-a' }, query: { eventSlug: 'event-b' } })),
    (error) => error.statusCode === 400
  );
});

test('resolved event must match requested slug and year', () => {
  const event = { _id: 'event-a', slug: 'annual-event', eventYear: '2570' };
  assert.doesNotThrow(() => assertEventMatchesRequestedIdentity(event, {
    eventId: 'event-a',
    eventSlug: 'annual-event',
    eventYear: '2570',
  }));
  assert.throws(
    () => assertEventMatchesRequestedIdentity(event, { eventSlug: 'another-event' }),
    (error) => error.statusCode === 400
  );
  assert.throws(
    () => assertEventMatchesRequestedIdentity(event, { eventYear: '2569' }),
    (error) => error.statusCode === 400
  );
});

test('event-scoped public operations do not silently fall back to the current event', async () => {
  await assert.rejects(
    getEventContextFromRequest(request(), { requireEventIdentity: true }),
    (error) => error.statusCode === 400
  );
  await assert.rejects(
    eventScopeFromRequest(request({ body: { eventYear: '2570' } }), {}, { requireEventIdentity: true }),
    (error) => error.statusCode === 400
  );

  const legacyYearScope = await eventScopeFromRequest(request({ query: { eventYear: '2570' } }));
  assert.deepEqual(legacyYearScope.filter, { eventYear: '2570' });
  assert.equal(legacyYearScope.eventId, null);
});

test('registration policy rejects closed windows while allowing an open event', () => {
  const now = new Date('2026-07-17T12:00:00.000Z');
  assert.doesNotThrow(() => assertEventRegistrationOpen({
    status: 'registration_open',
    config: {
      enabledFeatures: { registration: true },
      preRegStartDate: '2026-07-17T11:00:00.000Z',
      preRegEndDate: '2026-07-17T13:00:00.000Z',
    },
  }, now));
  assert.throws(
    () => assertEventRegistrationOpen({ status: 'registration_closed', config: {} }, now),
    (error) => error.statusCode === 403
  );
  assert.throws(
    () => assertEventRegistrationOpen({
      status: 'registration_open',
      config: { maintenanceMode: true },
    }, now),
    (error) => error.statusCode === 403
  );
  assert.throws(
    () => assertEventRegistrationOpen({
      status: 'registration_open',
      config: { preRegEndDate: '2026-07-17T11:59:59.000Z' },
    }, now),
    (error) => error.statusCode === 403
  );
});
