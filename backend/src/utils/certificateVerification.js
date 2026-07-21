const crypto = require('crypto');

const CERTIFICATE_VERIFICATION_PREFIX = 'cert_';
const CERTIFICATE_VERIFICATION_BYTES = 32;
const CERTIFICATE_VERIFICATION_PATTERN = /^cert_[A-Za-z0-9_-]{43}$/;

function generateCertificateVerificationId() {
  return `${CERTIFICATE_VERIFICATION_PREFIX}${crypto.randomBytes(CERTIFICATE_VERIFICATION_BYTES).toString('base64url')}`;
}

function normalizeCertificateVerificationId(value) {
  const normalized = String(value || '').trim();
  return CERTIFICATE_VERIFICATION_PATTERN.test(normalized) ? normalized : null;
}

function isCertificateVerificationId(value) {
  return Boolean(normalizeCertificateVerificationId(value));
}

module.exports = {
  CERTIFICATE_VERIFICATION_PATTERN,
  generateCertificateVerificationId,
  isCertificateVerificationId,
  normalizeCertificateVerificationId,
};
