const test = require('node:test');
const assert = require('node:assert/strict');
const Participant = require('../src/models/participant');
const {
  generateCertificateVerificationId,
  isCertificateVerificationId,
  normalizeCertificateVerificationId,
} = require('../src/utils/certificateVerification');

test('certificate verification IDs are opaque 256-bit values with a recognizable prefix', () => {
  const values = new Set(Array.from({ length: 100 }, generateCertificateVerificationId));
  assert.equal(values.size, 100);
  for (const value of values) {
    assert.match(value, /^cert_[A-Za-z0-9_-]{43}$/);
    assert.equal(isCertificateVerificationId(value), true);
  }
});

test('raw Mongo IDs and malformed certificate values are rejected', () => {
  assert.equal(normalizeCertificateVerificationId('507f1f77bcf86cd799439011'), null);
  assert.equal(normalizeCertificateVerificationId('cert_short'), null);
  assert.equal(normalizeCertificateVerificationId('../certificate'), null);
});

test('new participants receive a certificate verification ID without exposing a sequence', () => {
  const participant = new Participant({ qrCode: 'test-certificate-default' });
  assert.equal(isCertificateVerificationId(participant.certificateVerificationId), true);
  assert.ok(participant.certificateVerificationIssuedAt instanceof Date);
});
