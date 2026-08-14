const assert = require('node:assert/strict');
const test = require('node:test');

const {
  decryptValue,
  encryptValue,
  isEncryptedValue,
} = require('../src/utils/fieldEncryption');

const ENV_NAMES = [
  'DATA_ENCRYPTION_KEY',
  'DATA_ENCRYPTION_KEYS',
  'DATA_ENCRYPTION_KEY_ID',
  'FIELD_ENCRYPTION_ENABLED',
  'KMS_DATA_KEY_ENABLED',
];

function withEncryptionEnvironment(t) {
  const original = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  process.env.FIELD_ENCRYPTION_ENABLED = 'true';
  process.env.DATA_ENCRYPTION_KEY = '11'.repeat(32);
  process.env.DATA_ENCRYPTION_KEY_ID = 'v1';
  delete process.env.DATA_ENCRYPTION_KEYS;
  process.env.KMS_DATA_KEY_ENABLED = 'false';
  t.after(() => {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

test('field encryption round-trips through the declared key id', (t) => {
  withEncryptionEnvironment(t);
  const encrypted = encryptValue('sensitive value');
  assert.equal(isEncryptedValue(encrypted), true);
  assert.equal(encrypted.kid, 'v1');
  assert.equal(decryptValue(encrypted), 'sensitive value');
});

test('field decryption fails closed when the envelope key id is unknown', (t) => {
  withEncryptionEnvironment(t);
  const encrypted = encryptValue('sensitive value');
  assert.throws(
    () => decryptValue({ ...encrypted, kid: 'retired-key' }),
    /Missing data encryption key.*retired-key/
  );
});
