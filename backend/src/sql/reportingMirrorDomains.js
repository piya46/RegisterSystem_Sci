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
} = require('./reportingMirrorMapper');

const DOMAIN_ORDER = Object.freeze([
  'organizations',
  'event_series',
  'events',
  'participants',
  'wallets',
  'vendors',
  'transactions',
  'receipts',
  'donations',
  'packages',
]);

let cachedDefinitions = null;

function domainDefinitions() {
  if (cachedDefinitions) return cachedDefinitions;
  cachedDefinitions = Object.freeze({
    organizations: Object.freeze({
      model: require('../models/organization'),
      mapper: mapOrganization,
      upsert: 'upsertOrganization',
      table: 'organizations',
    }),
    event_series: Object.freeze({
      model: require('../models/eventSeries'),
      mapper: mapEventSeries,
      upsert: 'upsertEventSeries',
      table: 'event_series',
    }),
    events: Object.freeze({
      model: require('../models/event'),
      mapper: mapEvent,
      upsert: 'upsertEvent',
      table: 'events',
    }),
    participants: Object.freeze({
      model: require('../models/participant'),
      mapper: mapParticipant,
      upsert: 'upsertParticipant',
      table: 'participants_core',
      select: '+secureIndex',
    }),
    wallets: Object.freeze({
      model: require('../models/wallet'),
      mapper: mapWallet,
      upsert: 'upsertWallet',
      table: 'wallets',
    }),
    vendors: Object.freeze({
      model: require('../models/vendor'),
      mapper: mapVendor,
      upsert: 'upsertVendor',
      table: 'vendors',
    }),
    transactions: Object.freeze({
      model: require('../models/transaction'),
      mapper: mapTransaction,
      upsert: 'upsertTransaction',
      table: 'wallet_transactions',
    }),
    receipts: Object.freeze({
      model: require('../models/Receipt'),
      mapper: mapReceipt,
      upsert: 'upsertReceipt',
      table: 'receipts',
    }),
    donations: Object.freeze({
      model: require('../models/Donation'),
      mapper: mapDonation,
      upsert: 'upsertDonation',
      table: 'donation_summaries',
    }),
    packages: Object.freeze({
      model: require('../models/Package'),
      mapper: mapPackage,
      upsert: 'upsertPackage',
      table: 'packages',
    }),
  });
  return cachedDefinitions;
}

function domainDefinition(domain) {
  return domainDefinitions()[domain] || null;
}

module.exports = {
  DOMAIN_ORDER,
  domainDefinition,
  domainDefinitions,
};
