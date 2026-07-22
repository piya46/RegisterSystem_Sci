#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const GATEWAY_ROOT = path.join(ROOT, 'hosting', 'plesk-gateway');
const FRONTEND_DIST = path.join(ROOT, 'frontend', 'dist');
const PUBLIC_DIR = path.join(GATEWAY_ROOT, 'public');
const NEXT_DIR = path.join(GATEWAY_ROOT, `.public-${process.pid}`);
const PREVIOUS_DIR = path.join(GATEWAY_ROOT, '.public-previous');
const ROLLBACK_TEMP_DIR = path.join(GATEWAY_ROOT, '.public-rollback-current');
const RELEASE_METADATA_FILE = '.psevent-release.json';
const PLESK_INCOMPATIBLE_PUBLIC_FILES = ['.htaccess'];

function assertSafeGeneratedPath(target) {
  const relative = path.relative(GATEWAY_ROOT, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to modify path outside the Plesk gateway: ${target}`);
  }
}

function removeGenerated(target) {
  assertSafeGeneratedPath(target);
  fs.rmSync(target, { force: true, recursive: true });
}

function walkFiles(directory, base = directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return walkFiles(fullPath, base);
      return [{ fullPath, relativePath: path.relative(base, fullPath) }];
    });
}

function contentReleaseId(directory) {
  const digest = crypto.createHash('sha256');
  for (const { fullPath, relativePath } of walkFiles(directory)) {
    digest.update(relativePath);
    digest.update('\0');
    digest.update(fs.readFileSync(fullPath));
    digest.update('\0');
  }
  return `content-${digest.digest('hex').slice(0, 20)}`;
}

function gitReleaseId() {
  const explicit = process.env.GATEWAY_RELEASE_ID || process.env.GITHUB_SHA || process.env.PLESK_GIT_COMMIT;
  if (/^[0-9a-f]{7,40}$/i.test(String(explicit || ''))) return explicit.toLowerCase();
  const result = spawnSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  const value = result.status === 0 ? result.stdout.trim() : '';
  return /^[0-9a-f]{7,40}$/i.test(value) ? value.toLowerCase() : '';
}

function releaseIdFromDirectory(directory) {
  const metadataPath = path.join(directory, RELEASE_METADATA_FILE);
  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch {
    throw new Error(`Release metadata is missing or invalid at ${metadataPath}`);
  }
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(String(metadata.releaseId || ''))) {
    throw new Error(`Release metadata contains an invalid release ID at ${metadataPath}`);
  }
  return metadata.releaseId;
}

function writeCurrentReleaseId(releaseId) {
  const releasePath = path.join(GATEWAY_ROOT, '.release-id');
  const temporaryPath = path.join(GATEWAY_ROOT, `.release-id-${process.pid}`);
  assertSafeGeneratedPath(temporaryPath);
  try {
    fs.writeFileSync(temporaryPath, `${releaseId}\n`, { mode: 0o644 });
    fs.renameSync(temporaryPath, releasePath);
  } finally {
    removeGenerated(temporaryPath);
  }
}

function main() {
  if (process.argv.includes('--rollback')) {
    rollback();
    return;
  }
  const indexPath = path.join(FRONTEND_DIST, 'index.html');
  if (!fs.existsSync(indexPath)) throw new Error(`Frontend production build is missing at ${indexPath}`);

  removeGenerated(NEXT_DIR);
  removeGenerated(PREVIOUS_DIR);
  fs.cpSync(FRONTEND_DIST, NEXT_DIR, { recursive: true, errorOnExist: true });
  for (const relativePath of PLESK_INCOMPATIBLE_PUBLIC_FILES) {
    removeGenerated(path.join(NEXT_DIR, relativePath));
  }
  const releaseId = gitReleaseId() || contentReleaseId(NEXT_DIR);
  fs.writeFileSync(
    path.join(NEXT_DIR, RELEASE_METADATA_FILE),
    `${JSON.stringify({ releaseId })}\n`,
    { mode: 0o644 }
  );

  let movedCurrent = false;
  let installedNext = false;
  try {
    if (fs.existsSync(PUBLIC_DIR)) {
      fs.renameSync(PUBLIC_DIR, PREVIOUS_DIR);
      movedCurrent = true;
    }
    fs.renameSync(NEXT_DIR, PUBLIC_DIR);
    installedNext = true;
    writeCurrentReleaseId(releaseId);
  } catch (error) {
    if (installedNext && fs.existsSync(PUBLIC_DIR)) removeGenerated(PUBLIC_DIR);
    if (movedCurrent && fs.existsSync(PREVIOUS_DIR)) {
      fs.renameSync(PREVIOUS_DIR, PUBLIC_DIR);
    }
    removeGenerated(NEXT_DIR);
    throw error;
  }

  process.stdout.write(`Prepared Plesk public release ${releaseId}\n`);
}

function rollback() {
  const previousIndex = path.join(PREVIOUS_DIR, 'index.html');
  if (!fs.existsSync(previousIndex)) throw new Error('No previous Plesk public release is available');
  if (!fs.existsSync(path.join(PUBLIC_DIR, 'index.html'))) {
    throw new Error('The current Plesk public release is missing and cannot be rolled back safely');
  }
  const releaseId = releaseIdFromDirectory(PREVIOUS_DIR);
  const currentReleaseId = releaseIdFromDirectory(PUBLIC_DIR);
  removeGenerated(ROLLBACK_TEMP_DIR);
  let phase = 0;
  try {
    fs.renameSync(PUBLIC_DIR, ROLLBACK_TEMP_DIR);
    phase = 1;
    fs.renameSync(PREVIOUS_DIR, PUBLIC_DIR);
    phase = 2;
    fs.renameSync(ROLLBACK_TEMP_DIR, PREVIOUS_DIR);
    phase = 3;
    writeCurrentReleaseId(releaseId);
    process.stdout.write(`Rolled back Plesk public release to ${releaseId}\n`);
  } catch (error) {
    if (phase === 3) {
      fs.renameSync(PUBLIC_DIR, ROLLBACK_TEMP_DIR);
      fs.renameSync(PREVIOUS_DIR, PUBLIC_DIR);
      fs.renameSync(ROLLBACK_TEMP_DIR, PREVIOUS_DIR);
    } else if (phase === 2) {
      fs.renameSync(PUBLIC_DIR, PREVIOUS_DIR);
      fs.renameSync(ROLLBACK_TEMP_DIR, PUBLIC_DIR);
    } else if (phase === 1) {
      fs.renameSync(ROLLBACK_TEMP_DIR, PUBLIC_DIR);
    }
    try {
      writeCurrentReleaseId(currentReleaseId);
    } catch {
      // Preserve the original failure; startup can recover the ID from release metadata.
    }
    throw error;
  }
}

try {
  main();
} catch (error) {
  console.error(`Plesk public preparation failed: ${error.message}`);
  process.exitCode = 1;
}
