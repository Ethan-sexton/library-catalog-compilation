const MAX_AUTHORITY_MATCHES_PER_PARENT = 4;

function selectAuthorityMatches(rows, insertedIdentifiers) {
  const matchesByParent = new Map();
  for (const row of rows) {
    const [parentIdentifier] = row;
    if (!insertedIdentifiers.has(parentIdentifier)) continue;
    const parentMatches = matchesByParent.get(parentIdentifier) || [];
    parentMatches.push(row);
    matchesByParent.set(parentIdentifier, parentMatches);
  }

  const selected = [];
  for (const parentMatches of matchesByParent.values()) {
    parentMatches.sort((left, right) => right[1] - left[1]);
    selected.push(...parentMatches.slice(0, MAX_AUTHORITY_MATCHES_PER_PARENT));
  }
  return selected;
}

module.exports = { selectAuthorityMatches };
