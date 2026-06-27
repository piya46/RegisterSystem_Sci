require('dotenv').config();

const mongoose = require('mongoose');
const { migrateLegacyEventData } = require('../controllers/eventController');

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  await mongoose.connect(mongoUri);
  const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
  const result = await migrateLegacyEventData({ dryRun });

  console.log(`Dry run: ${result.dryRun ? 'yes' : 'no'}`);
  console.log(`Backfill eventYear for empty legacy rows: ${result.before?.backfillEventYear || '-'}`);
  console.log(`Events to create/created: ${result.createdEvents.length}`);
  result.createdEvents.forEach((event) => {
    console.log(`- ${event.eventYear}: ${event.name}${event.eventId ? ` (${event.eventId})` : ''}`);
  });
  console.log(`Participants updated: ${result.updated.participants}`);
  console.log(`Donations updated: ${result.updated.donations}`);
  console.log(`Prizes updated: ${result.updated.prizes}`);
  console.log(`Packages updated: ${result.updated.packages}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
