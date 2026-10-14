/*
 * Interstitial gate (v1.1). Interstitials never show on launch, on exit, or during a
 * player's first session, and only after a completed level. A player must be on their
 * 2nd+ session AND have finished at least 5 levels in total before any interstitial;
 * ads.js then still applies its every-N-levels and 60 s pacing caps.
 */
(function (root) {
  'use strict';
  var KEY = 'ballsort.adgate.v1', MIN_SESSIONS = 2, MIN_LEVELS = 5;
  function read(store) { try { var s = JSON.parse(store.getItem(KEY) || 'null'); if (s && typeof s === 'object') return { sessions: s.sessions | 0, levels: s.levels | 0 }; } catch (e) {} return { sessions: 0, levels: 0 }; }
  function write(store, s) { try { store.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function allowed(s) { return s.sessions >= MIN_SESSIONS && s.levels >= MIN_LEVELS; }
  function make(store) {
    return {
      startSession: function () { var s = read(store); s.sessions++; write(store, s); return s; },
      levelDone: function () { var s = read(store); s.levels++; write(store, s); return s; },
      allow: function () { return allowed(read(store)); },
      state: function () { return read(store); }
    };
  }
  var api = { KEY: KEY, MIN_SESSIONS: MIN_SESSIONS, MIN_LEVELS: MIN_LEVELS, allowed: allowed, make: make };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.localStorage) { var g = make(root.localStorage); g.startSession(); root.AdGate = g; }
})(typeof window !== 'undefined' ? window : globalThis);
