function maskDisplayName(value) {
  const characters = Array.from(String(value || '').trim());
  return characters.length > 0 ? `${characters[0]}***` : 'ไม่ระบุ';
}

function bucketTimestamp(value, bucketMinutes = 15) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const safeMinutes = Math.min(Math.max(Number(bucketMinutes) || 15, 1), 60);
  const bucketMs = safeMinutes * 60 * 1000;
  return new Date(Math.floor(date.getTime() / bucketMs) * bucketMs).toISOString();
}

function coarsenCategoryCounts(counts = {}, minimumGroupSize = 3, otherLabel = 'อื่น ๆ') {
  const threshold = Math.min(Math.max(Number(minimumGroupSize) || 3, 2), 20);
  let otherCount = 0;
  const visible = [];
  for (const [name, rawCount] of Object.entries(counts || {})) {
    const count = Math.max(0, Number(rawCount) || 0);
    if (count < threshold) otherCount += count;
    else visible.push({ name: String(name), count });
  }
  if (otherCount > 0) visible.push({ name: otherLabel, count: otherCount });
  return visible.sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

module.exports = {
  bucketTimestamp,
  coarsenCategoryCounts,
  maskDisplayName,
};
