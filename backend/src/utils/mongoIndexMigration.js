function indexKeyMatches(index, expected) {
  const actualEntries = Object.entries(index?.key || {});
  const expectedEntries = Object.entries(expected || {});
  return actualEntries.length === expectedEntries.length
    && actualEntries.every(([key, direction], position) => (
      expectedEntries[position]?.[0] === key
      && expectedEntries[position]?.[1] === direction
    ));
}

function isLegacyFullUniqueNameIndex(index) {
  return index?.name === 'name_1'
    && index?.unique === true
    && indexKeyMatches(index, { name: 1 })
    && !index.partialFilterExpression;
}

module.exports = {
  indexKeyMatches,
  isLegacyFullUniqueNameIndex,
};
