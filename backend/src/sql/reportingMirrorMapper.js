const crypto = require('crypto');

const REPORTING_MIRROR_MAPPER_VERSION = '2026-07-22-v2';
const BLIND_INDEX_PATTERN = /^[a-f0-9]{64}$/;

function objectId(value) {
  if (!value) return null;
  const normalized = String(value);
  if (!/^[a-f0-9]{24}$/i.test(normalized)) throw new Error(`Invalid MongoDB ObjectId: ${normalized}`);
  return normalized;
}

function dateValue(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date in SQL mirror source record');
  return date;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return number;
}

function integer(value, fallback = 0) {
  const number = finiteNumber(value, fallback);
  if (!Number.isSafeInteger(number)) throw new Error('Unsafe integer in SQL mirror source record');
  return number;
}

function canonicalize(value) {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function sourceHash(value) {
  return sha256(canonicalJson(value));
}

function protectedMirrorValue(label, value) {
  if (!value) return null;
  const secret = String(process.env.SQL_MIRROR_IDENTITY_HASH_SECRET || '');
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    const error = new Error('SQL_MIRROR_IDENTITY_HASH_SECRET must be at least 32 bytes before mapping protected values');
    error.code = 'SQL_MIRROR_PROTECTION_KEY_MISSING';
    throw error;
  }
  return crypto.createHmac('sha256', secret).update(`${label}:${String(value)}`).digest('hex');
}

function identityBlindIndex(label, value) {
  return protectedMirrorValue(`identity:${label}`, value);
}

function validatedBlindIndex(label, value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!BLIND_INDEX_PATTERN.test(normalized)) {
    const error = new Error(`SQL mirror ${label} must be a protected 64-character blind index`);
    error.code = 'SQL_MIRROR_UNPROTECTED_INDEX';
    throw error;
  }
  return normalized;
}

function mapped(row, refs = {}, children = {}) {
  return {
    row: { ...row, source_hash: sourceHash({ row, refs, children }) },
    refs,
    children,
  };
}

function mapOrganization(document) {
  const row = {
    mongo_id: objectId(document._id),
    name: String(document.name || '').trim(),
    slug: String(document.slug || '').trim(),
    status: String(document.status || 'active'),
    security_policy_json: canonicalJson(document.securityPolicy || {}),
    source_created_at: dateValue(document.createdAt),
    source_updated_at: dateValue(document.updatedAt),
  };
  return mapped(row);
}

function mapEventSeries(document) {
  const refs = { organizationMongoId: objectId(document.organizationId) };
  const row = {
    mongo_id: objectId(document._id),
    name: String(document.name || '').trim(),
    slug: String(document.slug || '').trim(),
    status: String(document.status || 'active'),
    default_linking_mode: String(document.defaultLinkingMode || 'series-linked'),
    source_created_at: dateValue(document.createdAt),
    source_updated_at: dateValue(document.updatedAt),
  };
  return mapped(row, refs);
}

function mapEvent(document) {
  const refs = {
    organizationMongoId: objectId(document.organizationId),
    seriesMongoId: objectId(document.seriesId),
  };
  const row = {
    mongo_id: objectId(document._id),
    name: String(document.name || '').trim(),
    slug: String(document.slug || '').trim(),
    event_year: String(document.eventYear || '').trim(),
    status: String(document.status || 'draft'),
    starts_at: dateValue(document.startsAt),
    ends_at: dateValue(document.endsAt),
    timezone: String(document.timezone || 'Asia/Bangkok'),
    linking_mode: String(document.linkingMode || 'series-linked'),
    archived_at: dateValue(document.archivedAt),
    activated_at: dateValue(document.activatedAt),
    source_created_at: dateValue(document.createdAt),
    source_updated_at: dateValue(document.updatedAt),
  };
  return mapped(row, refs);
}

