require('dotenv').config();

const crypto = require('crypto');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { disconnectDB } = require('../config/db');
const { closeSQL, connectSQL, withSqlTransaction } = require('../config/sql');
const {
  applySqlMigrationCredentials,
  hydrateSqlMigrationSecrets,
} = require('../sql/migrationRuntime');
const { createReportingMirrorRepository } = require('../sql/reportingMirrorRepository');
const { DOMAIN_ORDER, domainDefinitions } = require('../sql/reportingMirrorDomains');
const { xorChecksum } = require('../sql/checksum');
const {
  REPORTING_MIRROR_MAPPER_VERSION,
} = require('../sql/reportingMirrorMapper');
const { clearSecretCache, hydrateRuntimeSecrets } = require('../utils/secretProvider');

function integerOption(prefix, fallback, min, max) {
  const argument = process.argv.find((value) => value.startsWith(`${prefix}=`));
  const parsed = Number(argument ? argument.slice(prefix.length + 1) : fallback);
  if (!Number.isFinite(parsed)) throw new Error(`${prefix} must be a number`);
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function selectedDomains() {
  const argument = process.argv.find((value) => value.startsWith('--domains='));
  if (!argument) return [...DOMAIN_ORDER];
  const requested = argument.slice('--domains='.length).split(',').map((value) => value.trim()).filter(Boolean);
  const unknown = requested.filter((domain) => !DOMAIN_ORDER.includes(domain));
  if (unknown.length) throw new Error(`Unknown SQL mirror domains: ${unknown.join(', ')}`);
  return DOMAIN_ORDER.filter((domain) => requested.includes(domain));
}

function objectIdFilter({ after = null, highWatermark = null } = {}) {
  if (!after && !highWatermark) return {};
  const condition = {};
  if (after) condition.$gt = new mongoose.Types.ObjectId(after);
  if (highWatermark) condition.$lte = new mongoose.Types.ObjectId(highWatermark);
  return { _id: condition };
}

async function highestMongoId(model) {
  const document = await model.findOne({}).sort({ _id: -1 }).select('_id').lean();
  return document?._id ? String(document._id) : null;
}

async function prefixState(definition, lastMongoId, batchSize) {
  if (!lastMongoId) return { count: 0, checksum: '0'.repeat(64) };
  let after = null;
  let count = 0;
  let checksum = '0'.repeat(64);
  while (true) {
    let query = definition.model
      .find(objectIdFilter({ after, highWatermark: lastMongoId }))
      .sort({ _id: 1 })
      .limit(batchSize);
    if (definition.select) query = query.select(definition.select);
    const documents = await query.lean();
    if (documents.length === 0) break;
    for (const document of documents) {
      checksum = xorChecksum(checksum, definition.mapper(document).row.source_hash);
    }
    count += documents.length;
    after = String(documents[documents.length - 1]._id);
  }
  return { count, checksum };
}

async function initializeRun(repository, domain, definition, batchSize) {
  const existing = await repository.checkpoint(domain);
  let resumable = existing
    && !existing.completed_at
    && existing.mapper_version === REPORTING_MIRROR_MAPPER_VERSION;
  if (resumable) {
    const prefix = await prefixState(definition, existing.last_mongo_id, batchSize);
    resumable = prefix.count === Number(existing.processed_count || 0)
      && prefix.checksum === (existing.source_checksum || '0'.repeat(64));
  }
  if (resumable) {
    return {
      runId: existing.run_id,
      highWatermark: existing.high_watermark_mongo_id,
      lastMongoId: existing.last_mongo_id,
      processedCount: Number(existing.processed_count || 0),
      checksum: existing.source_checksum || '0'.repeat(64),
      resumed: true,
    };
  }

  const run = {
    runId: crypto.randomUUID(),
    highWatermark: await highestMongoId(definition.model),
    lastMongoId: null,
    processedCount: 0,
    checksum: '0'.repeat(64),
    resumed: false,
  };
  await repository.saveCheckpoint({
    domain,
    runId: run.runId,
    mapperVersion: REPORTING_MIRROR_MAPPER_VERSION,
    highWatermarkMongoId: run.highWatermark,
    lastMongoId: null,
    processedCount: 0,
    lastSourceHash: null,
    sourceChecksum: run.checksum,
  });
  return run;
}

async function sourceCountFor(model, highWatermark) {
  return model.countDocuments(objectIdFilter({ highWatermark }));
}

async function processDomain({
  domain,
  definition,
  apply,
  batchSize,
  sharedIdCache,
}) {
  const plainRepository = apply ? createReportingMirrorRepository({ idCache: sharedIdCache }) : null;
  const run = apply
    ? await initializeRun(plainRepository, domain, definition, batchSize)
    : {
      runId: null,
      highWatermark: await highestMongoId(definition.model),
      lastMongoId: null,
      processedCount: 0,
      checksum: '0'.repeat(64),
      resumed: false,
    };
  const sourceCount = await sourceCountFor(definition.model, run.highWatermark);
  let lastMongoId = run.lastMongoId;
  let processedCount = run.processedCount;
  let checksum = run.checksum;

  while (true) {
    let query = definition.model
      .find(objectIdFilter({ after: lastMongoId, highWatermark: run.highWatermark }))
      .sort({ _id: 1 })
      .limit(batchSize);
    if (definition.select) query = query.select(definition.select);
    const documents = await query.lean();
    if (documents.length === 0) break;

    const mappedDocuments = documents.map((document) => definition.mapper(document));
    for (const data of mappedDocuments) checksum = xorChecksum(checksum, data.row.source_hash);
    const nextProcessedCount = processedCount + documents.length;
    const nextLastMongoId = String(documents[documents.length - 1]._id);

    if (apply) {
      await withSqlTransaction(async (transaction) => {
        const repository = createReportingMirrorRepository({ transaction, idCache: sharedIdCache });
        for (const data of mappedDocuments) await repository[definition.upsert](data);
        await repository.saveCheckpoint({
          domain,
          runId: run.runId,
          mapperVersion: REPORTING_MIRROR_MAPPER_VERSION,
          highWatermarkMongoId: run.highWatermark,
          lastMongoId: nextLastMongoId,
          processedCount: nextProcessedCount,
          lastSourceHash: mappedDocuments[mappedDocuments.length - 1].row.source_hash,
          sourceChecksum: checksum,
        });
      });
    }

    processedCount = nextProcessedCount;
    lastMongoId = nextLastMongoId;
    if (sharedIdCache.size > 50000) sharedIdCache.clear();
  }

  let sqlCount = null;
  let sqlChecksum = null;
  if (apply) {
    if (domain === 'transactions') await plainRepository.reconcileTransactionReversals();
    sqlCount = await plainRepository.countRows(definition.table, {
      highWatermarkMongoId: run.highWatermark,
    });
    sqlChecksum = await plainRepository.sourceChecksum(definition.table, {
      highWatermarkMongoId: run.highWatermark,
    });
    if (processedCount !== sourceCount || sqlCount !== sourceCount || sqlChecksum !== checksum) {
      throw new Error(
        `SQL mirror validation mismatch for ${domain}: source=${sourceCount}, processed=${processedCount}, sql=${sqlCount}`
      );
    }
    await plainRepository.completeCheckpoint({
      domain,
      runId: run.runId,
      processedCount,
      sourceChecksum: checksum,
    });
  }

  return {
    domain,
    dryRun: !apply,
    resumed: run.resumed,
    highWatermark: run.highWatermark,
    sourceCount,
    processedCount,
    sqlCount,
    countMatches: apply ? sqlCount === sourceCount : null,
    sourceChecksum: checksum,
    sqlChecksum,
    checksumMatches: apply ? sqlChecksum === checksum : null,
  };
}

async function hydrateBackfillSecrets({ apply, domains }) {
  const required = ['MONGODB_URI'];
  if (process.env.NODE_ENV === 'production' && domains.includes('participants')) {
    required.push('SQL_MIRROR_IDENTITY_HASH_SECRET');
  }
  if (apply) {
    await hydrateSqlMigrationSecrets(required);
  } else {
    await hydrateRuntimeSecrets({ requiredNames: required, managedNames: required });
  }
}

async function runBackfill({ apply, domains, batchSize }) {
  if (apply && process.env.SQL_BACKFILL_WRITE !== 'true') {
    throw new Error('Applying SQL backfill requires SQL_BACKFILL_WRITE=true');
  }
  await hydrateBackfillSecrets({ apply, domains });
  if (apply) applySqlMigrationCredentials();
  await connectDB({ autoIndex: false });
  if (apply) await connectSQL();

  const definitions = domainDefinitions();
  const reports = [];
  const sharedIdCache = new Map();
  for (const domain of domains) {
    reports.push(await processDomain({
      domain,
      definition: definitions[domain],
      apply,
      batchSize,
      sharedIdCache,
    }));
  }
  return reports;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const domains = selectedDomains();
  const batchSize = integerOption('--batch-size', 100, 1, 1000);
  if (process.argv.includes('--plan-only')) {
    console.log(JSON.stringify({ dryRun: true, planOnly: true, domains, batchSize }, null, 2));
    return;
  }

  try {
    const reports = await runBackfill({ apply, domains, batchSize });
    console.log(JSON.stringify({ dryRun: !apply, mapperVersion: REPORTING_MIRROR_MAPPER_VERSION, reports }, null, 2));
  } finally {
    await closeSQL().catch(() => {});
    await disconnectDB().catch(() => {});
    clearSecretCache();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`SQL mirror backfill failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  runBackfill,
  selectedDomains,
};
