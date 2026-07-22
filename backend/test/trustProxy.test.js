const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidProxyRange, resolveTrustProxy } = require('../src/utils/trustProxy');

test('trust proxy defaults to the single Cloud Run frontend hop when unset', (t) => {
  const previousValue = process.env.TRUST_PROXY;
  delete process.env.TRUST_PROXY;
  t.after(() => {
    if (previousValue === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previousValue;
  });

  assert.equal(resolveTrustProxy(), 1);
  assert.equal(resolveTrustProxy('2'), 2);
});

test('trust proxy accepts named local ranges and explicit Plesk CIDRs', () => {
  assert.deepEqual(
    resolveTrustProxy('loopback, linklocal, uniquelocal, 203.170.190.137/32'),
    ['loopback', 'linklocal', 'uniquelocal', '203.170.190.137/32']
  );
  assert.equal(isValidProxyRange('203.170.190.137/32'), true);
  assert.equal(isValidProxyRange('2001:db8::1/128'), true);
});

test('trust proxy rejects broad booleans, hostnames, and invalid CIDRs', () => {
  for (const value of [
    'true',
    'proxy.example.com',
    '203.170.190.999/32',
    '203.170.190.0/24',
    '0.0.0.0/0',
    '10.0.0.0/99',
    '2001:db8::/32',
    '::::/32',
    '',
  ]) {
    assert.throws(() => resolveTrustProxy(value), /TRUST_PROXY/);
  }
});