function mapParticipant(document) {
  const refs = {
    organizationMongoId: objectId(document.organizationId),
    seriesMongoId: objectId(document.seriesId),
    eventMongoId: objectId(document.eventId),
  };
  const secureIndex = document.secureIndex || {};
  const row = {
    mongo_id: objectId(document._id),
    event_year: String(document.eventYear || ''),
    qr_code: protectedMirrorValue('participant:qrCode', document.qrCode) || '',
    status: String(document.status || 'registered'),
    registration_type: String(document.registrationType || 'online'),
    registered_point_name: String(document.registeredPointName || document.registeredPoint || ''),
    followers: integer(document.followers, 0),
    consent_status: document.consent || null,
    email_blind_index: validatedBlindIndex('participant email', secureIndex.email),
    phone_blind_index: validatedBlindIndex('participant phone', secureIndex.phone),
    name_blind_index: validatedBlindIndex(
      'participant name',
      secureIndex.name || secureIndex.fullName || secureIndex.fullname
    ),
    line_user_blind_index: identityBlindIndex('lineUserId', document.lineUserId),
    is_line_linked: Boolean(document.isLineLinked),
    is_deleted: Boolean(document.isDeleted),
    is_revoked: Boolean(document.isRevoked),
    registered_at: dateValue(document.registeredAt || document.createdAt),
    checked_in_at: dateValue(document.checkedInAt),
    source_updated_at: dateValue(document.updatedAt),
  };
  return mapped(row, refs);
}

function mapWallet(document) {
  const eventMongoId = objectId(document.eventId);
  const eventYear = String(document.eventYear || '');
  const refs = {
    participantMongoId: objectId(document.participantId),
    eventMongoId,
  };
  const children = {
    coupons: (document.coupons || []).map((coupon) => ({
      coupon_id: String(coupon.couponId || ''),
      name: String(coupon.name || ''),
      quantity: integer(coupon.quantity, 0),
    })),
  };
  const row = {
    mongo_id: objectId(document._id),
    event_year: eventYear,
    event_scope_key: eventMongoId ? `event:${eventMongoId}` : `year:${eventYear || 'legacy'}`,
    coin_balance: integer(document.coinBalance, 0),
    is_active: document.isActive !== false,
    source_created_at: dateValue(document.createdAt),
    source_updated_at: dateValue(document.updatedAt),
  };
  return mapped(row, refs, children);
}

function mapVendor(document) {
  const refs = { eventMongoId: objectId(document.eventId) };
  const children = {
    menuItems: (document.menuItems || []).map((item, sourceIndex) => ({
      source_index: sourceIndex,
      item_id: String(item.itemId || ''),
      name: String(item.name || ''),
      price: integer(item.price, 0),
      is_active: item.isActive !== false,
    })),
  };
  const row = {
    mongo_id: objectId(document._id),
    event_year: String(document.eventYear || ''),
    name: String(document.name || '').trim(),
    qr_code_id: protectedMirrorValue('vendor:qrCodeId', String(document.qrCodeId || '').trim()) || '',
    pricing_mode: String(document.pricingMode || 'variable'),
    fixed_price: document.fixedPrice === null || document.fixedPrice === undefined ? null : integer(document.fixedPrice),
    min_amount: integer(document.minAmount, 1),
    max_amount: document.maxAmount === null || document.maxAmount === undefined ? null : integer(document.maxAmount),
    is_active: document.isActive !== false,
    source_created_at: dateValue(document.createdAt),
    source_updated_at: dateValue(document.updatedAt),
  };
  return mapped(row, refs, children);
}

