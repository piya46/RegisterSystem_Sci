require('dotenv').config();

const mongoose = require('mongoose');
const { connectMongoForMigration } = require('../utils/mongoMigrationConnection');
const { inspectMongoSecurityPosture } = require('../utils/mongoSecurityPosture');

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  await connectMongoForMigration(mongoUri);
  try {
    const report = await inspectMongoSecurityPosture();
    console.log(JSON.stringify({
      dryRun: true,
      ...report,
    }, null, 2));
    if (!report.healthy) process.exitCode = 2;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`MongoDB security posture audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}
