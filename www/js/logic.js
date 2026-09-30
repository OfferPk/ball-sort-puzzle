/*
 * Ball Sort Puzzle - pure game logic (no DOM).
 * Works in the browser (window.BallSortLogic) and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BallSortLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CAPACITY = 4;
  var EMPTY_TUBES = 2;
  var MIN_COLORS = 3;
  var MAX_COLORS = 12;

  // Deterministic PRNG (mulberry32)
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Number of colors for a level: 3 at level 1, +1 every 3 levels, capped at 12. */
  function colorsForLevel(level) {
    return Math.min(MAX_COLORS, MIN_COLORS + Math.floor((level - 1) / 3));
  }

  function top(tube) { return tube.length ? tube[tube.length - 1] : -1; }

  /** Number of same-colored balls on top of a tube. */
  function topRun(tube) {
    if (!tube.length) return 0;
    var c = tube[tube.length - 1], n = 0;
    for (var i = tube.length - 1; i >= 0 && tube[i] === c; i--) n++;
    return n;
  }

  function isComplete(tube, cap) {
    cap = cap || CAPACITY;
    return tube.length === cap && topRun(tube) === cap;
  }

  /** How many balls would move from tube a to tube b (0 = illegal). */
  function pourCount(tubes, from, to, cap) {
    cap = cap || CAPACITY;
    if (from === to) return 0;
    var a = tubes[from], b = tubes[to];
    if (!a.length || b.length >= cap) return 0;
    if (b.length && top(b) !== top(a)) return 0;
    return Math.min(topRun(a), cap - b.length);
  }

  function canPour(tubes, from, to, cap) { return pourCount(tubes, from, to, cap) > 0; }

  /** Mutates tubes; returns number of balls moved. */
  function pour(tubes, from, to, cap) {
    var n = pourCount(tubes, from, to, cap);
    for (var i = 0; i < n; i++) tubes[to].push(tubes[from].pop());
    return n;
  }

  function isWon(tubes, cap) {
    cap = cap || CAPACITY;
    for (var i = 0; i < tubes.length; i++) {
      var t = tubes[i];
      if (t.length && !isComplete(t, cap)) return false;
    }
    return true;
  }

  function clone(tubes) { return tubes.map(function (t) { return t.slice(); }); }

  function key(tubes) {
    return tubes.map(function (t) { return t.join(','); }).sort().join('|');
  }

  /**
   * Depth-first solver with memoisation. Returns an array of [from,to] moves
   * or null if no solution was found within the node limit.
   */
  function solve(start, opts) {
    opts = opts || {};
    var cap = opts.capacity || CAPACITY;
    var limit = opts.nodeLimit || 150000;
    var seen = new Set();
    var tubes = clone(start);
    var path = [];
    var nodes = 0;

    function dfs() {
      if (isWon(tubes, cap)) return true;
      if (++nodes > limit) return false;
      var k = key(tubes);
      if (seen.has(k)) return false;
      seen.add(k);
      var n = tubes.length;
      // Prefer moves onto non-empty tubes (they make progress) before empties.
      for (var pass = 0; pass < 2; pass++) {
        var emptyTried = false;
        for (var i = 0; i < n; i++) {
          var a = tubes[i];
          if (!a.length || isComplete(a, cap)) continue;
          var uniform = topRun(a) === a.length;
          for (var j = 0; j < n; j++) {
            if (i === j) continue;
            var b = tubes[j];
            var toEmpty = b.length === 0;
            if ((pass === 0) === toEmpty) continue;
            if (toEmpty && (uniform || emptyTried)) continue; // pointless / symmetric
            var c = pourCount(tubes, i, j, cap);
            if (!c) continue;
            // Only pour the whole run, never leave part of a run behind uselessly
            // unless the target fills up.
            if (toEmpty) emptyTried = true;
            for (var m = 0; m < c; m++) b.push(a.pop());
            path.push([i, j]);
            if (dfs()) return true;
            path.pop();
            for (m = 0; m < c; m++) a.push(b.pop());
            if (nodes > limit) return false;
          }
          emptyTried = false;
        }
      }
      return false;
    }
    return dfs() ? path : null;
  }

  /** Score a completed run against targets derived from a verified solver path. */
  function starsForMoves(moves, targets) {
    if (typeof moves !== 'number' || !isFinite(moves) || Math.floor(moves) !== moves || moves < 1 ||
        !targets || typeof targets !== 'object') return 0;
    var one = targets.one, two = targets.two, three = targets.three;
    if ([one, two, three].some(function (value) {
      return typeof value !== 'number' || !isFinite(value) || Math.floor(value) !== value || value < 1;
    }) || three > two || two > one || two !== Math.floor(three * 1.5) || one !== Math.floor(three * 2)) return 0;
    if (moves <= three) return 3;
    if (moves <= two) return 2;
    if (moves <= one) return 1;
    return 0;
  }

  /**
   * Generate level N. Deterministic: the level number is the seed.
   * Balls are shuffled randomly, then verified with the solver; if a
   * candidate is not solvable (or is too trivial) a derived seed is tried.
   */
  function generateLevel(level) {
    level = Math.max(1, level | 0);
    var colors = colorsForLevel(level);
    for (var attempt = 0; attempt < 500; attempt++) {
      var rand = rng(level * 7919 + attempt * 104729 + 1);
      var balls = [];
      for (var c = 0; c < colors; c++) for (var k = 0; k < CAPACITY; k++) balls.push(c);
      for (var i = balls.length - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1));
        var tmp = balls[i]; balls[i] = balls[j]; balls[j] = tmp;
      }
      var tubes = [];
      for (c = 0; c < colors; c++) tubes.push(balls.slice(c * CAPACITY, (c + 1) * CAPACITY));
      for (var e = 0; e < EMPTY_TUBES; e++) tubes.push([]);
      // Reject boards that start with a finished tube or with 3-in-a-row tops.
      var bad = tubes.some(function (t) { return t.length && topRun(t) >= 3; });
      if (bad) continue;
      var sol = solve(tubes);
      if (sol && sol.length >= colors) {
        // The three-star limit is an achievable, solver-verified route for this
        // exact seeded board; the wider bands reward progressively looser play.
        var threeStarMoves = sol.length;
        return {
          level: level, colors: colors, capacity: CAPACITY, tubes: tubes,
          solutionLength: sol.length,
          moveTargets: { one: Math.floor(threeStarMoves * 2), two: Math.floor(threeStarMoves * 1.5), three: threeStarMoves },
          seedAttempt: attempt
        };
      }
    }
    throw new Error('Could not generate level ' + level);
  }

  return {
    CAPACITY: CAPACITY, EMPTY_TUBES: EMPTY_TUBES, MAX_COLORS: MAX_COLORS,
    rng: rng, colorsForLevel: colorsForLevel, topRun: topRun, isComplete: isComplete,
    pourCount: pourCount, canPour: canPour, pour: pour, isWon: isWon, clone: clone,
    solve: solve, starsForMoves: starsForMoves, generateLevel: generateLevel
  };
});
