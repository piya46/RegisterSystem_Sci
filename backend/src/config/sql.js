const mysql = require('mysql2/promise');
const net = require('node:net');
const tls = require('node:tls');
const { boolEnv, recordCloudUsage } = require('../utils/cloudCostGuardrail');

const APPROVED_PLESK_SQL_HOST = '203.170.190.137';

let pool = null;
const state = {
  connected: false,
  connectedAt: null,
  lastErrorCode: null,
  tlsActive: null,
  transport: null,
};

function integerEnv(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(process.env[name]);
  const normalized = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(Math.max(normalized, min), max);
}

function sqlEnabled() {
  return boolEnv('SQL_ENABLED', false);
}

function sqlPrimaryStore() {
  return boolEnv('SQL_PRIMARY_STORE', false);
}

function normalizedSslMode() {
  return String(
    process.env.SQL_SSL_MODE || (process.env.NODE_ENV === 'production' ? 'verify_identity' : 'disabled')
  ).toLowerCase();
}

function productionPlaintextExceptionEnabled() {
  return process.env.NODE_ENV === 'production'
    && boolEnv('SQL_ALLOW_INSECURE_PRODUCTION', false)
    && normalizedSslMode() === 'disabled'
    && String(process.env.SQL_PROVIDER || '').trim().toLowerCase() === 'plesk'
    && String(process.env.SQL_HOST || '').trim() === APPROVED_PLESK_SQL_HOST
    && String(process.env.SQL_EXPECTED_HOST || '').trim() === APPROVED_PLESK_SQL_HOST;
}

function validHost(value) {
  const host = String(value || '').trim();
  if (!host || host.length > 253) return false;
  if (net.isIP(host)) return true;
  if (/[\s/:@]/.test(host)) return false;
  return host.split('.').every((label) => (
    label.length > 0
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ));
}

function requireProductionConfirmation(name, message) {
  if (!boolEnv(name, false)) throw new Error(message || `${name}=true is required for production SQL`);
}

