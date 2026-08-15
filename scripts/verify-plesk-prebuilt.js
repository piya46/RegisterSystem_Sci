#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROOT = path.join(ROOT, 'hosting', 'plesk-gateway', 'public');
const PUBLIC_PREFIX = 'hosting/plesk-gateway/public/';

function gitTrackedFiles() {
  const result = spawnSync('git', ['-C', ROOT, 'ls-files', '-z', '--', PUBLIC_PREFIX], {
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(String(result.stderr || '').trim() || 'git ls-files failed');
  return new Set(result.stdout.split('\0').filter(Boolean));
}

function walkFiles(directory, base = directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return walkFiles(fullPath, base);
      if (!entry.isFile()) throw new Error(`Unsupported prebuilt entry: ${fullPath}`);
      return path.relative(base, fullPath).split(path.sep).join('/');
    });
}

function main() {
  const indexPath = path.join(PUBLIC_ROOT, 'index.html');
  const metadataPath = path.join(PUBLIC_ROOT, '.psevent-release.json');
  if (!fs.existsSync(indexPath)) throw new Error('Tracked Plesk frontend is missing index.html');

  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch {
    throw new Error('Tracked Plesk frontend release metadata is missing or invalid');
  }
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(String(metadata.releaseId || ''))) {
    throw new Error('Tracked Plesk frontend release ID is invalid');
  }

  const files = walkFiles(PUBLIC_ROOT);
  if (files.some((relativePath) => path.basename(relativePath) === '.htaccess')) {
    throw new Error('Tracked Plesk frontend must not contain .htaccess');
  }
  if (files.some((relativePath) => relativePath.endsWith('.map'))) {
    throw new Error('Tracked Plesk frontend must not contain source maps');
  }

  const tracked = gitTrackedFiles();
  const untracked = files
    .map((relativePath) => `${PUBLIC_PREFIX}${relativePath}`)
    .filter((relativePath) => !tracked.has(relativePath));
  if (untracked.length > 0) {
    throw new Error(`Plesk frontend contains untracked files: ${untracked.slice(0, 3).join(', ')}`);
  }
  if (tracked.size !== files.length) {
    throw new Error('Tracked Plesk frontend contains stale or missing files');
  }

  process.stdout.write(`${JSON.stringify({
    ready: true,
    releaseId: metadata.releaseId,
    fileCount: files.length,
  })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`Plesk prebuilt verification failed: ${error.message}\n`);
  process.exitCode = 1;
}
