const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('./config');

const rootDir = path.resolve(__dirname, '..');
const requiredFiles = Object.freeze([
  'app.js',
  'package.json',
  'package-lock.json',
  'public/index.html',
]);
const requiredModules = Object.freeze([
  'express',
  'helmet',
  'http-proxy-middleware',
]);

function moduleInstalled(moduleName) {
  try {
    require.resolve(moduleName, { paths: [rootDir] });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  const runtimeSupported = (major === 22 && minor >= 22) || major === 24;
  const files = Object.fromEntries(requiredFiles.map((relativePath) => [
    relativePath,
    fs.existsSync(path.join(rootDir, relativePath)),
  ]));
  const dependencies = Object.fromEntries(requiredModules.map((moduleName) => [
    moduleName,
    moduleInstalled(moduleName),
  ]));
  const report = {
    ready: false,
    node: {
      version: process.versions.node,
      supported: runtimeSupported,
    },
    files,
    dependencies,
    environment: {
      production: String(process.env.NODE_ENV || '').toLowerCase() === 'production',
      publicHostConfigured: Boolean(process.env.PUBLIC_HOSTS || process.env.PUBLIC_HOST),
      upstreamOriginConfigured: Boolean(process.env.UPSTREAM_ORIGIN),
      passengerPortProvided: Boolean(process.env.PORT),
    },
  };

  try {
    const config = loadConfig(process.env, { rootDir });
    report.releaseId = config.releaseId;
    report.configurationValid = true;
  } catch (error) {
    report.configurationValid = false;
    report.configurationError = error.message;
  }

  report.ready = runtimeSupported
    && Object.values(files).every(Boolean)
    && Object.values(dependencies).every(Boolean)
    && report.configurationValid;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ready) process.exitCode = 1;
}

main();
