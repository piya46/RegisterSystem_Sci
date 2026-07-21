require('dotenv').config();

const { Storage } = require('@google-cloud/storage');

function integerEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  const normalized = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(Math.max(normalized, min), max);
}

function normalizedPrefix() {
  return String(process.env.GCS_OBJECT_PREFIX || process.env.NODE_ENV || 'development')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/^\/+|\/+$/g, '') || 'development';
}

function durationSeconds(value) {
  const seconds = Number(String(value ?? '').trim().replace(/s$/i, ''));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

function isRegionalGcsLocation(value) {
  return /^[a-z]+(?:-[a-z]+)+\d+$/.test(String(value || '').trim().toLowerCase());
}

function managedLifecycleRules() {
  const prefix = normalizedPrefix();
  const slipRetentionDays = integerEnv('GCS_SLIP_RETENTION_DAYS', 365, 30, 3650);
  const unlinkedUploadHours = integerEnv('GCS_UNLINKED_UPLOAD_TTL_HOURS', 24, 1, 168);
  const lifecycleGraceDays = integerEnv('GCS_LIFECYCLE_DELETE_GRACE_DAYS', 2, 1, 30);
  const rules = [
    {
      action: { type: 'Delete' },
      condition: {
        age: slipRetentionDays + Math.ceil(unlinkedUploadHours / 24) + lifecycleGraceDays,
        matchesPrefix: [`${prefix}/payment_slip/`],
      },
    },
    {
      action: { type: 'AbortIncompleteMultipartUpload' },
      condition: { age: 1 },
    },
  ];
  return rules;
}

function isManagedRule(rule) {
  if (String(rule.action?.type || '').toLowerCase() === 'abortincompletemultipartupload') return true;
  if (String(rule.action?.type || '').toLowerCase() !== 'delete') return false;
  const prefixes = rule.condition?.matchesPrefix || [];
  const paymentSlipPrefix = `${normalizedPrefix()}/payment_slip/`;
  return prefixes.length > 0 && prefixes.every((prefix) => String(prefix) === paymentSlipPrefix);
}

function broadDeleteRuleTouchesManagedRoot(rule) {
  if (String(rule.action?.type || '').toLowerCase() !== 'delete') return false;
  const prefixes = rule.condition?.matchesPrefix || [];
  const managedRoot = `${normalizedPrefix()}/`;
  const paymentSlipPrefix = `${managedRoot}payment_slip/`;
  const onlyManagedSlipRule = prefixes.length > 0
    && prefixes.every((prefix) => String(prefix) === paymentSlipPrefix);
  if (onlyManagedSlipRule) return false;
  return prefixes.length === 0 || prefixes.some((prefix) => {
    const value = String(prefix || '');
    return managedRoot.startsWith(value) || value.startsWith(managedRoot);
  });
}

async function applyConfiguration() {
  if (process.env.GCS_BUCKET_CONFIG_WRITE !== 'true') {
    throw new Error('Applying GCS bucket configuration requires GCS_BUCKET_CONFIG_WRITE=true');
  }
  const bucketName = String(process.env.GCS_BUCKET || '').trim();
  const expectedLocation = String(process.env.GCS_LOCATION || '').trim().toLowerCase();
  if (!bucketName || !expectedLocation) throw new Error('GCS_BUCKET and GCS_LOCATION are required');
  if (!isRegionalGcsLocation(expectedLocation)) throw new Error('GCS_LOCATION must be a single region');
  const storage = new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || undefined });
  const bucket = storage.bucket(bucketName);
  const [current] = await bucket.getMetadata();
  if (String(current.location || '').toLowerCase() !== expectedLocation) {
    throw new Error('Existing GCS bucket location does not match GCS_LOCATION');
  }
  if ((current.lifecycle?.rule || []).some(broadDeleteRuleTouchesManagedRoot)) {
    throw new Error('Existing broad lifecycle Delete rule overlaps the managed object prefix; review it manually before apply');
  }
  const maxBucketRetentionDays = integerEnv('GCS_MAX_BUCKET_RETENTION_DAYS', 0, 0, 3650);
  if (durationSeconds(current.retentionPolicy?.retentionPeriod) > maxBucketRetentionDays * 86400) {
    throw new Error('Existing bucket retention exceeds GCS_MAX_BUCKET_RETENTION_DAYS; review it manually before apply');
  }
  if (current.defaultEventBasedHold === true) {
    throw new Error('Existing bucket default event-based hold must be disabled manually before apply');
  }
  const preservedRules = (current.lifecycle?.rule || []).filter((rule) => !isManagedRule(rule));
  const lifecycleRules = [...preservedRules, ...managedLifecycleRules()];
  const [updated] = await bucket.setMetadata({
    storageClass: 'STANDARD',
    iamConfiguration: {
      uniformBucketLevelAccess: { enabled: true },
      publicAccessPrevention: 'enforced',
    },
    lifecycle: { rule: lifecycleRules },
  });
  return {
    applied: true,
    location: updated.location,
    storageClass: updated.storageClass,
    uniformBucketLevelAccess: updated.iamConfiguration?.uniformBucketLevelAccess?.enabled === true,
    publicAccessPrevention: updated.iamConfiguration?.publicAccessPrevention,
    lifecycleRuleCount: updated.lifecycle?.rule?.length || 0,
  };
}

async function main() {
  const plan = {
    dryRun: !process.argv.includes('--apply'),
    expectedLocation: process.env.GCS_LOCATION || 'asia-southeast3',
    storageClass: 'STANDARD',
    publicAccessPrevention: 'enforced',
    uniformBucketLevelAccess: true,
    lifecycleRules: managedLifecycleRules(),
  };
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  console.log(JSON.stringify(await applyConfiguration(), null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`GCS bucket configuration failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  applyConfiguration,
  managedLifecycleRules,
  broadDeleteRuleTouchesManagedRoot,
};
