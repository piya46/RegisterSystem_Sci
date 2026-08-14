const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { verifyPleskSource } = require('./verify-plesk-source');

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function writeExecutable(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, { mode: 0o755 });
}

test('verifies a Plesk deployment target against its sibling Git mirror', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'psevent-plesk-source-'));
  const source = path.join(home, 'source');
  const target = path.join(home, 'reunion.scicu-alumni.com');
  const gitRoot = path.join(home, 'git');
  const mirror = path.join(gitRoot, 'RegisterSystem_Sci.git');
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(gitRoot, { recursive: true });
  git(source, ['init', '--initial-branch=main']);
  git(source, ['config', 'user.email', 'ci@example.invalid']);
  git(source, ['config', 'user.name', 'CI']);
  fs.writeFileSync(path.join(source, 'app.txt'), 'approved release\n');
  writeExecutable(path.join(source, 'scripts', 'release.sh'), '#!/bin/sh\nexit 0\n');
  git(source, ['add', '.']);
  git(source, ['commit', '-m', 'approved']);
  const releaseId = git(source, ['rev-parse', 'HEAD']);
  git(home, ['clone', '--bare', source, mirror]);

  fs.writeFileSync(path.join(target, 'app.txt'), 'approved release\n');
  writeExecutable(path.join(target, 'scripts', 'release.sh'), '#!/bin/sh\nexit 0\n');

  const verified = verifyPleskSource({ rootDir: target });
  assert.equal(verified.sourceMode, 'plesk-mirror');
  assert.equal(verified.releaseId, releaseId);

  assert.equal(
    verifyPleskSource({ rootDir: target, approvedSha: releaseId }).releaseId,
    releaseId
  );
  assert.throws(
    () => verifyPleskSource({ rootDir: target, approvedSha: '0'.repeat(40) }),
    /does not match PLESK_APPROVED_SHA/
  );

  fs.writeFileSync(path.join(target, 'app.txt'), 'tampered release\n');
  assert.throws(
    () => verifyPleskSource({ rootDir: target }),
    /does not match the selected commit/
  );
});

test('verifies a normal checkout and rejects tracked local changes', (t) => {
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'psevent-plesk-checkout-'));
  t.after(() => fs.rmSync(checkout, { recursive: true, force: true }));

  git(checkout, ['init', '--initial-branch=main']);
  git(checkout, ['config', 'user.email', 'ci@example.invalid']);
  git(checkout, ['config', 'user.name', 'CI']);
  fs.writeFileSync(path.join(checkout, 'app.txt'), 'clean\n');
  git(checkout, ['add', 'app.txt']);
  git(checkout, ['commit', '-m', 'clean']);

  assert.equal(verifyPleskSource({ rootDir: checkout }).sourceMode, 'checkout');
  fs.writeFileSync(path.join(checkout, 'app.txt'), 'dirty\n');
  assert.throws(
    () => verifyPleskSource({ rootDir: checkout }),
    /local modifications/
  );
});
