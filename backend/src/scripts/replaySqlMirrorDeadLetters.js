require('dotenv').config();

const connectDB = require('../config/db');
const { disconnectDB } = require('../config/db');
const SqlMirrorOutbox = require('../models/sqlMirrorOutbox');
const { DOMAIN_ORDER } = require('../sql/reportingMirrorDomains');
const { clearSecretCache, hydrateRuntimeSecrets } = require('../utils/secretProvider');
const { integerEnv } = require('../utils/sqlMirrorOutbox');

function optionValue(name) {
  const argument = process.argv.find((value) => value.startsWith(`${name}=`));
  return argument ? argument.slice(name.length + 1).trim() : null;
}

function replayOptions() {
  const apply = process.argv.includes('--apply');
  const domain = optionValue('--domain');
  const limit = Math.min(Math.max(Number(optionValue('--limit')) || 100, 1), 1000);
  if (domain && !DOMAIN_ORDER.includes(domain)) throw new Error(`Unknown SQL mirror domain: ${domain}`);
  if (apply && process.env.SQL_OUTBOX_REPLAY !== 'true') {
    throw new Error('Applying dead-letter replay requires SQL_OUTBOX_REPLAY=true');
  }
  return { apply, domain, limit };
}

async function replayDeadLetters({ apply, domain, limit }) {
  const filter = { status: 'dead', ...(domain ? { domain } : {}) };
  const records = await SqlMirrorOutbox.find(filter)
    .sort({ deadLetteredAt: 1 })
    .limit(limit)
    .select('_id dedupeKey')
    .lean();
  if (!apply) return { dryRun: true, matched: records.length, replayed: 0, skippedPending: 0 };

  let replayed = 0;
  let skippedPending = 0;
  const now = new Date();
  for (const record of records) {
    const pending = await SqlMirrorOutbox.exists({ dedupeKey: record.dedupeKey, status: 'pending' });
    if (pending) {
      skippedPending += 1;
      continue;
    }
    const result = await SqlMirrorOutbox.updateOne(
      { _id: record._id, status: 'dead' },
      {
        $set: {
          status: 'pending',
          attemptCount: 0,
          maxAttempts: integerEnv('SQL_OUTBOX_MAX_ATTEMPTS', 8, { min: 1, max: 50 }),
          availableAt: now,
          requestedAt: now,
          lastErrorCode: null,
          lastErrorAt: null,
        },
        $unset: { deadLetteredAt: 1, completedAt: 1, purgeAt: 1, resultSourceHash: 1 },
      }
    );
    replayed += result.modifiedCount;
  }
  return { dryRun: false, matched: records.length, replayed, skippedPending };
}

async function main() {
  const options = replayOptions();
  try {
    await hydrateRuntimeSecrets({ requiredNames: ['MONGODB_URI'], managedNames: ['MONGODB_URI'] });
    await connectDB();
    const report = await replayDeadLetters(options);
    if (options.apply && report.replayed > 0) {
      const auditLog = require('../helpers/auditLog');
      await auditLog({
        action: 'SQL_MIRROR_DEAD_LETTER_REPLAY',
        detail: JSON.stringify({
          domain: options.domain || 'all',
          matched: report.matched,
          replayed: report.replayed,
          skippedPending: report.skippedPending,
        }),
        strict: false,
      });
    }
    console.log(JSON.stringify({ domain: options.domain || 'all', limit: options.limit, ...report }, null, 2));
  } finally {
    await disconnectDB().catch(() => {});
    clearSecretCache();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`SQL mirror dead-letter replay failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  replayDeadLetters,
  replayOptions,
};
