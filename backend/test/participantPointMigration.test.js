const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const migrateParticipantPoints = require('../src/scripts/migrate_participant_registered_points');

test('participant point migration resolves event scope before global fallback', () => {
  const eventId = new mongoose.Types.ObjectId();
  const globalPoint = { _id: new mongoose.Types.ObjectId(), name: 'Front Desk' };
  const eventPoint = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Front Desk',
    eventId,
    eventYear: '2027',
  };
  const lookup = migrateParticipantPoints.pointLookup([globalPoint, eventPoint]);

  assert.equal(
    migrateParticipantPoints.resolvePoint({
      registeredPoint: 'Front Desk',
      eventId,
      eventYear: '2027',
    }, lookup)._id,
    eventPoint._id
  );
  assert.equal(
    migrateParticipantPoints.resolvePoint({
      registeredPoint: 'Front Desk',
      eventYear: '2026',
    }, lookup)._id,
    globalPoint._id
  );
});

test('participant point migration rejects ambiguous scope mappings', () => {
  const eventId = new mongoose.Types.ObjectId();
  const lookup = migrateParticipantPoints.pointLookup([
    { _id: new mongoose.Types.ObjectId(), name: 'Desk', eventId },
    { _id: new mongoose.Types.ObjectId(), name: 'Desk', eventId },
  ]);
  assert.throws(
    () => migrateParticipantPoints.resolvePoint({
      registeredPoint: 'Desk',
      eventId,
    }, lookup),
    /Ambiguous/
  );
});

test('participant point migration rejects a point ID from another event', () => {
  const eventId = new mongoose.Types.ObjectId();
  const otherEventId = new mongoose.Types.ObjectId();
  const point = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Desk',
    eventId: otherEventId,
    eventYear: '2026',
  };
  const lookup = migrateParticipantPoints.pointLookup([point]);
  assert.throws(
    () => migrateParticipantPoints.resolvePoint({
      registeredPoint: String(point._id),
      eventId,
      eventYear: '2027',
    }, lookup),
    /different event/
  );
});
