const assert = require('node:assert/strict');
const test = require('node:test');

const { grantSuperadminOptions } = require('../src/scripts/grantSuperadmin');

test('superadmin grant is dry-run by default and requires an explicit username', () => {
  assert.throws(
    () => grantSuperadminOptions({ args: [], env: {} }),
    /explicit safe superadmin username/
  );
  assert.deepEqual(
    grantSuperadminOptions({ args: ['piya.s'], env: {} }),
    { apply: false, changeReference: '', username: 'piya.s' }
  );
});

test('superadmin grant apply requires write, exact confirmation, and a change reference', () => {
  const args = ['piya.s', '--apply'];
  assert.throws(
    () => grantSuperadminOptions({ args, env: {} }),
    /SUPERADMIN_GRANT_WRITE=true/
  );
  assert.throws(
    () => grantSuperadminOptions({
      args,
      env: { SUPERADMIN_GRANT_WRITE: 'true' },
    }),
    /CONFIRM_SUPERADMIN_GRANT/
  );
  assert.throws(
    () => grantSuperadminOptions({
      args,
      env: {
        SUPERADMIN_GRANT_WRITE: 'true',
        CONFIRM_SUPERADMIN_GRANT: 'grant-superadmin:piya.s',
        SUPERADMIN_GRANT_CHANGE_REFERENCE: 'pending',
      },
    }),
    /CHANGE_REFERENCE/
  );
  assert.deepEqual(
    grantSuperadminOptions({
      args,
      env: {
        SUPERADMIN_GRANT_WRITE: 'true',
        CONFIRM_SUPERADMIN_GRANT: 'grant-superadmin:piya.s',
        SUPERADMIN_GRANT_CHANGE_REFERENCE: 'change/SEC-2026-104',
      },
    }),
    {
      apply: true,
      changeReference: 'change/SEC-2026-104',
      username: 'piya.s',
    }
  );
});
