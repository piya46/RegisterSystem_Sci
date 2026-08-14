require('dotenv').config();

const connectDB = require('../config/db');
const { disconnectDB } = require('../config/db');
const { clearSecretCache, hydrateRuntimeSecrets } = require('../utils/secretProvider');
const { initializeObjectStorage, shutdownObjectStorage } = require('../utils/objectStorage');
const { cleanupExpiredStoredObjects } = require('../utils/storedObjectCleanup');

function integerOption(name, fallback) {
  const argument = process.argv.find((value) => value.startsWith(`${name}=`));
  const value = Number(argument ? argument.slice(name.length + 1) : fallback);
  return Math.min(Math.max(Math.floor(value) || fallback, 1), 1000);
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && process.env.OBJECT_STORAGE_CLEANUP_WRITE !== 'true') {
    throw new Error('Applying object cleanup requires OBJECT_STORAGE_CLEANUP_WRITE=true');
  }
  try {
    await hydrateRuntimeSecrets({ requiredNames: ['MONGODB_URI'], managedNames: ['MONGODB_URI'] });
    await connectDB({ autoIndex: false });
    await initializeObjectStorage();
    const result = await cleanupExpiredStoredObjects({
      limit: integerOption('--limit', 100),
      dryRun: !apply,
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    shutdownObjectStorage();
    await disconnectDB().catch(() => {});
    clearSecretCache();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Object storage cleanup failed: ${error.message}`);
    process.exitCode = 1;
  });
}