function mapTransaction(document) {
  const refs = {
    walletMongoId: objectId(document.walletId),
    vendorMongoId: objectId(document.vendorId),
    eventMongoId: objectId(document.eventId),
    reversalOfMongoId: objectId(document.reversalOf),
  };
  const row = {
    mongo_id: objectId(document._id),
    guest_token_mongo_id: objectId(document.guestTokenId),
    reversal_of_mongo_id: refs.reversalOfMongoId,
    transaction_type: String(document.type || 'payment'),
    idempotency_key: protectedMirrorValue('transaction:idempotencyKey', document.idempotencyKey),
    payment_method: String(document.paymentMethod || 'coins'),
    amount: integer(document.amount),
    coupon_id: document.couponId ? String(document.couponId) : null,
    menu_item_id: document.menuItemId ? String(document.menuItemId) : null,
    menu_item_name: String(document.menuItemName || ''),
    status: String(document.status || 'success'),
    balance_before: document.balanceBefore === null || document.balanceBefore === undefined ? null : integer(document.balanceBefore),
    balance_after: document.balanceAfter === null || document.balanceAfter === undefined ? null : integer(document.balanceAfter),
    item_balance_before: document.itemBalanceBefore === null || document.itemBalanceBefore === undefined ? null : integer(document.itemBalanceBefore),
    item_balance_after: document.itemBalanceAfter === null || document.itemBalanceAfter === undefined ? null : integer(document.itemBalanceAfter),
    verification_code: protectedMirrorValue('transaction:verificationCode', document.verificationCode) || '',
    server_time: dateValue(document.serverTime || document.createdAt),
    slip_expires_at: dateValue(document.slipExpiresAt),
    source_created_at: dateValue(document.createdAt),
    source_updated_at: dateValue(document.updatedAt),
  };
  return mapped(row, refs);
}

function mapReceipt(document) {
  const refs = {
    participantMongoId: objectId(document.participantId),
    eventMongoId: objectId(document.eventId),
  };
  const row = {
    mongo_id: objectId(document._id),
    receipt_number: protectedMirrorValue('receipt:receiptNumber', document.receiptNumber) || '',
    amount: finiteNumber(document.amount),
    details_hash: document.details ? sourceHash(document.details) : null,
    issued_at: dateValue(document.issuedAt),
  };
  return mapped(row, refs);
}

function mapDonation(document) {
  const refs = {
    organizationMongoId: objectId(document.organizationId),
    seriesMongoId: objectId(document.seriesId),
    eventMongoId: objectId(document.eventId),
  };
  const row = {
    mongo_id: objectId(document._id),
    event_year: String(document.eventYear || ''),
    amount: finiteNumber(document.amount),
    transfer_at: dateValue(document.transferDateTime),
    source: String(document.source || 'PRE_REGISTER'),
    is_package: Boolean(document.isPackage),
    package_type: String(document.packageType || ''),
    pickup_method: String(document.pickupMethod || ''),
    is_deleted: Boolean(document.isDeleted),
    source_created_at: dateValue(document.createdAt),
  };
  return mapped(row, refs);
}

function mapPackage(document) {
  const refs = {
    organizationMongoId: objectId(document.organizationId),
    seriesMongoId: objectId(document.seriesId),
    eventMongoId: objectId(document.eventId),
  };
  const children = {
    items: (document.items || []).map((item, sourceIndex) => ({
      source_index: sourceIndex,
      item_name: String(item.itemName || ''),
      variants: (item.sizes || []).map((variant, variantIndex) => ({
        source_index: variantIndex,
        size_label: String(variant.size || ''),
        stock: integer(variant.stock, 0),
        sold: integer(variant.sold, 0),
      })),
    })),
  };
  const row = {
    mongo_id: objectId(document._id),
    event_year: String(document.eventYear || ''),
    name: String(document.name || ''),
    description: document.description ? String(document.description) : null,
    price: finiteNumber(document.price),
    order_deadline: dateValue(document.orderDeadline),
    is_delivery_available: document.isDeliveryAvailable !== false,
    is_active: document.isActive !== false,
    deleted_at: dateValue(document.deletedAt),
    source_created_at: dateValue(document.createdAt),
  };
  return mapped(row, refs, children);
}

module.exports = {
  REPORTING_MIRROR_MAPPER_VERSION,
  canonicalJson,
  mapDonation,
  mapEvent,
  mapEventSeries,
  mapOrganization,
  mapPackage,
  mapParticipant,
  mapReceipt,
  mapTransaction,
  mapVendor,
  mapWallet,
  sourceHash,
};
