const METRICS = {
  secretManagerAccess: {
    env: 'SECRET_MANAGER_MAX_DAILY_ACCESS_OPS',
    defaultLimit: 200,
  },
  kmsCryptoOps: {
    env: 'KMS_MAX_DAILY_CRYPTO_OPS',
    defaultLimit: 500,
  },
  firestoreReads: {
    env: 'FIRESTORE_MAX_DAILY_READS',
    defaultLimit: 10000,
  },
  firestoreWrites: {
    env: 'FIRESTORE_MAX_DAILY_WRITES',
    defaultLimit: 3000,
  },
  firestoreDeletes: {
    env: 'FIRESTORE_MAX_DAILY_DELETES',
    defaultLimit: 1000,
  },
  gcsUploadOps: {
    env: 'GCS_MAX_DAILY_UPLOADS',
    defaultLimit: 1000,
  },
  gcsUploadKiB: {
    env: 'GCS_MAX_DAILY_UPLOAD_KIB',
    defaultLimit: 1048576,
  },
  gcsProjectedEgressKiB: {
    env: 'GCS_MAX_DAILY_PROJECTED_EGRESS_KIB',
    defaultLimit: 4194304,
  },
  gcsSignedUrlOps: {
    env: 'GCS_MAX_DAILY_SIGNED_URL_OPS',
    defaultLimit: 10000,
  },
  gcsMetadataOps: {
    env: 'GCS_MAX_DAILY_METADATA_OPS',
    defaultLimit: 10000,
  },
  sqlReads: {
    env: 'SQL_MAX_DAILY_READS',
    defaultLimit: 20000,
  },
  sqlWrites: {
    env: 'SQL_MAX_DAILY_WRITES',
    defaultLimit: 5000,
  },
};

const usageByDay = new Map();

function boolEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function currentDayKey(now = new Date()) {
  const timezone = process.env.CLOUD_COST_TIMEZONE || 'Asia/Bangkok';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function metricLimit(metric) {
  const config = METRICS[metric];
  if (!config) throw new Error(`Unknown cloud cost metric: ${metric}`);
  return Math.max(0, Math.floor(numberEnv(config.env, config.defaultLimit)));
}

function monthlyBudgetThb() {
  return Math.max(0, numberEnv('GOOGLE_CLOUD_MONTHLY_BUDGET_THB', 1000));
}

function dayBucket(dayKey = currentDayKey()) {
  if (!usageByDay.has(dayKey)) {
    usageByDay.set(dayKey, Object.fromEntries(Object.keys(METRICS).map((metric) => [metric, 0])));
    if (usageByDay.size > 35) {
      const oldest = [...usageByDay.keys()].sort()[0];
      usageByDay.delete(oldest);
    }
  }
  return usageByDay.get(dayKey);
}

function guardrailError(metric, attempted, limit, used) {
  const error = new Error(`Cloud cost guardrail exceeded for ${metric}: used=${used}, attempted=${attempted}, limit=${limit}`);
  error.code = 'CLOUD_COST_GUARDRAIL_EXCEEDED';
  error.statusCode = 503;
  error.metric = metric;
  return error;
}

function recordCloudUsage(metric, units = 1, { optional = true } = {}) {
  const amount = Math.max(0, Math.ceil(Number(units) || 0));
  if (amount === 0) return { allowed: true, metric, used: dayBucket()[metric] || 0, limit: metricLimit(metric) };

  const bucket = dayBucket();
  const limit = metricLimit(metric);
  const used = bucket[metric] || 0;

  if (limit <= 0 || used + amount > limit) {
    if (optional) {
      return {
        allowed: false,
        metric,
        used,
        attempted: amount,
        limit,
        reason: limit <= 0 ? 'disabled_by_limit' : 'daily_limit_exceeded',
      };
    }
    throw guardrailError(metric, amount, limit, used);
  }

  bucket[metric] = used + amount;
  return { allowed: true, metric, used: bucket[metric], limit };
}

function optionalCloudFeaturesEnabled() {
  return boolEnv('GOOGLE_CLOUD_OPTIONAL_FEATURES_ENABLED', true);
}

function guardrailStatus() {
  const dayKey = currentDayKey();
  const used = dayBucket(dayKey);
  return {
    dayKey,
    monthlyBudgetThb: monthlyBudgetThb(),
    optionalCloudFeaturesEnabled: optionalCloudFeaturesEnabled(),
    metrics: Object.fromEntries(
      Object.keys(METRICS).map((metric) => [
        metric,
        {
          used: used[metric] || 0,
          dailyLimit: metricLimit(metric),
        },
      ])
    ),
  };
}

module.exports = {
  boolEnv,
  guardrailStatus,
  optionalCloudFeaturesEnabled,
  recordCloudUsage,
};
