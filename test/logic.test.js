// Headless logic test: generates levels, checks determinism & solvability,
// then plays each level to completion using only legal moves.
const assert = require('assert');
const L = require('../www/js/logic.js');

const levels = [1, 2, 3, 5, 10, 15, 20, 25, 28, 30, 40, 50, 75, 100, 250, 500, 1000];
let t0 = Date.now();
for (const n of levels) {
  const s = Date.now();
  const a = L.generateLevel(n), b = L.generateLevel(n);
  assert.deepStrictEqual(a.tubes, b.tubes, 'level ' + n + ' deterministic');
  assert.strictEqual(a.tubes.length, a.colors + 2, 'two empty tubes');
  assert.ok(a.tubes.slice(-2).every(t => t.length === 0));
  // every color appears exactly 4 times
  const counts = {};
  a.tubes.flat().forEach(c => counts[c] = (counts[c] || 0) + 1);
  assert.ok(Object.values(counts).every(v => v === 4));
  assert.ok(!L.isWon(a.tubes));
  // play the solver's solution with the game's own rules
  const sol = L.solve(a.tubes, { nodeLimit: 500000 });
  assert.ok(sol, 'level ' + n + ' solvable');
  const tubes = L.clone(a.tubes);
  for (const [f, t] of sol) assert.ok(L.pour(tubes, f, t) > 0, 'legal move');
  assert.ok(L.isWon(tubes), 'level ' + n + ' solved');
  console.log(`level ${String(n).padStart(4)}: ${a.colors} colors, ${a.tubes.length} tubes, solved in ${sol.length} moves (gen ${Date.now() - s} ms)`);
}
// rule checks
const t = [[0, 1], [1], [], [2, 2, 2, 2]];
assert.strictEqual(L.pourCount(t, 0, 1), 1);   // same color
assert.strictEqual(L.pourCount(t, 0, 2), 1);   // empty
assert.strictEqual(L.pourCount(t, 1, 3), 0);   // full
assert.strictEqual(L.pourCount(t, 3, 0), 0);   // color mismatch
assert.ok(L.isWon([[1, 1, 1, 1], [], [0, 0, 0, 0]]));
assert.strictEqual(L.colorsForLevel(1), 3);
assert.strictEqual(L.colorsForLevel(1000), 12);
console.log(`All logic tests passed in ${Date.now() - t0} ms`);
