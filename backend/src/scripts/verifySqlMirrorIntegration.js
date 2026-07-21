require('dotenv').config();

const { closeSQL, connectSQL, withSqlTransaction } = require('../config/sql');
const { createReportingMirrorRepository } = require('../sql/reportingMirrorRepository');
const {
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
} = require('../sql/reportingMirrorMapper');

const ROLLBACK_CODE = 'SQL_MIRROR_VERIFY_ROLLBACK';
const TABLES = [
  'organizations',
  'event_series',
  'events',
  'participants_core',
  'wallets',
  'vendors',
  'wallet_transactions',
  'receipts',
  'donation_summaries',
  'packages',
];

function assertSafeTestTarget() {
  if (process.env.SQL_INTEGRATION_TEST !== 'true') {
    throw new Error('SQL_INTEGRATION_TEST=true is required');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SQL mirror integration verification cannot run in production');
  }
  if (!/(^|_)test($|_)/i.test(process.env.SQL_DATABASE || '')) {
    throw new Error('SQL integration verification requires a database name containing test');
  }
}

async function counts(repository) {
  return Object.fromEntries(
    await Promise.all(TABLES.map(async (table) => [table, await repository.countRows(table)]))
  );
}

function fixtures() {
  const now = new Date('2026-07-17T00:00:00.000Z');
  const ids = {
    organization: '65a000000000000000000001',
    series: '65a000000000000000000002',
    event: '65a000000000000000000003',
    participant: '65a000000000000000000004',
    wallet: '65a000000000000000000005',
    vendor: '65a000000000000000000006',
    transaction: '65a000000000000000000007',
    receipt: '65a000000000000000000008',
    donation: '65a000000000000000000009',
    package: '65a00000000000000000000a',
  };
  return {
    organization: mapOrganization({ _id: ids.organization, name: 'SQL Verify', slug: 'sql-verify', createdAt: now, updatedAt: now }),
    series: mapEventSeries({
      _id: ids.series,
      organizationId: ids.organization,
      name: 'SQL Verify Series',
      slug: 'sql-verify-series',
      createdAt: now,
      updatedAt: now,
    }),
    event: mapEvent({
      _id: ids.event,
      organizationId: ids.organization,
      seriesId: ids.series,
      name: 'SQL Verify Event',
      slug: 'sql-verify-event',
      eventYear: '2026',
      createdAt: now,
      updatedAt: now,
    }),
    participant: mapParticipant({
      _id: ids.participant,
      organizationId: ids.organization,
      seriesId: ids.series,
      eventId: ids.event,
      eventYear: '2026',
      qrCode: 'SQL-VERIFY-QR',
      secureIndex: { email: 'a'.repeat(64) },
      registeredAt: now,
      updatedAt: now,
    }),
    wallet: mapWallet({
      _id: ids.wallet,
      participantId: ids.participant,
      eventId: ids.event,
      eventYear: '2026',
      coinBalance: 100,
      coupons: [{ couponId: 'meal', name: 'Meal', quantity: 2 }],
      createdAt: now,
      updatedAt: now,
    }),
    vendor: mapVendor({
      _id: ids.vendor,
      eventId: ids.event,
      eventYear: '2026',
      name: 'SQL Verify Vendor',
      qrCodeId: 'SQL-VERIFY-VENDOR',
      pricingMode: 'menu',
      menuItems: [{ itemId: 'meal-1', name: 'Meal', price: 10 }],
      createdAt: now,
      updatedAt: now,
    }),
    transaction: mapTransaction({
      _id: ids.transaction,
      walletId: ids.wallet,
      vendorId: ids.vendor,
      eventId: ids.event,
      type: 'payment',
      idempotencyKey: 'sql-verify-idempotency',
      paymentMethod: 'coins',
      amount: 10,
      status: 'success',
      balanceBefore: 100,
      balanceAfter: 90,
      serverTime: now,
      createdAt: now,
      updatedAt: now,
    }),
    receipt: mapReceipt({
      _id: ids.receipt,
      participantId: ids.participant,
      eventId: ids.event,
      receiptNumber: 'SQL-VERIFY-RECEIPT',
      amount: 100,
      details: { verification: true },
      issuedAt: now,
    }),
    donation: mapDonation({
      _id: ids.donation,
      organizationId: ids.organization,
      seriesId: ids.series,
      eventId: ids.event,
      eventYear: '2026',
      firstName: 'Must not be mirrored',
      amount: 100,
      transferDateTime: now,
      createdAt: now,
    }),
    package: mapPackage({
      _id: ids.package,
      organizationId: ids.organization,
      seriesId: ids.series,
      eventId: ids.event,
      eventYear: '2026',
      name: 'SQL Verify Package',
      price: 100,
      items: [{ itemName: 'Shirt', sizes: [{ size: 'M', stock: 10, sold: 1 }] }],
      createdAt: now,
    }),
  };
}

async function verify() {
  assertSafeTestTarget();
  await connectSQL();
  const baselineRepository = createReportingMirrorRepository();
  const before = await counts(baselineRepository);
  let inside = null;

  try {
    await withSqlTransaction(async (transaction) => {
      const repository = createReportingMirrorRepository({ transaction });
      const data = fixtures();
      await repository.upsertOrganization(data.organization);
      await repository.upsertEventSeries(data.series);
      await repository.upsertEvent(data.event);
      await repository.upsertParticipant(data.participant);
      await repository.upsertWallet(data.wallet);
      await repository.upsertVendor(data.vendor);
      await repository.upsertTransaction(data.transaction);
      await repository.upsertReceipt(data.receipt);
      await repository.upsertDonation(data.donation);
      await repository.upsertPackage(data.package);
      inside = await counts(repository);

      const rollback = new Error('Rollback SQL mirror integration fixtures');
      rollback.code = ROLLBACK_CODE;
      throw rollback;
    });
  } catch (error) {
    if (error.code !== ROLLBACK_CODE) throw error;
  }

  const after = await counts(createReportingMirrorRepository());
  for (const table of TABLES) {
    if (inside[table] !== before[table] + 1) throw new Error(`Integration insert count failed for ${table}`);
    if (after[table] !== before[table]) throw new Error(`Integration rollback failed for ${table}`);
  }
  return { verifiedTables: TABLES.length, rolledBack: true };
}

async function main() {
  try {
    const result = await verify();
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await closeSQL().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`SQL mirror integration verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { verify };
