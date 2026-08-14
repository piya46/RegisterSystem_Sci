const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mongoAutoIndexEnabled,
  mongoConnectionOptions,
} = require('../src/config/db');

test('MongoDB automatic index creation is disabled by default in production', () => {
  assert.equal(mongoAutoIndexEnabled({ NODE_ENV: 'production' }), false);
  assert.equal(mongoAutoIndexEnabled({ NODE_ENV: 'development' }), true);
  assert.equal(mongoConnectionOptions({ autoIndex: false }).autoIndex, false);
});

test('production rejects automatic index creation and malformed flags', () => {
  assert.throws(
    () => mongoAutoIndexEnabled({ NODE_ENV: 'production', MONGODB_AUTO_INDEX: 'true' }),
    /forbidden/
  );
  assert.throws(
    () => mongoAutoIndexEnabled({ NODE_ENV: 'development', MONGODB_AUTO_INDEX: 'sometimes' }),
    /true or false/
  );
});
