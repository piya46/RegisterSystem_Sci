const mongoose = require('mongoose');
const { mongoConnectionOptions } = require('../config/db');

async function connectMongoForMigration(uri) {
  if (!uri) throw new Error('MongoDB migration URI is required');
  return mongoose.connect(uri, mongoConnectionOptions({ autoIndex: false }));
}

module.exports = { connectMongoForMigration };
