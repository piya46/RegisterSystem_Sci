#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const GATEWAY_ROOT = path.join(ROOT, 'hosting', 'plesk-gateway');
const RELEASE_ROOT = path.join(ROOT, '.release');
const RELEASE_ID_PATTERN = /^[0-9a-f]{40}$/;
const BUNDLE_FILES = Object.freeze([
  '.release-id',
  'app.js',
  'package-lock.json',
  'package.json',
  'public',
  'src',
]);

function walkFiles(directory, base = directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return walkFiles(fullPath, base);
      if (!entry.isFile()) throw new Error(`Bundle source contains an unsupported entry: ${fullPath}`);
      return [{ fullPath, relativePath: path.relative(base, fullPath).split(path.sep).join('/') }];
    });
}

function sha256(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex');
}

function copyBundleFiles(targetRoot) {
  for (const relativePath of BUNDLE_FILES) {
    const source = path.join(GATEWAY_ROOT, relativePath);
    if (!fs.existsSync(source)) throw new Error(`Plesk bundle source is missing: ${relativePath}`);
    fs.cpSync(source, path.join(targetRoot, relativePath), {
      recursive: true,
      errorOnExist: true,
    });
  }
}

function main() {
  const releaseId = fs.readFileSync(path.join(GATEWAY_ROOT, '.release-id'), 'utf8').trim();
  if (!RELEASE_ID_PATTERN.test(releaseId)) {
    throw new Error('Plesk bundle requires a full Git release ID from prepare-plesk-public.js');
  }
  if (!fs.existsSync(path.join(GATEWAY_ROOT, 'public', 'index.html'))) {
    throw new Error('Plesk public frontend build is missing');
  }

  fs.mkdirSync(RELEASE_ROOT, { recursive: true, mode: 0o700 });
  const stagingRoot = path.join(RELEASE_ROOT, `.plesk-bundle-${process.pid}`);
  const releaseName = `psevent-plesk-gateway-${releaseId.slice(0, 12)}`;
  const applicationRoot = `releases/${releaseName}`;
  const documentRoot = `${applicationRoot}/public`;
  const gatewayTarget = path.join(stagingRoot, ...applicationRoot.split('/'));
  const archiveName = `${releaseName}.zip`;
  const archivePath = path.join(RELEASE_ROOT, archiveName);
  const checksumPath = `${archivePath}.sha256`;

  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.rmSync(archivePath, { force: true });
  fs.rmSync(checksumPath, { force: true });
  try {
    fs.mkdirSync(gatewayTarget, { recursive: true, mode: 0o700 });
    copyBundleFiles(gatewayTarget);
    const bundledFiles = walkFiles(gatewayTarget);
    if (bundledFiles.some(({ relativePath }) => path.basename(relativePath) === '.htaccess')) {
      throw new Error('Plesk bundle must not contain .htaccess');
    }
    const fileHashes = Object.fromEntries(bundledFiles.map(({ fullPath, relativePath }) => [
      `${applicationRoot}/${relativePath}`,
      sha256(fs.readFileSync(fullPath)),
    ]));
    fs.writeFileSync(
      path.join(gatewayTarget, 'PLESK_BUNDLE_MANIFEST.json'),
      `${JSON.stringify({
        releaseId,
        nodeEngine: '22.22.x or 24.x LTS',
        applicationRoot,
        documentRoot,
        startupFile: 'app.js',
        fileHashes,
      }, null, 2)}\n`,
      { mode: 0o644 }
    );

    const zip = spawnSync('zip', [
      '-X', '-q', '-r', archivePath,
      'releases',
    ], { cwd: stagingRoot, encoding: 'utf8' });
    if (zip.error) throw zip.error;
    if (zip.status !== 0) throw new Error(`zip failed: ${String(zip.stderr || '').trim()}`);

    const archiveHash = sha256(fs.readFileSync(archivePath));
    fs.writeFileSync(checksumPath, `${archiveHash}  ${archiveName}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify({
      releaseId,
      applicationRoot,
      documentRoot,
      archivePath,
      checksumPath,
      sha256: archiveHash,
    }, null, 2)}\n`);
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`Plesk bundle creation failed: ${error.message}\n`);
  process.exitCode = 1;
}
