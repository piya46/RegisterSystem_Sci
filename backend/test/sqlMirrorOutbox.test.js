const test = require('node:test');
const assert = require('node:assert/strict');
const SqlMirrorOutbox = require('../src/models/sqlMirrorOutbox');
const { DOMAIN_ORDER, domainDefinitions } = require('../src/sql/reportingMirrorDomains');
const {
  assertSqlMirrorOutboxConfiguration,
  dedupeKey,
} = require('../src/utils/sqlMirrorOutbox');
const {
  PERMANENT_ERROR_CODES,
  retryDelayMs,
  safeErrorCode,
} = require('../src/utils/sqlMirrorOutboxWorker');

test('SQL mirror outbox stores references and operational metadata only', () => {
  const paths = Object.keys(SqlMirrorOutbox.schema.paths);
  assert.ok(paths.includes('sourceId'));
  assert.ok(paths.includes('dedupeKey'));
  assert.equal(paths.includes('payload'), false);
  assert.equal(paths.includes('document'), false);
  assert.equal(paths.includes('data'), false);

  const indexes = SqlMirrorOutbox.schema.indexes();
  assert.ok(indexes.some(([fields, options]) => fields.dedupeKey === 1 && options.unique === true));
  assert.ok(indexes.some(([fields, options]) => fields.purgeAt === 1 && options.expireAfterSeconds === 0));
});

test('SQL mirror domains use a single complete dependency order', () => {
  const definitions = domainDefinitions();
  assert.deepEqual(Object.keys(definitions), [...DOMAIN_ORDER]);
  for (const domain of DOMAIN_ORDER) {
    assert.equal(typeof definitions[domain].mapper, 'function');
    assert.match(definitions[domain].upsert, /^upsert[A-Z]/);
  }
});

test('SQL mirror outbox configuration fails closed for inconsistent flags', () => {
  const previous = {
    SQL_ENABLED: process.env.SQL_ENABLED,
    SQL_MIRROR_ENABLED: process.env.SQL_MIRROR_ENABLED,
    SQL_OUTBOX_ENABLED: process.env.SQL_OUTBOX_ENABLED,
    SQL_QUERY_TIMEOUT_MS: process.env.SQL_QUERY_TIMEOUT_MS,
    SQL_OUTBOX_LOCK_TIMEOUT_MS: process.env.SQL_OUTBOX_LOCK_TIMEOUT_MS,
  };
  try {
    process.env.SQL_ENABLED = 'false';
    process.env.SQL_MIRROR_ENABLED = 'true';
    process.env.SQL_OUTBOX_ENABLED = 'false';
    assert.throws(assertSqlMirrorOutboxConfiguration, /requires SQL_ENABLED=true/);

    process.env.SQL_ENABLED = 'true';
    process.env.SQL_MIRROR_ENABLED = 'false';
    process.env.SQL_OUTBOX_ENABLED = 'true';
    assert.throws(assertSqlMirrorOutboxConfiguration, /requires SQL_MIRROR_ENABLED=true/);

    process.env.SQL_MIRROR_ENABLED = 'true';
    assert.doesNotThrow(assertSqlMirrorOutboxConfiguration);

    process.env.SQL_QUERY_TIMEOUT_MS = '10000';
    process.env.SQL_OUTBOX_LOCK_TIMEOUT_MS = '12000';
    assert.throws(assertSqlMirrorOutboxConfiguration, /must exceed SQL_QUERY_TIMEOUT_MS/);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('SQL mirror retry backoff is bounded and error metadata is sanitized', () => {
  assert.equal(retryDelayMs(1, { baseMs: 1000, maxMs: 10000, random: () => 0 }), 750);
  assert.equal(retryDelayMs(3, { baseMs: 1000, maxMs: 10000, random: () => 0 }), 3000);
  assert.equal(retryDelayMs(20, { baseMs: 1000, maxMs: 10000, random: () => 1 }), 10000);
  assert.equal(safeErrorCode({ code: 'bad code:value' }), 'bad_code_value');
  assert.ok(PERMANENT_ERROR_CODES.has('SQL_MIRROR_UNIQUE_CONFLICT'));
  assert.equal(dedupeKey('wallets', '507f1f77bcf86cd799439011'), 'wallets:507f1f77bcf86cd799439011:upsert');
});

test('SQL mirror hooks reject hard deletes and untracked bulk writes when enabled', async () => {
  const previous = process.env.SQL_OUTBOX_ENABLED;
  process.env.SQL_OUTBOX_ENABLED = 'true';
  try {
    const Event = domainDefinitions().events.model;
    await assert.rejects(
      Event.deleteOne({ _id: '65a000000000000000000001' }),
      { code: 'SQL_MIRROR_HARD_DELETE_UNSUPPORTED' }
    );
    await assert.rejects(Event.insertMany([]), { code: 'SQL_OUTBOX_UNTRACKED_BULK_WRITE' });
    await assert.rejects(Event.bulkWrite([]), { code: 'SQL_OUTBOX_UNTRACKED_BULK_WRITE' });
  } finally {
    if (previous === undefined) delete process.env.SQL_OUTBOX_ENABLED;
    else process.env.SQL_OUTBOX_ENABLED = previous;
  }
});
