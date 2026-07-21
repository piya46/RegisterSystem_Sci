function participantRegistrationResponse(participant) {
  const value = typeof participant?.toObject === 'function'
    ? participant.toObject()
    : participant || {};

  return {
    code: String(value.qrCode || ''),
    status: value.status || 'registered',
    eventYear: String(value.eventYear || ''),
    registeredAt: value.registeredAt || value.createdAt || null,
  };
}

function participantOperationalResponse(participant) {
  const value = typeof participant?.toObject === 'function'
    ? participant.toObject()
    : { ...(participant || {}) };
  for (const field of [
    'secureIndex',
    'secureSearch',
    'registrationIdempotencyKeyHash',
    'registrationIdempotencyFingerprint',
    'certificateVerificationId',
    'certificateVerificationIssuedAt',
    'participantTokenVersion',
    'trustedDevices',
    'lineUserId',
  ]) {
    delete value[field];
  }
  return value;
}

module.exports = {
  participantOperationalResponse,
  participantRegistrationResponse,
};
