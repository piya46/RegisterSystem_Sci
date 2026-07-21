#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const prefix = String(process.env.GCS_OBJECT_PREFIX || 'psevent/staging')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9/_-]+/g, '-')
  .replace(/^\/+|\/+$/g, '');
const retentionDays = Math.min(Math.max(Number(process.env.GCS_SLIP_RETENTION_DAYS || 365), 30), 3650);
const unlinkedHours = Math.min(Math.max(Number(process.env.GCS_UNLINKED_UPLOAD_TTL_HOURS || 24), 1), 168);
const graceDays = Math.min(Math.max(Number(process.env.GCS_LIFECYCLE_DELETE_GRACE_DAYS || 2), 1), 30);
const outputPath = process.env.GCS_LIFECYCLE_FILE
  || path.resolve(__dirname, '..', '.release', 'gcs-lifecycle.json');

if (!prefix) throw new Error('GCS_OBJECT_PREFIX is required');

const lifecycle = {
  rule: [
    {
      action: { type: 'Delete' },
      condition: {
        age: retentionDays + Math.ceil(unlinkedHours / 24) + graceDays,
        matchesPrefix: [`${prefix}/payment_slip/`],
      },
    },
    {
      action: { type: 'AbortIncompleteMultipartUpload' },
      condition: { age: 1 },
    },
  ],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
fs.writeFileSync(outputPath, `${JSON.stringify(lifecycle, null, 2)}\n`, { mode: 0o600 });
fs.chmodSync(outputPath, 0o600);
process.stdout.write(`${outputPath}\n`);
