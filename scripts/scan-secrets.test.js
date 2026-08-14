const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { readCandidateText } = require('./scan-secrets');

test('secret scanner skips deleted Git candidates without hiding existing files', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'psevent-secret-scan-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  assert.equal(readCandidateText(root, 'deleted-workflow.yml'), null);
  fs.writeFileSync(path.join(root, 'workflow.yml'), 'contents: read\n');
  assert.equal(readCandidateText(root, 'workflow.yml'), 'contents: read\n');
});

test('secret scanner does not follow a candidate symlink outside the repository', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'psevent-secret-link-'));
  const outside = path.join(os.tmpdir(), `psevent-secret-outside-${process.pid}`);
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { force: true });
  });

  fs.writeFileSync(outside, 'must-not-be-read\n');
  fs.symlinkSync(outside, path.join(root, 'candidate.txt'));
  assert.equal(readCandidateText(root, 'candidate.txt'), outside);
});
