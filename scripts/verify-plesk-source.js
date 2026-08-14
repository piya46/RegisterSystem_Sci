#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_REPOSITORY_NAME = 'RegisterSystem_Sci.git';
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

function gitResult(args, options = {}) {
  return spawnSync('git', args, {
    cwd: options.cwd,
    encoding: options.encoding === null ? null : 'utf8',
    env: options.env || process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function gitText(args, options = {}) {
  const result = gitResult(args, options);
  if (result.error) throw new Error(`Unable to run git: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`Git command failed${detail ? `: ${detail}` : ''}`);
  }
  return String(result.stdout || '').trim();
}

function normalizeCommit(value, label) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!GIT_SHA_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a full 40-character Git commit SHA`);
  }
  return normalized;
}

function assertValidBranch(branch) {
  if (!branch || branch.length > 128) throw new Error('PLESK_EXPECTED_BRANCH is invalid');
  const result = gitResult(['check-ref-format', '--branch', branch]);
  if (result.error || result.status !== 0) {
    throw new Error('PLESK_EXPECTED_BRANCH is not a valid Git branch name');
  }
}

function samePath(left, right) {
  const canonical = (target) => {
    try {
      return fs.realpathSync.native(target);
    } catch {
      return path.resolve(target);
    }
  };
  return canonical(left) === canonical(right);
}

function checkoutAtRoot(rootDir) {
  const result = gitResult(['-C', rootDir, 'rev-parse', '--show-toplevel']);
  if (result.error || result.status !== 0) return false;
  return samePath(String(result.stdout || '').trim(), rootDir);
}

function assertCleanCheckout(rootDir) {
  for (const args of [
    ['-C', rootDir, 'diff', '--quiet', '--'],
    ['-C', rootDir, 'diff', '--cached', '--quiet', '--'],
  ]) {
    const result = gitResult(args);
    if (result.error) throw new Error(`Unable to inspect the Git checkout: ${result.error.message}`);
    if (result.status === 1) throw new Error('Tracked Plesk deployment files have local modifications');
    if (result.status !== 0) {
      throw new Error(`Unable to inspect tracked Plesk deployment files: ${String(result.stderr || '').trim()}`);
    }
  }
}

function verifyCheckout(rootDir, expectedBranch) {
  const branch = gitText(['-C', rootDir, 'branch', '--show-current']);
  if (branch !== expectedBranch) {
    throw new Error(
      `Manual Plesk deployment must use branch ${expectedBranch} (found ${branch || 'detached HEAD'})`
    );
  }
  assertCleanCheckout(rootDir);
  return {
    branch,
    releaseId: normalizeCommit(
      gitText(['-C', rootDir, 'rev-parse', '--verify', 'HEAD^{commit}']),
      'Plesk checkout commit'
    ),
    sourceMode: 'checkout',
  };
}

function resolvePleskGitDir(rootDir, explicitGitDir, repositoryName) {
  if (!/^[A-Za-z0-9._-]+\.git$/.test(repositoryName)) {
    throw new Error('PLESK_REPOSITORY_NAME must be a safe .git directory name');
  }

  const candidates = explicitGitDir
    ? [path.resolve(rootDir, explicitGitDir)]
    : [
        path.resolve(rootDir, '..', 'git', repositoryName),
        path.resolve(rootDir, 'git', repositoryName),
      ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const result = gitResult(['--git-dir', candidate, 'rev-parse', '--git-dir']);
    if (!result.error && result.status === 0) return fs.realpathSync.native(candidate);
  }

  throw new Error(
    'The deployed target has no checkout metadata and the Plesk Git mirror was not found; ' +
      'set PLESK_GIT_DIR to the read-only repository directory'
  );
}

function resolveMirrorCommit(gitDir, expectedBranch) {
  const refs = [
    `refs/heads/${expectedBranch}`,
    `refs/remotes/origin/${expectedBranch}`,
  ];
  const resolved = [];

  for (const ref of refs) {
    const result = gitResult(['--git-dir', gitDir, 'rev-parse', '--verify', `${ref}^{commit}`]);
    if (result.error || result.status !== 0) continue;
    resolved.push({ ref, releaseId: normalizeCommit(result.stdout, ref) });
  }

  if (resolved.length === 0) {
    throw new Error(`Plesk Git mirror does not contain branch ${expectedBranch}`);
  }
  const releaseIds = new Set(resolved.map(({ releaseId }) => releaseId));
  if (releaseIds.size !== 1) {
    throw new Error(
      `Plesk Git mirror branch ${expectedBranch} is inconsistent; Pull now must complete before Deploy now`
    );
  }
  return resolved[0].releaseId;
}

function gitBlobId(content, objectIdLength) {
  const algorithm = objectIdLength === 64 ? 'sha256' : 'sha1';
  return crypto
    .createHash(algorithm)
    .update(Buffer.from(`blob ${content.length}\0`))
    .update(content)
    .digest('hex');
}

function safeTrackedPath(rootDir, relativePath) {
  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.split('/').some((segment) => segment === '..')
  ) {
    throw new Error(`Git tree contains an unsafe path: ${relativePath}`);
  }
  const target = path.resolve(rootDir, relativePath);
  const rootPrefix = `${path.resolve(rootDir)}${path.sep}`;
  if (!target.startsWith(rootPrefix)) throw new Error(`Git tree path escapes the deployment target: ${relativePath}`);
  return target;
}

function assertTrackedTreeMatches(rootDir, gitDir, releaseId) {
  const result = gitResult(
    ['--git-dir', gitDir, 'ls-tree', '-rz', '--full-tree', releaseId],
    { encoding: null }
  );
  if (result.error) throw new Error(`Unable to inspect the Plesk Git tree: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`Unable to inspect the Plesk Git tree: ${String(result.stderr || '').trim()}`);
  }

  const records = result.stdout.toString('utf8').split('\0').filter(Boolean);
  if (records.length === 0) throw new Error('The selected Plesk Git commit has no tracked files');

  for (const record of records) {
    const separator = record.indexOf('\t');
    const metadata = separator >= 0 ? record.slice(0, separator) : '';
    const relativePath = separator >= 0 ? record.slice(separator + 1) : '';
    const match = /^([0-7]{6}) ([a-z]+) ([0-9a-f]{40}|[0-9a-f]{64})$/.exec(metadata);
    if (!match) throw new Error(`Unable to parse a tracked Git entry: ${metadata}`);

    const [, mode, type, expectedObjectId] = match;
    if (type !== 'blob' || !['100644', '100755', '120000'].includes(mode)) {
      throw new Error(`Unsupported tracked entry ${relativePath} (${mode} ${type})`);
    }

    const target = safeTrackedPath(rootDir, relativePath);
    let stat;
    try {
      stat = fs.lstatSync(target);
    } catch {
      throw new Error(`Tracked deployment file is missing: ${relativePath}`);
    }

    let content;
    if (mode === '120000') {
      if (!stat.isSymbolicLink()) throw new Error(`Tracked deployment symlink was replaced: ${relativePath}`);
      content = Buffer.from(fs.readlinkSync(target));
    } else {
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`Tracked deployment file has an invalid type: ${relativePath}`);
      }
      if (mode === '100755' && (stat.mode & 0o111) === 0) {
        throw new Error(`Tracked deployment file lost its executable permission: ${relativePath}`);
      }
      content = fs.readFileSync(target);
    }

    const actualObjectId = gitBlobId(content, expectedObjectId.length);
    if (actualObjectId !== expectedObjectId) {
      throw new Error(`Tracked deployment file does not match the selected commit: ${relativePath}`);
    }
  }
}

function verifyPleskSource(options = {}) {
  const rootDir = path.resolve(options.rootDir || PROJECT_ROOT);
  const expectedBranch = options.expectedBranch || process.env.PLESK_EXPECTED_BRANCH || 'main';
  const approvedSha = options.approvedSha ?? process.env.PLESK_APPROVED_SHA;
  const repositoryName =
    options.repositoryName || process.env.PLESK_REPOSITORY_NAME || DEFAULT_REPOSITORY_NAME;
  const explicitGitDir = options.gitDir ?? process.env.PLESK_GIT_DIR;

  assertValidBranch(expectedBranch);
  let result;
  if (checkoutAtRoot(rootDir)) {
    result = verifyCheckout(rootDir, expectedBranch);
  } else {
    const gitDir = resolvePleskGitDir(rootDir, explicitGitDir, repositoryName);
    const releaseId = resolveMirrorCommit(gitDir, expectedBranch);
    assertTrackedTreeMatches(rootDir, gitDir, releaseId);
    result = {
      branch: expectedBranch,
      gitDir,
      releaseId,
      sourceMode: 'plesk-mirror',
    };
  }

  if (approvedSha && result.releaseId !== normalizeCommit(approvedSha, 'PLESK_APPROVED_SHA')) {
    throw new Error('Plesk deployment source does not match PLESK_APPROVED_SHA');
  }
  return result;
}

function main() {
  try {
    const result = verifyPleskSource();
    process.stderr.write(
      `[plesk-source] Verified ${result.sourceMode}: ${result.branch} @ ${result.releaseId}\n`
    );
    process.stdout.write(`${result.releaseId}\n`);
  } catch (error) {
    process.stderr.write(`[plesk-source] ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  assertTrackedTreeMatches,
  verifyPleskSource,
};
