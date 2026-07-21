const test = require('node:test');
const assert = require('node:assert/strict');
const { publicEventPayload } = require('../src/controllers/eventController');

function sampleEvent(overrides = {}) {
  return {
    _id: 'internal-event-id',
    organizationId: 'internal-organization-id',
    seriesId: 'internal-series-id',
    name: 'Public Event',
    slug: 'public-event',
    eventYear: '2027',
    status: 'registration_open',
    timezone: 'Asia/Bangkok',
    branding: {},
    publicLinks: { reportPath: 'javascript:alert(1)' },
    config: {
      enabledFeatures: { registration: true, donations: false },
      bankAccountName: 'Private while donations are disabled',
      bankAccountNumber: '0000000000',
      paymentQrUrl: 'https://example.com/payment.png',
    },
    layouts: {
      landingPage: {
        version: 3,
        updatedBy: 'internal-admin-id',
        updatedAt: new Date(),
        config: {
          blocks: [
            { id: 'hero', type: 'hero', title: 'Welcome', enabled: true },
            { id: 'register', type: 'cta', buttonUrl: '/e/stale-slug/register', enabled: true },
          ],
        },
      },
    },
    ...overrides,
  };
}

test('public Event payload omits internal IDs, editor metadata, and disabled payment details', () => {
  const payload = publicEventPayload(sampleEvent());

  assert.equal(payload._id, undefined);
  assert.equal(payload.organizationId, undefined);
  assert.equal(payload.seriesId, undefined);
  assert.equal(payload.layouts.landingPage.updatedBy, undefined);
  assert.equal(payload.layouts.landingPage.updatedAt, undefined);
  assert.equal(payload.layouts.landingPage.version, 3);
  assert.equal(payload.layouts.landingPage.config.blocks[0].title, 'Welcome');
  assert.equal(payload.layouts.landingPage.config.blocks[1].buttonUrl, '/e/public-event/register');
  assert.equal(payload.config.bankAccountName, undefined);
  assert.equal(payload.config.bankAccountNumber, undefined);
  assert.equal(payload.config.paymentQrUrl, undefined);
  assert.equal(payload.publicLinks.reportPath, '/e/public-event/report');
});

test('public Event payload includes payment instructions only when donations are enabled', () => {
  const event = sampleEvent();
  event.config.enabledFeatures.donations = true;
  const payload = publicEventPayload(event);

  assert.equal(payload.config.bankAccountNumber, '0000000000');
  assert.equal(payload.config.paymentQrUrl, 'https://example.com/payment.png');
});
