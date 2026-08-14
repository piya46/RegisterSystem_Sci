require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { explicitMigrationApply } = require('../utils/migrationMode');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');
const { indexKeyMatches } = require('../utils/mongoIndexMigration');

function loadModels() {
  const modelsDirectory = path.resolve(__dirname, '../models');
  for (const filename of fs.readdirSync(modelsDirectory).filter((value) => value.endsWith('.js')).sort()) {
    require(path.join(modelsDirectory, filename));
  }
  return mongoose.modelNames().sort().map((name) => mongoose.model(name));
}

function defaultIndexName(key) {
  return Object.entries(key).map(([field, direction]) => `${field}_${direction}`).join('_');
}

function comparableOptions(index = {}) {
  return {
    unique: index.unique === true,
    sparse: index.sparse === true,
    expireAfterSeconds: index.expireAfterSeconds ?? null,
    partialFilterExpression: index.partialFilterExpression || null,
  };
}

function sameComparableOptions(actual, desired) {
  return JSON.stringify(comparableOptions(actual)) === JSON.stringify(comparableOptions(desired));
}

function classifyIndexChanges({ actualIndexes, diff }) {
  const creates = [];
  const reconfigureTtl = [];
  const replacements = [];
  const pairedDropNames = new Set();

  for (const [key, options = {}] of diff.toCreate || []) {
    const name = options.name || defaultIndexName(key);
    const actual = actualIndexes.find((index) => index.name === name)
      || actualIndexes.find((index) => indexKeyMatches(index, key));
    if (!actual) {
      creates.push({ key, options: { ...options, name } });
      continue;
    }
    if (sameComparableOptions(actual, options)) continue;

    pairedDropNames.add(actual.name);
    const desiredTtl = options.expireAfterSeconds;
    const onlyTtlDiffers = desiredTtl !== undefined
      && comparableOptions(actual).unique === comparableOptions(options).unique
      && comparableOptions(actual).sparse === comparableOptions(options).sparse
      && JSON.stringify(actual.partialFilterExpression || null)
        === JSON.stringify(options.partialFilterExpression || null);
    if (onlyTtlDiffers) {
      reconfigureTtl.push({
        name: actual.name,
        expireAfterSeconds: desiredTtl,
      });
    } else {
      replacements.push({
        name: actual.name,
        key,
        desiredOptions: { ...options, name },
      });
    }
  }

  return {
    creates,
    reconfigureTtl,
    replacements,
    reportOnlyDrops: (diff.toDrop || []).filter((name) => !pairedDropNames.has(name)),
  };
}

async function indexDiff(model) {
  const diff = await model.diffIndexes({ indexOptionsToCreate: true });
  const actualIndexes = await model.collection.indexes();
  const changes = classifyIndexChanges({ actualIndexes, diff });
  return {
    model: model.modelName,
    collection: model.collection.collectionName,
    ...changes,
  };
}

async function inspectIndexes(models) {
  const reports = [];
  for (const model of models) reports.push(await indexDiff(model));
  return reports;
}

function summarize(reports) {
  return {
    models: reports.length,
    modelsWithChanges: reports.filter((report) => (
      report.creates.length > 0
      || report.reconfigureTtl.length > 0
      || report.replacements.length > 0
      || report.reportOnlyDrops.length > 0
    )).length,
    indexesToCreate: reports.reduce((sum, report) => sum + report.creates.length, 0),
    ttlIndexesToReconfigure: reports.reduce((sum, report) => sum + report.reconfigureTtl.length, 0),
    indexesRequiringReplacement: reports.reduce((sum, report) => sum + report.replacements.length, 0),
    reportOnlyDrops: reports.reduce((sum, report) => sum + report.reportOnlyDrops.length, 0),
  };
}

async function createMissingIndexes(reports, models) {
  const modelByName = new Map(models.map((model) => [model.modelName, model]));
  const applied = [];
  for (const report of reports) {
    const model = modelByName.get(report.model);
    for (const index of report.creates) {
      await model.collection.createIndex(index.key, index.options);
      applied.push({ model: report.model, action: 'create', name: index.options.name });
    }
    for (const index of report.reconfigureTtl) {
      await mongoose.connection.db.command({
        collMod: report.collection,
        index: {
          name: index.name,
          expireAfterSeconds: index.expireAfterSeconds,
        },
      });
      applied.push({ model: report.model, action: 'configure_ttl', name: index.name });
    }
  }
  return applied;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');
  const apply = explicitMigrationApply({
    writeFlag: 'MONGO_INDEX_MIGRATION_WRITE',
    mongoSafetyGate: true,
  });
  const models = loadModels();

  await connectMongoForMigration(mongoUri);
  try {
    const before = await inspectIndexes(models);
    const result = {
      dryRun: !apply,
      before: summarize(before),
      changes: before.filter((report) => (
        report.creates.length > 0
        || report.reconfigureTtl.length > 0
        || report.replacements.length > 0
        || report.reportOnlyDrops.length > 0
      )),
      applied: [],
      after: null,
    };
    if (apply) {
      if (result.before.indexesRequiringReplacement > 0) {
        throw new Error(
          `${result.before.indexesRequiringReplacement} indexes require an explicit replacement migration before generic index apply`
        );
      }
      result.applied = await createMissingIndexes(before, models);
      const after = await inspectIndexes(models);
      result.after = summarize(after);
      if (
        result.after.indexesToCreate > 0
        || result.after.ttlIndexesToReconfigure > 0
        || result.after.indexesRequiringReplacement > 0
      ) {
        throw new Error('MongoDB index migration left required create/reconfigure actions incomplete');
      }
    }
    console.log(JSON.stringify(result, null, 2));
    if (!apply) {
      console.log('Dry run only. Use --apply with MONGO_INDEX_MIGRATION_WRITE=true during an approved maintenance window.');
    }
    if (result.before.reportOnlyDrops > 0) {
      console.log('Indexes listed in reportOnlyDrops are never removed by this script.');
    }
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`MongoDB index migration failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  classifyIndexChanges,
  inspectIndexes,
  loadModels,
  summarize,
};
