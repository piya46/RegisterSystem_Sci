const { google } = require('googleapis');
const {
  boolEnv,
  optionalCloudFeaturesEnabled,
  recordCloudUsage,
} = require('./cloudCostGuardrail');

function firestoreMirrorEnabled() {
  return optionalCloudFeaturesEnabled() && boolEnv('FIRESTORE_MIRROR_ENABLED', false);
}

function firestoreProjectId() {
  return process.env.FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || '';
}

function firestoreDatabaseId() {
  return process.env.FIRESTORE_DATABASE_ID || '(default)';
}

function sanitizePathSegment(value, label) {
  const segment = String(value || '').trim();
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(segment)) {
    throw new Error(`Invalid Firestore ${label}`);
  }
  return segment;
}

function collectionTarget(collectionPath) {
  const segments = String(collectionPath || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => sanitizePathSegment(segment, 'collection path segment'));
  if (segments.length === 0) throw new Error('Firestore collection path is required');

  const collectionId = segments[segments.length - 1];
  const parentPath = segments.slice(0, -1).join('/');
  return { collectionId, parentPath };
}

function firestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(firestoreValue) } };
  }
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, nestedValue]) => [key, firestoreValue(nestedValue)])
        ),
      },
    };
  }
  return { stringValue: String(value) };
}

function firestoreFields(payload) {
  return Object.fromEntries(
    Object.entries(payload || {})
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, firestoreValue(value)])
  );
}

async function createFirestoreDocument(collectionPath, documentId, payload) {
  if (!firestoreMirrorEnabled()) return { skipped: true, reason: 'disabled' };

  const projectId = firestoreProjectId();
  if (!projectId) return { skipped: true, reason: 'missing_project_id' };

  const guard = recordCloudUsage('firestoreWrites', 1, { optional: true });
  if (!guard.allowed) return { skipped: true, reason: guard.reason, guard };

  const { collectionId, parentPath } = collectionTarget(collectionPath);
  const docId = sanitizePathSegment(documentId, 'document id');
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/datastore'] });
  const firestore = google.firestore({ version: 'v1', auth });
  const parent = [
    `projects/${projectId}`,
    `databases/${firestoreDatabaseId()}`,
    'documents',
    parentPath,
  ].filter(Boolean).join('/');

  try {
    const result = await firestore.projects.databases.documents.createDocument({
      parent,
      collectionId,
      documentId: docId,
      requestBody: { fields: firestoreFields(payload) },
    });
    return { skipped: false, name: result.data?.name || null };
  } catch (err) {
    if (err.code === 409 || err.status === 409) {
      return { skipped: true, reason: 'already_exists' };
    }
    throw err;
  }
}

function paymentStatusPayload(transaction, vendor = null) {
  const ttlHours = Math.min(Math.max(Number(process.env.FIRESTORE_PAYMENT_STATUS_TTL_HOURS || 24) || 24, 1), 72);
  const serverTime = transaction.serverTime || transaction.createdAt || new Date();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  return {
    transactionId: String(transaction._id),
    vendorId: String(transaction.vendorId?._id || transaction.vendorId || vendor?._id || ''),
    amount: transaction.amount,
    status: transaction.status,
    paymentMethod: transaction.paymentMethod,
    menuItemId: transaction.menuItemId || '',
    menuItemName: transaction.menuItemName || '',
    eventId: transaction.eventId ? String(transaction.eventId) : '',
    eventYear: transaction.eventYear || '',
    verificationCode: transaction.verificationCode || '',
    slipExpiresAt: transaction.slipExpiresAt || null,
    dailyThemeCode: transaction.dailyThemeCode || '',
    serverTime,
    expiresAt,
  };
}

async function mirrorPaymentStatus(transaction, vendor = null) {
  const collectionPath = process.env.FIRESTORE_PAYMENT_STATUS_COLLECTION || 'paymentStatus';
  return createFirestoreDocument(
    collectionPath,
    String(transaction._id),
    paymentStatusPayload(transaction, vendor)
  );
}

module.exports = {
  createFirestoreDocument,
  firestoreMirrorEnabled,
  mirrorPaymentStatus,
  paymentStatusPayload,
};
