function normalizedFollowers(value) {
  const followers = Number(value);
  return Number.isFinite(followers) && followers > 0 ? Math.floor(followers) : 0;
}

function categoryValue(participant, fieldNames) {
  for (const fieldName of fieldNames) {
    const value = participant?.fields?.[fieldName];
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return null;
}

function participantCategoryBreakdown(participants, {
  fieldNames,
  outputKey,
}) {
  if (!Array.isArray(fieldNames) || fieldNames.length === 0) {
    throw new Error('fieldNames must contain at least one participant field');
  }
  if (!outputKey) throw new Error('outputKey is required');

  const groups = new Map();
  for (const participant of participants || []) {
    const value = categoryValue(participant, fieldNames);
    if (!value) continue;

    const row = groups.get(value) || {
      [outputKey]: value,
      registered: 0,
      checkedIn: 0,
      cancelled: 0,
      followerRegistered: 0,
      followerCheckedIn: 0,
      totalRegisteredPeople: 0,
      totalCheckedInPeople: 0,
    };
    const followers = normalizedFollowers(participant.followers);
    row.registered += 1;
    row.followerRegistered += followers;
    if (participant.status === 'checkedIn') {
      row.checkedIn += 1;
      row.followerCheckedIn += followers;
    }
    if (participant.status === 'cancelled') row.cancelled += 1;
    row.totalRegisteredPeople = row.registered + row.followerRegistered;
    row.totalCheckedInPeople = row.checkedIn + row.followerCheckedIn;
    groups.set(value, row);
  }

  return [...groups.values()].sort((left, right) => (
    String(left[outputKey]).localeCompare(String(right[outputKey]), 'th')
  ));
}

module.exports = {
  participantCategoryBreakdown,
};
