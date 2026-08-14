const test = require('node:test');
const assert = require('node:assert/strict');
const {
  participantCategoryBreakdown,
} = require('../src/utils/participantCategoryBreakdown');

test('participant category breakdown preserves dashboard count semantics', () => {
  const rows = participantCategoryBreakdown([
    { fields: { dept: 'Chemistry' }, status: 'registered', followers: 2 },
    { fields: { dept: 'Chemistry' }, status: 'checkedIn', followers: 1 },
    { fields: { department: 'Physics' }, status: 'cancelled', followers: 3 },
    { fields: { dept: '' }, status: 'registered', followers: 99 },
  ], {
    fieldNames: ['dept', 'department'],
    outputKey: 'department',
  });

  assert.deepEqual(rows, [
    {
      department: 'Chemistry',
      registered: 2,
      checkedIn: 1,
      cancelled: 0,
      followerRegistered: 3,
      followerCheckedIn: 1,
      totalRegisteredPeople: 5,
      totalCheckedInPeople: 2,
    },
    {
      department: 'Physics',
      registered: 1,
      checkedIn: 0,
      cancelled: 1,
      followerRegistered: 3,
      followerCheckedIn: 0,
      totalRegisteredPeople: 4,
      totalCheckedInPeople: 0,
    },
  ]);
});

test('participant category breakdown rejects an invalid grouping contract', () => {
  assert.throws(
    () => participantCategoryBreakdown([], { fieldNames: [], outputKey: 'year' }),
    /fieldNames/
  );
  assert.throws(
    () => participantCategoryBreakdown([], { fieldNames: ['date_year'] }),
    /outputKey/
  );
});
