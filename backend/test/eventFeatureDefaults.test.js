const test = require('node:test');
const assert = require('node:assert/strict');
const Event = require('../src/models/event');

test('event feature defaults include every toggle exposed by Event Settings', () => {
  assert.deepEqual(Event.defaultEnabledFeatures(), {
    registration: true,
    checkin: true,
    dashboard: true,
    publicReport: true,
    donations: false,
    packages: false,
    luckyDraw: false,
    certificate: false,
    wallet: false,
  });
});
