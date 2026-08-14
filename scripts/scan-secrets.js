#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('../backend/node_modules/dotenv');

const ROOT = path.resolve(__dirname, '..');
const TEXT_EXTENSIONS = new Set([
  '', '.css', '.env', '.example', '.html', '.js', '.json', '.jsx', '.md',
  '.mjs', '.sh', '.sql', '.ts', '.tsx', '.txt', '.yaml', '.yml',
]);
const SENSITIVE_ENV_NAMES = [
  'BREVO_API_KEY',
  'CSRF_SECRET',
  'DATA_BLIND_INDEX_SECRET',
  'DATA_ENCRYPTION_KEY',
  'DATA_ENCRYPTION_KEYS',
  'FIELD_ENCRYPTION_KEY',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'JWT_SECRET',
  'KMS_WRAPPED_DATA_KEYS',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_LOGIN_CHANNEL_SECRET',
  'LINE_WEBHOOK_CHANNEL_SECRET',
  'MONGODB_URI',
  'OBJECT_STORAGE_LOCAL_SIGNING_SECRET',
  'SESSION_TOKEN_HASH_SECRET',
  'SLIP_PROOF_SECRET',
  'SENDGRID_API_KEY',
  'SMTP_PASS',
  'SQL_MIGRATION_PASSWORD',
  'SQL_MIRROR_IDENTITY_HASH_SECRET',
  'SQL_PASSWORD',
  'SQL_SSL_CA',
  'TURNSTILE_SECRET_KEY',
  'VENDOR_QR_SECRET',
];
const PRIVATE_KEY_MARKER = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ');
const SIGNATURES = [
  ['private-key', new RegExp(`-----BEGIN (?:RSA |EC |OPENSSH )?${PRIVATE_KEY_MARKER.slice(11)}`, 'g')],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ['credentialed-mongodb-uri', /mongodb(?:\+srv)?:\/\/[^\s:@/]+:[^\s@/]+@/gi],
  ['google-service-account-key', new RegExp(`"private_key"\\s*:\\s*"${PRIVATE_KEY_MARKER}`, 'g')],
];

function gitCandidateFiles() {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: ROOT,
    encoding: 'buffer',
  });
  if (result.status !== 0) throw new Error('Unable to enumerate Git candidate files');
  return result.stdout.toString('utf8').split('\0').filter(Boolean);
}

function lineNumber(content, offset) {
  return content.slice(0, offset).split('\n').length;
}

function readCandidateText(root, relativePath) {
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, relativePath);
  if (absolutePath !== absoluteRoot && !absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`Git candidate path escapes the repository: ${relativePath}`);
  }

  let stat;
  try {
    stat = fs.lstatSync(absolutePath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (stat.isSymbolicLink()) return fs.readlinkSync(absolutePath);
  if (!stat.isFile()) return null;
  return fs.readFileSync(absolutePath, 'utf8');
}

function localSecretValues() {
  const sourcePath = process.env.SECRET_SOURCE_FILE || path.join(ROOT, 'backend', '.env');
  if (!fs.existsSync(sourcePath)) return [];
  const values = dotenv.parse(fs.readFileSync(sourcePath));
  return SENSITIVE_ENV_NAMES
    .filter((name) => values[name] && !/^replace-with|^change-me|^example/i.test(values[name]))
    .map((name) => ({ name, value: String(values[name]) }))
    .filter(({ value }) => Buffer.byteLength(value, 'utf8') >= 8);
}

function main() {
  const findings = [];
  const localValues = localSecretValues();
  for (const relativePath of gitCandidateFiles()) {
    const extension = path.extname(relativePath).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    const content = readCandidateText(ROOT, relativePath);
    if (content === null) continue;

    for (const [kind, pattern] of SIGNATURES) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        findings.push({ kind, path: relativePath, line: lineNumber(content, match.index) });
      }
    }

    for (const { name, value } of localValues) {
      let offset = content.indexOf(value);
      while (offset !== -1) {
        findings.push({ kind: `local-env:${name}`, path: relativePath, line: lineNumber(content, offset) });
        offset = content.indexOf(value, offset + value.length);
      }
    }
  }

  if (findings.length > 0) {
    console.error('Secret scan failed. Values are redacted; findings:');
    for (const finding of findings) console.error(`- ${finding.kind} ${finding.path}:${finding.line}`);
    process.exitCode = 1;
    return;
  }
  console.log('Secret scan passed: no credential signatures or local secret values found in Git candidate files');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Secret scan failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  readCandidateText,
};
