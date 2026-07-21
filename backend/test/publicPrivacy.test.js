const test = require('node:test');
const assert = require('node:assert/strict');
const {
  bucketTimestamp,
  coarsenCategoryCounts,
  maskDisplayName,
} = require('../src/utils/publicPrivacy');

test('public report masks names and buckets exact check-in time', () => {
  assert.equal(maskDisplayName('สมชาย ใจดี'), 'ส***');
  assert.equal(maskDisplayName(''), 'ไม่ระบุ');
  assert.equal(
    bucketTimestamp('2026-07-17T12:14:59.000Z', 15),
    '2026-07-17T12:00:00.000Z'
  );
});

test('public aggregate combines categories below the privacy threshold', () => {
  assert.deepEqual(
    coarsenCategoryCounts({ Chemistry: 5, Physics: 2, Biology: 1 }, 3),
    [
      { name: 'Chemistry', count: 5 },
      { name: 'อื่น ๆ', count: 3 },
    ]
  );
});
