const Participant = require('../models/participant');
const Donation = require('../models/Donation');
const GuestToken = require('../models/guestToken');
const Session = require('../models/session');
const LineOAuthState = require('../models/lineOAuthState');
const ParticipantAuthChallenge = require('../models/participantAuthChallenge');
const ParticipantSession = require('../models/participantSession');
const RegistrationReuseChallenge = require('../models/registrationReuseChallenge');
const ParticipantField = require('../models/participantField');
const RegistrationPoint = require('../models/registrationPoint');
const {
  donationSensitiveFields,
  participantSensitiveFields,
} = require('./fieldEncryption');
const { indexKeyMatches } = require('./mongoIndexMigration');

const ENCRYPTION_MARKER = 'aes-256-gcm';

let postureState = {
  required: false,
  checked: false,
  healthy: true,
};

function boolValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes'].includes(String(value).trim().toLowerCase());
}

function mongoSecurityPostureRequired(env = process.env) {
  const environment = String(env.DEPLOY_ENVIRONMENT || '').trim().toLowerCase();
  if (environment === 'production') return true;
  if (environment === 'staging') {
    return boolValue(env.MONGO_SECURITY_POSTURE_REQUIRED, false);
  }
  if (env.NODE_ENV === 'production') return true;
  return boolValue(env.MONGO_SECURITY_POSTURE_REQUIRED, false);
}

function plaintextValueFilter(path) {
  return {
    [path]: { $exists: true, $nin: [null, ''] },
    [`${path}.__enc`]: { $ne: ENCRYPTION_MARKER },
  };
}

function hasPlaintextFieldIndex(index, sensitiveFields) {
  const entries = Object.entries(index?.key || {});
  if (entries.length !== 1 || entries[0][1] !== 1) return false;
  const [path] = entries[0];
  return path.startsWith('fields.')
    && sensitiveFields.has(path.slice('fields.'.length));
}

function hasLegacyTokenIndex(index) {
  return indexKeyMatches(index, { token: 1 });
}

function hasCorrectTtlIndex(indexes) {
  return indexes.some((index) => (
    indexKeyMatches(index, { expiresAt: 1 })
    && Number(index.expireAfterSeconds) === 0
  ));
}

function evaluateMongoSecurityPosture({
  participantPlaintextDocuments = 0,
  donationPlaintextDocuments = 0,
  guestPlaintextTokens = 0,
  adminPlaintextTokens = 0,
  forbiddenPlaintextIndexes = 0,
  missingTtlIndexes = 0,
  requiredIndexChanges = 0,
} = {}) {
  const findings = {
    participantPlaintextDocuments,
    donationPlaintextDocuments,
    guestPlaintextTokens,
    adminPlaintextTokens,
    forbiddenPlaintextIndexes,
    missingTtlIndexes,
    requiredIndexChanges,
  };
  const healthy = Object.values(findings).every((value) => Number(value) === 0);
  return { healthy, findings };
}

async function criticalIndexPosture() {
  const sensitiveFields = new Set(participantSensitiveFields());
  const [
    participantIndexes,
    guestTokenIndexes,
    sessionIndexes,
    lineStateIndexes,
    authChallengeIndexes,
    participantSessionIndexes,
    reuseChallengeIndexes,
    participantDiff,
    participantFieldDiff,
    registrationPointDiff,
  ] = await Promise.all([
    Participant.collection.indexes(),
    GuestToken.collection.indexes(),
    Session.collection.indexes(),
    LineOAuthState.collection.indexes(),
    ParticipantAuthChallenge.collection.indexes(),
    ParticipantSession.collection.indexes(),
    RegistrationReuseChallenge.collection.indexes(),
    Participant.diffIndexes({ indexOptionsToCreate: true }),
    ParticipantField.diffIndexes({ indexOptionsToCreate: true }),
    RegistrationPoint.diffIndexes({ indexOptionsToCreate: true }),
  ]);

  const forbiddenPlaintextIndexes = participantIndexes
    .filter((index) => hasPlaintextFieldIndex(index, sensitiveFields)).length
    + guestTokenIndexes.filter(hasLegacyTokenIndex).length
    + sessionIndexes.filter(hasLegacyTokenIndex).length;
  const ttlIndexSets = [
    lineStateIndexes,
    authChallengeIndexes,
    participantSessionIndexes,
    reuseChallengeIndexes,
  ];
  const missingTtlIndexes = ttlIndexSets
    .filter((indexes) => !hasCorrectTtlIndex(indexes)).length;
  const requiredIndexChanges = [
    participantDiff,
    participantFieldDiff,
    registrationPointDiff,
  ].reduce((sum, diff) => sum + (diff.toCreate?.length || 0), 0);

  return {
    forbiddenPlaintextIndexes,
    missingTtlIndexes,
    requiredIndexChanges,
  };
}

async function inspectMongoSecurityPosture() {
  const participantPlaintextFilters = participantSensitiveFields()
    .map((field) => plaintextValueFilter(`fields.${field}`));
  participantPlaintextFilters.push(plaintextValueFilter('specialAssistance'));
  const donationPlaintextFilters = donationSensitiveFields()
    .map((field) => plaintextValueFilter(field));

  const [
    participantPlaintextDocuments,
    donationPlaintextDocuments,
    guestPlaintextTokens,
    adminPlaintextTokens,
    indexPosture,
  ] = await Promise.all([
    Participant.countDocuments({ $or: participantPlaintextFilters }),
    Donation.countDocuments({ $or: donationPlaintextFilters }),
    GuestToken.collection.countDocuments({ token: { $type: 'string', $ne: '' } }),
    Session.collection.countDocuments({ token: { $type: 'string', $ne: '' } }),
    criticalIndexPosture(),
  ]);

  return evaluateMongoSecurityPosture({
    participantPlaintextDocuments,
    donationPlaintextDocuments,
    guestPlaintextTokens,
    adminPlaintextTokens,
    ...indexPosture,
  });
}

async function assertMongoSecurityPosture() {
  const required = mongoSecurityPostureRequired();
  if (!required) {
    postureState = { required: false, checked: false, healthy: true };
    return postureState;
  }

  const result = await inspectMongoSecurityPosture();
  postureState = {
    required: true,
    checked: true,
    healthy: result.healthy,
  };
  if (!result.healthy) {
    const error = new Error('MongoDB security migration is incomplete');
    error.code = 'MONGO_SECURITY_POSTURE_INCOMPLETE';
    error.findings = result.findings;
    throw error;
  }
  return postureState;
}

function mongoSecurityPostureStatus() {
  return { ...postureState };
}

module.exports = {
  assertMongoSecurityPosture,
  evaluateMongoSecurityPosture,
  hasCorrectTtlIndex,
  hasLegacyTokenIndex,
  hasPlaintextFieldIndex,
  inspectMongoSecurityPosture,
  mongoSecurityPostureRequired,
  mongoSecurityPostureStatus,
  plaintextValueFilter,
};
