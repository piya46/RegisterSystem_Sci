require('dotenv').config();

const { estimateGcsMonthlyCost } = require('../utils/gcsCostEstimator');

function numberOption(name, fallback = 0) {
  const argument = process.argv.find((value) => value.startsWith(`${name}=`));
  const value = Number(argument ? argument.slice(name.length + 1) : fallback);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  return value;
}

function main() {
  const estimate = estimateGcsMonthlyCost({
    storedGiB: numberOption('--storage-gib'),
    internetEgressGiB: numberOption('--egress-gib'),
    uploadOperations: numberOption('--uploads'),
    downloadOperations: numberOption('--downloads'),
  });
  console.log(JSON.stringify(estimate, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`GCS cost estimation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
