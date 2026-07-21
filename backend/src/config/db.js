const mongoose = require('mongoose');

const state = {
  lastErrorCode: null,
};

function integerEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  const normalized = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(Math.max(normalized, min), max);
}

const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: integerEnv('MONGODB_SERVER_SELECTION_TIMEOUT_MS', 10000, 1000, 120000),
      maxPoolSize: integerEnv('MONGODB_MAX_POOL_SIZE', 20, 1, 200),
      minPoolSize: integerEnv('MONGODB_MIN_POOL_SIZE', 0, 0, 50),
    });
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
module.exports.mongoStatus = mongoStatus;
