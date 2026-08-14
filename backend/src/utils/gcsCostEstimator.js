const PRICING_ASSUMPTIONS_USD = Object.freeze({
  standardStoragePerGiBMonth: 0.02,
  classAPerThousand: 0.005,
  classBPerThousand: 0.0004,
  internetEgressAsiaPerGiB: 0.12,
});

const PRICING_ENV_KEYS = Object.freeze({
  standardStoragePerGiBMonth: 'GCS_COST_STANDARD_STORAGE_USD_PER_GIB_MONTH',
  classAPerThousand: 'GCS_COST_CLASS_A_USD_PER_THOUSAND',
  classBPerThousand: 'GCS_COST_CLASS_B_USD_PER_THOUSAND',
  internetEgressAsiaPerGiB: 'GCS_COST_INTERNET_EGRESS_USD_PER_GIB',
});

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function usdToThbRate() {
  return nonNegativeNumber(process.env.GCS_COST_USD_TO_THB) || 33.5;
}

function gcsMonthlyBudgetThb() {
  return nonNegativeNumber(process.env.GCS_MONTHLY_BUDGET_THB) || 650;
}

function pricingAssumptionsUsd() {
  return Object.fromEntries(Object.entries(PRICING_ASSUMPTIONS_USD).map(([key, fallback]) => [
    key,
    nonNegativeNumber(process.env[PRICING_ENV_KEYS[key]]) || fallback,
  ]));
}

function estimateGcsMonthlyCost({
  storedGiB = 0,
  uploadOperations = 0,
  downloadOperations = 0,
  internetEgressGiB = 0,
} = {}) {
  const pricing = pricingAssumptionsUsd();
  const storageUsd = nonNegativeNumber(storedGiB) * pricing.standardStoragePerGiBMonth;
  const operationsAUsd = (nonNegativeNumber(uploadOperations) / 1000) * pricing.classAPerThousand;
  const operationsBUsd = (nonNegativeNumber(downloadOperations) / 1000) * pricing.classBPerThousand;
  const egressUsd = nonNegativeNumber(internetEgressGiB) * pricing.internetEgressAsiaPerGiB;
  const totalUsd = storageUsd + operationsAUsd + operationsBUsd + egressUsd;
  const exchangeRate = usdToThbRate();
  const budgetThb = gcsMonthlyBudgetThb();
  const totalThb = totalUsd * exchangeRate;
  return {
    assumptionsAsOf: '2026-07-17',
    regionClass: 'single-region Standard',
    exchangeRateUsdToThb: exchangeRate,
    pricingUsd: pricing,
    usage: {
      storedGiB: nonNegativeNumber(storedGiB),
      uploadOperations: nonNegativeNumber(uploadOperations),
      downloadOperations: nonNegativeNumber(downloadOperations),
      internetEgressGiB: nonNegativeNumber(internetEgressGiB),
    },
    breakdownUsd: {
      storage: storageUsd,
      classAOperations: operationsAUsd,
      classBOperations: operationsBUsd,
      internetEgress: egressUsd,
    },
    totalUsd,
    totalThb,
    monthlyBudgetThb: budgetThb,
    reserveTargetThb: budgetThb * 0.2,
    operationalCeilingThb: budgetThb * 0.8,
    withinOperationalCeiling: totalThb <= budgetThb * 0.8,
    withinBudget: totalThb <= budgetThb,
  };
}

module.exports = {
  PRICING_ASSUMPTIONS_USD,
  estimateGcsMonthlyCost,
  gcsMonthlyBudgetThb,
  pricingAssumptionsUsd,
  usdToThbRate,
};
