const test = require('node:test');
const assert = require('node:assert/strict');
const { estimateGcsMonthlyCost } = require('../src/utils/gcsCostEstimator');

const ORIGINAL_RATE = process.env.GCS_COST_USD_TO_THB;
const ORIGINAL_BUDGET = process.env.GCS_MONTHLY_BUDGET_THB;
const PRICE_ENV_KEYS = [
  'GCS_COST_STANDARD_STORAGE_USD_PER_GIB_MONTH',
  'GCS_COST_CLASS_A_USD_PER_THOUSAND',
  'GCS_COST_CLASS_B_USD_PER_THOUSAND',
  'GCS_COST_INTERNET_EGRESS_USD_PER_GIB',
];
const ORIGINAL_PRICES = Object.fromEntries(PRICE_ENV_KEYS.map((key) => [key, process.env[key]]));

test.afterEach(() => {
  if (ORIGINAL_RATE === undefined) delete process.env.GCS_COST_USD_TO_THB;
  else process.env.GCS_COST_USD_TO_THB = ORIGINAL_RATE;
  if (ORIGINAL_BUDGET === undefined) delete process.env.GCS_MONTHLY_BUDGET_THB;
  else process.env.GCS_MONTHLY_BUDGET_THB = ORIGINAL_BUDGET;
  for (const key of PRICE_ENV_KEYS) {
    if (ORIGINAL_PRICES[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_PRICES[key];
  }
});

test('cost estimator includes storage, operations, and Asia internet egress', () => {
  process.env.GCS_COST_USD_TO_THB = '33.5';
  process.env.GCS_MONTHLY_BUDGET_THB = '700';
  const result = estimateGcsMonthlyCost({
    storedGiB: 4.768,
    uploadOperations: 10000,
    downloadOperations: 50000,
    internetEgressGiB: 23.84,
  });

  assert.equal(result.breakdownUsd.storage, 0.09536);
  assert.equal(result.breakdownUsd.classAOperations, 0.05);
  assert.equal(result.breakdownUsd.classBOperations, 0.02);
  assert.equal(result.breakdownUsd.internetEgress, 2.8608);
  assert.ok(Math.abs(result.totalThb - 101.37636) < 1e-9);
  assert.equal(result.withinOperationalCeiling, true);
});

test('cost estimator flags a forecast over the GCS sub-budget', () => {
  process.env.GCS_COST_USD_TO_THB = '33.5';
  process.env.GCS_MONTHLY_BUDGET_THB = '700';
  const result = estimateGcsMonthlyCost({ internetEgressGiB: 200 });

  assert.equal(result.withinBudget, false);
  assert.ok(result.totalThb > 700);
});

test('cost estimator accepts location-specific pricing overrides', () => {
  process.env.GCS_COST_USD_TO_THB = '35';
  process.env.GCS_COST_STANDARD_STORAGE_USD_PER_GIB_MONTH = '0.025';
  process.env.GCS_COST_CLASS_A_USD_PER_THOUSAND = '0.006';
  process.env.GCS_COST_CLASS_B_USD_PER_THOUSAND = '0.0005';
  process.env.GCS_COST_INTERNET_EGRESS_USD_PER_GIB = '0.13';

  const result = estimateGcsMonthlyCost({
    storedGiB: 10,
    uploadOperations: 1000,
    downloadOperations: 1000,
    internetEgressGiB: 10,
  });

  assert.deepEqual(result.pricingUsd, {
    standardStoragePerGiBMonth: 0.025,
    classAPerThousand: 0.006,
    classBPerThousand: 0.0005,
    internetEgressAsiaPerGiB: 0.13,
  });
  assert.ok(Math.abs(result.totalThb - 54.4775) < 1e-9);
});