function retryableSqlConnectionError(error) {
  return new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ETIMEDOUT',
    'HANDSHAKE_INACTIVITY_TIMEOUT',
    'PROTOCOL_CONNECTION_LOST',
    'PROTOCOL_SEQUENCE_TIMEOUT',
  ]).has(String(error?.code || ''));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertSqlConfiguration() {
  if (sqlPrimaryStore()) {
    throw new Error(
      'SQL_PRIMARY_STORE=true is not implemented; MongoDB must remain the primary store until every domain repository and cutover test is complete'
    );
  }
  if (boolEnv('SQL_EVENT_REGISTRATION_PRIMARY', false) && !sqlEnabled()) {
    throw new Error('SQL_EVENT_REGISTRATION_PRIMARY=true requires SQL_ENABLED=true');
  }
  if (!sqlEnabled()) {
    return;
  }

  const dialect = String(process.env.SQL_DIALECT || 'mariadb').toLowerCase();
  if (!['mariadb', 'mysql'].includes(dialect)) {
    throw new Error('SQL_DIALECT must be mariadb or mysql');
  }
  for (const name of ['SQL_DATABASE', 'SQL_USER', 'SQL_PASSWORD']) {
    if (!process.env[name]) throw new Error(`${name} is required when SQL_ENABLED=true`);
  }
  const usesSocket = Boolean(String(process.env.SQL_SOCKET_PATH || '').trim());
  const host = String(process.env.SQL_HOST || '').trim();
  if (!usesSocket && !host) throw new Error('SQL_HOST or SQL_SOCKET_PATH is required when SQL is enabled');
  if (!usesSocket && !validHost(host)) throw new Error('SQL_HOST must be a hostname or IP address without a scheme, path, or port');
  const sslMode = normalizedSslMode();
  if (!['disabled', 'required', 'verify_ca', 'verify_identity'].includes(sslMode)) {
    throw new Error('SQL_SSL_MODE must be disabled, required, verify_ca, or verify_identity');
  }
  const servername = String(process.env.SQL_SSL_SERVERNAME || '').trim();
  if (servername && (!validHost(servername) || net.isIP(servername))) {
    throw new Error('SQL_SSL_SERVERNAME must be the DNS name present in the MariaDB certificate');
  }
  if (process.env.NODE_ENV === 'production') {
    const plaintextException = productionPlaintextExceptionEnabled();
    if (boolEnv('SQL_ALLOW_UNVERIFIED_TLS', false)) {
      throw new Error('SQL unverified TLS overrides are forbidden in production');
    }
    if (boolEnv('SQL_ALLOW_INSECURE_PRODUCTION', false) && !usesSocket && !plaintextException) {
      throw new Error(
        `SQL_ALLOW_INSECURE_PRODUCTION is restricted to disabled TLS on Plesk ${APPROVED_PLESK_SQL_HOST}`
      );
    }
    if (!usesSocket && !plaintextException && sslMode !== 'verify_identity') {
      throw new Error('SQL_SSL_MODE must be verify_identity for production TCP connections');
    }
    if (!usesSocket && !plaintextException && !String(process.env.SQL_SSL_CA || '').trim()) {
      throw new Error('SQL_SSL_CA is required for production TCP connections');
    }
    if (!usesSocket && !plaintextException
        && String(process.env.SQL_SSL_CA_SECRET_NAME || '').trim() !== 'SQL_SSL_CA') {
      throw new Error('SQL_SSL_CA_SECRET_NAME must be SQL_SSL_CA so the pinned CA is loaded from Secret Manager');
    }
    if (!usesSocket && !plaintextException
        && net.isIP(host) && !servername && !boolEnv('SQL_SSL_IP_SAN_CONFIRMED', false)) {
      throw new Error('An IP SQL_HOST requires SQL_SSL_SERVERNAME or SQL_SSL_IP_SAN_CONFIRMED=true');
    }

    requireProductionConfirmation(
      'SQL_AT_REST_ENCRYPTION_CONFIRMED',
      'SQL_AT_REST_ENCRYPTION_CONFIRMED=true is required after Plesk storage encryption is verified'
    );
    requireProductionConfirmation(
      'SQL_BACKUP_ENCRYPTION_CONFIRMED',
      'SQL_BACKUP_ENCRYPTION_CONFIRMED=true is required after encrypted backup and restore are verified'
    );

    const provider = String(process.env.SQL_PROVIDER || '').trim().toLowerCase();
    if (!['plesk', 'cloud_sql', 'self_managed', 'other'].includes(provider)) {
      throw new Error('SQL_PROVIDER must identify the production database provider');
    }
    if (!usesSocket && provider === 'plesk') {
      const expectedHost = String(process.env.SQL_EXPECTED_HOST || '').trim();
      if (host !== APPROVED_PLESK_SQL_HOST || expectedHost !== APPROVED_PLESK_SQL_HOST) {
        throw new Error(`Plesk SQL endpoint must be the approved host ${APPROVED_PLESK_SQL_HOST}`);
      }
      if (!plaintextException) {
        requireProductionConfirmation(
          'SQL_STATIC_EGRESS_ENABLED',
          'SQL_STATIC_EGRESS_ENABLED=true is required before Cloud Run connects to Plesk MariaDB'
        );
        requireProductionConfirmation(
          'SQL_NETWORK_ALLOWLIST_CONFIRMED',
          'SQL_NETWORK_ALLOWLIST_CONFIRMED=true is required after Plesk allowlists the Cloud NAT IP'
        );
      }
    }

    if (boolEnv('SQL_MIRROR_ENABLED', false)) {
      requireProductionConfirmation(
        'SQL_MIRROR_REQUIRE_PROTECTED_VALUES',
        'SQL_MIRROR_REQUIRE_PROTECTED_VALUES=true is required for production SQL mirror data'
      );
    }
  }
}

