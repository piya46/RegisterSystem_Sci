const mysql = require('mysql2/promise');
const { boolEnv, recordCloudUsage } = require('../utils/cloudCostGuardrail');

let pool = null;
const state = {
  connected: false,
  connectedAt: null,
  lastErrorCode: null,
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

function assertSqlConfiguration() {
  if (!sqlEnabled()) {
    if (sqlPrimaryStore()) throw new Error('SQL_PRIMARY_STORE=true requires SQL_ENABLED=true');
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
  if (!usesSocket && !process.env.SQL_HOST) throw new Error('SQL_HOST or SQL_SOCKET_PATH is required when SQL is enabled');
  const sslMode = String(process.env.SQL_SSL_MODE || 'verify_identity').toLowerCase();
  if (process.env.NODE_ENV === 'production') {
    if (sslMode === 'disabled' && !usesSocket && !boolEnv('SQL_ALLOW_INSECURE_PRODUCTION', false)) {
      throw new Error('SQL_SSL_MODE cannot be disabled in production');
    }
    if (sslMode === 'required' && !boolEnv('SQL_ALLOW_UNVERIFIED_TLS', false)) {
      throw new Error('SQL_SSL_MODE=required needs SQL_ALLOW_UNVERIFIED_TLS=true in production');
    }
  }
  if (sqlPrimaryStore() && !boolEnv('SQL_PRIMARY_STORE_ACKNOWLEDGED', false)) {
    throw new Error('SQL_PRIMARY_STORE=true requires SQL_PRIMARY_STORE_ACKNOWLEDGED=true');
  }
}

function sslOptions() {
  const mode = String(process.env.SQL_SSL_MODE || (process.env.NODE_ENV === 'production' ? 'verify_identity' : 'disabled')).toLowerCase();
  if (mode === 'disabled') return undefined;
  if (!['required', 'verify_ca', 'verify_identity'].includes(mode)) {
    throw new Error('SQL_SSL_MODE must be disabled, required, verify_ca, or verify_identity');
  }

  const ca = String(process.env.SQL_SSL_CA || '').replace(/\\n/g, '\n').trim();
  if (['verify_ca', 'verify_identity'].includes(mode) && !ca) {
    throw new Error(`SQL_SSL_CA is required when SQL_SSL_MODE=${mode}`);
  }
  return {
    rejectUnauthorized: mode !== 'required',
    ...(ca ? { ca } : {}),
    ...(mode === 'verify_ca' ? { checkServerIdentity: () => undefined } : {}),
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

async function connectSQL() {
  assertSqlConfiguration();
  if (!sqlEnabled()) return { enabled: false, connected: false };
  if (pool && state.connected) return sqlStatus();

  const candidate = mysql.createPool(poolConfig());
  const poolMin = integerEnv('SQL_POOL_MIN', 0, { min: 0, max: integerEnv('SQL_POOL_MAX', 5, { min: 1, max: 50 }) });
  const warmConnections = [];
  let connectError = null;
  try {
    const warmCount = Math.max(1, poolMin);
    recordCloudUsage('sqlReads', warmCount, { optional: false });
    for (let index = 0; index < warmCount; index += 1) {
      warmConnections.push(await candidate.getConnection());
    }
    await Promise.all(warmConnections.map((connection) => connection.query({
      sql: 'SELECT 1 AS health_check',
      timeout: integerEnv('SQL_QUERY_TIMEOUT_MS', 10000, { min: 1000, max: 60000 }),
    })));
    pool = candidate;
    state.connected = true;
    state.connectedAt = new Date().toISOString();
    state.lastErrorCode = null;
  } catch (error) {
    state.connected = false;
    state.lastErrorCode = error.code || 'SQL_CONNECT_FAILED';
    connectError = error;
  } finally {
    for (const connection of warmConnections) connection.release();
  }
  if (connectError) {
    await candidate.end().catch(() => {});
    throw connectError;
  }
  return sqlStatus();
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
  if (activePool) await activePool.end();
}

function sqlStatus() {
  return {
    enabled: sqlEnabled(),
    primaryStore: sqlPrimaryStore(),
    connected: state.connected,
    connectedAt: state.connectedAt,
    lastErrorCode: state.lastErrorCode,
  };
}

module.exports = {
  assertSqlConfiguration,
  closeSQL,
  connectSQL,
  executeSql,
  sqlEnabled,
  sqlStatus,
  withSqlTransaction,
};
