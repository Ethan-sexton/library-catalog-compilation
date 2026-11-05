const test = require('node:test');
const assert = require('node:assert/strict');
const { selectAuthorityMatches } = require('../src/importHelpers');

test('selects up to four highest-confidence matches per newly inserted parent', () => {
  const rows = [
    ['new-a', 20, 'candidate-1'],
    ['new-b', 50, 'candidate-2'],
    ['new-a', 95, 'candidate-3'],
    ['existing', 99, 'candidate-4'],
    ['new-a', 80, 'candidate-5'],
    ['new-b', 75, 'candidate-6'],
    ['new-a', 60, 'candidate-7'],
    ['new-a', 70, 'candidate-8'],
  ];

  const selected = selectAuthorityMatches(rows, new Set(['new-a', 'new-b']));

  assert.deepEqual(
    selected.filter(([parent]) => parent === 'new-a').map(([, confidence]) => confidence),
    [95, 80, 70, 60]
  );
  assert.deepEqual(
    selected.filter(([parent]) => parent === 'new-b').map(([, confidence]) => confidence),
    [75, 50]
  );
  assert.equal(selected.length, 6);
  assert.equal(selected.some(([parent]) => parent === 'existing'), false);
});