function sslOptions() {
  const mode = normalizedSslMode();
  if (mode === 'disabled') return undefined;
  if (!['required', 'verify_ca', 'verify_identity'].includes(mode)) {
    throw new Error('SQL_SSL_MODE must be disabled, required, verify_ca, or verify_identity');
  }

  const ca = String(process.env.SQL_SSL_CA || '').replace(/\\n/g, '\n').trim();
  if (['verify_ca', 'verify_identity'].includes(mode) && !ca) {
    throw new Error(`SQL_SSL_CA is required when SQL_SSL_MODE=${mode}`);
  }
  const servername = String(process.env.SQL_SSL_SERVERNAME || '').trim();
  const identity = servername || String(process.env.SQL_HOST || '').trim();
  return {
    rejectUnauthorized: mode !== 'required',
    minVersion: 'TLSv1.2',
    ...(ca ? { ca } : {}),
    ...(servername ? { servername } : {}),
    ...(mode === 'verify_ca' ? { checkServerIdentity: () => undefined } : {}),
    ...(mode === 'verify_identity' ? {
      checkServerIdentity: (_hostname, certificate) => tls.checkServerIdentity(identity, certificate),
    } : {}),
  };
}

function poolConfig() {
  const poolMax = integerEnv('SQL_POOL_MAX', 5, { min: 1, max: 50 });
  const socketPath = String(process.env.SQL_SOCKET_PATH || '').trim();
  return {
    ...(socketPath
      ? { socketPath }
      : {
        host: process.env.SQL_HOST,
        port: integerEnv('SQL_PORT', 3306, { min: 1, max: 65535 }),
      }),
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    charset: 'utf8mb4',
    timezone: 'Z',
    connectTimeout: integerEnv('SQL_CONNECT_TIMEOUT_MS', 5000, { min: 1000, max: 60000 }),
    connectionLimit: poolMax,
    maxIdle: poolMax,
    idleTimeout: integerEnv('SQL_POOL_IDLE_TIMEOUT_MS', 60000, { min: 1000, max: 3600000 }),
    waitForConnections: true,
    queueLimit: integerEnv('SQL_QUEUE_LIMIT', 100, { min: 0, max: 10000 }),
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    multipleStatements: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
    ssl: socketPath ? undefined : sslOptions(),
  };
}

async function verifyConnectionTransport(connection) {
  if (String(process.env.SQL_SOCKET_PATH || '').trim()) {
    return { transport: 'socket', tlsActive: false };
  }
  if (normalizedSslMode() === 'disabled') {
    return { transport: 'tcp_plain', tlsActive: false };
  }

  const [rows] = await connection.query({
    sql: "SHOW SESSION STATUS LIKE 'Ssl_cipher'",
    timeout: integerEnv('SQL_QUERY_TIMEOUT_MS', 10000, { min: 1000, max: 60000 }),
  });
  const cipher = Array.isArray(rows) && rows.length > 0
    ? String(rows[0].Value || rows[0].VALUE || rows[0].value || '').trim()
    : '';
  if (!cipher) {
    const error = new Error('MariaDB connection did not negotiate TLS');
    error.code = 'SQL_TLS_NOT_ACTIVE';
    throw error;
  }
  return { transport: 'tcp_tls', tlsActive: true };
}

async function warmSqlPool(candidate, warmCount) {
  const warmConnections = [];
  try {
    for (let index = 0; index < warmCount; index += 1) {
      warmConnections.push(await candidate.getConnection());
    }
    const transportChecks = String(process.env.SQL_SOCKET_PATH || '').trim() || normalizedSslMode() === 'disabled' ? 0 : 1;
    recordCloudUsage('sqlReads', warmCount * (1 + transportChecks), { optional: false });
    return await Promise.all(warmConnections.map(async (connection) => {
      await connection.query({
        sql: 'SELECT 1 AS health_check',
        timeout: integerEnv('SQL_QUERY_TIMEOUT_MS', 10000, { min: 1000, max: 60000 }),
      });
      return verifyConnectionTransport(connection);
    }));
  } finally {
    for (const connection of warmConnections) connection.release();
  }
}

