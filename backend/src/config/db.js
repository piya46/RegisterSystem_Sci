const mongoose = require('mongoose');

const state = {
  lastErrorCode: null,
};

function integerEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  const normalized = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(Math.max(normalized, min), max);
}

function mongoAutoIndexEnabled(env = process.env) {
  const raw = String(env.MONGODB_AUTO_INDEX ?? '').trim().toLowerCase();
  const production = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
  if (!raw) return !production;
  if (!['true', 'false'].includes(raw)) {
    throw new Error('MONGODB_AUTO_INDEX must be true or false');
  }
  const enabled = raw === 'true';
  if (production && enabled) {
    throw new Error('MONGODB_AUTO_INDEX=true is forbidden in production; use an approved index migration');
  }
  return enabled;
}

function mongoConnectionOptions({ autoIndex } = {}) {
  return {
    serverSelectionTimeoutMS: integerEnv('MONGODB_SERVER_SELECTION_TIMEOUT_MS', 10000, 1000, 120000),
    maxPoolSize: integerEnv('MONGODB_MAX_POOL_SIZE', 20, 1, 200),
    minPoolSize: integerEnv('MONGODB_MIN_POOL_SIZE', 0, 0, 50),
    autoIndex: typeof autoIndex === 'boolean' ? autoIndex : mongoAutoIndexEnabled(),
  };
}

const connectDB = async (options = {}) => {
  try {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
    await mongoose.connect(process.env.MONGODB_URI, mongoConnectionOptions(options));
    state.lastErrorCode = null;
    console.log('MongoDB connected!');
    return mongoose.connection;
  } catch (err) {
    state.lastErrorCode = err.code || 'MONGODB_CONNECT_FAILED';
    throw err;
  }
};

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

function mongoStatus() {
  return {
    connected: mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
    lastErrorCode: state.lastErrorCode,
  };
}

module.exports = connectDB;
module.exports.disconnectDB = disconnectDB;
module.exports.mongoAutoIndexEnabled = mongoAutoIndexEnabled;
module.exports.mongoConnectionOptions = mongoConnectionOptions;
module.exports.mongoStatus = mongoStatus;