async function connectSQL() {
  assertSqlConfiguration();
  if (!sqlEnabled()) return { enabled: false, connected: false };
  if (pool && state.connected) return sqlStatus();

  const candidate = mysql.createPool(poolConfig());
  const poolMin = integerEnv('SQL_POOL_MIN', 0, { min: 0, max: integerEnv('SQL_POOL_MAX', 5, { min: 1, max: 50 }) });
  const warmCount = Math.max(1, poolMin);
  const maxAttempts = integerEnv(
    'SQL_CONNECT_MAX_ATTEMPTS',
    process.env.NODE_ENV === 'production' ? 6 : 1,
    { min: 1, max: 10 }
  );
  const retryBaseMs = integerEnv('SQL_CONNECT_RETRY_BASE_MS', 1000, { min: 100, max: 10000 });

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const transports = await warmSqlPool(candidate, warmCount);
      pool = candidate;
      state.connected = true;
      state.connectedAt = new Date().toISOString();
      state.lastErrorCode = null;
      state.tlsActive = transports.every(({ tlsActive }) => tlsActive);
      state.transport = transports[0]?.transport || null;
      return sqlStatus();
    } catch (error) {
      state.connected = false;
      state.lastErrorCode = error.code || 'SQL_CONNECT_FAILED';
      state.tlsActive = null;
      state.transport = null;
      if (!retryableSqlConnectionError(error) || attempt >= maxAttempts) {
        await candidate.end().catch(() => {});
        throw error;
      }
      const backoffMs = Math.min(retryBaseMs * (2 ** (attempt - 1)), 10000);
      const jitterMs = Math.floor(Math.random() * Math.max(1, Math.floor(backoffMs / 4)));
      console.warn(`[SQL] Transient connection failure (${error.code}); retrying attempt ${attempt + 1}/${maxAttempts}`);
      await sleep(backoffMs + jitterMs);
    }
  }

  await candidate.end().catch(() => {});
  throw new Error('SQL connection attempts exhausted');
}

function requirePool() {
  if (!sqlEnabled()) throw new Error('SQL is disabled');
  if (!pool || !state.connected) throw new Error('SQL connection pool is not ready');
  return pool;
}

function queryOptions(sql, timeoutMs) {
  if (typeof sql !== 'string' || !sql.trim()) throw new Error('SQL statement is required');
  return {
    sql,
    timeout: timeoutMs || integerEnv('SQL_QUERY_TIMEOUT_MS', 10000, { min: 1000, max: 60000 }),
  };
}

function recordSqlOperation(operation) {
  const metric = operation === 'write' ? 'sqlWrites' : 'sqlReads';
  recordCloudUsage(metric, 1, { optional: false });
}

async function executeSql(sql, params = [], { operation = 'read', timeoutMs } = {}) {
  if (!['read', 'write'].includes(operation)) throw new Error('SQL operation must be read or write');
  const activePool = requirePool();
  recordSqlOperation(operation);
  const [rows, fields] = await activePool.execute(queryOptions(sql, timeoutMs), params);
  return { rows, fields };
}

async function withSqlTransaction(work) {
  if (typeof work !== 'function') throw new Error('SQL transaction callback is required');
  const connection = await requirePool().getConnection();
  try {
    await connection.beginTransaction();
    const transaction = {
      executeRead: async (sql, params = [], options = {}) => {
        recordSqlOperation('read');
        const [rows, fields] = await connection.execute(queryOptions(sql, options.timeoutMs), params);
        return { rows, fields };
      },
      executeWrite: async (sql, params = [], options = {}) => {
        recordSqlOperation('write');
        const [rows, fields] = await connection.execute(queryOptions(sql, options.timeoutMs), params);
        return { rows, fields };
      },
    };
    const result = await work(transaction);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function closeSQL() {
  const activePool = pool;
  pool = null;
  state.connected = false;
  state.connectedAt = null;
  state.tlsActive = null;
  state.transport = null;
  if (activePool) await activePool.end();
}

function sqlStatus() {
  return {
    enabled: sqlEnabled(),
    primaryStore: sqlPrimaryStore(),
    connected: state.connected,
    connectedAt: state.connectedAt,
    lastErrorCode: state.lastErrorCode,
    tlsActive: state.tlsActive,
    transport: state.transport,
  };
}

module.exports = {
  APPROVED_PLESK_SQL_HOST,
  assertSqlConfiguration,
  closeSQL,
  connectSQL,
  executeSql,
  productionPlaintextExceptionEnabled,
  retryableSqlConnectionError,
  sslOptions,
  sqlEnabled,
  sqlStatus,
  withSqlTransaction,
};
