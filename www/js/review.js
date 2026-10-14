/*
 * In-app review prompt (Google Play In-App Review API via @capacitor-community/in-app-review).
 * Only after the 3rd+ win, only from a post-win screen (never during play), at most once every 30 days.
 * Google decides whether the sheet is actually shown; we never ask for or reward a rating.
 */
(function (root) {
  'use strict';
  var MIN_WINS = 3, GAP_MS = 30 * 24 * 60 * 60 * 1000;
  function shouldAsk(state, wins, now) {
    if (!(wins >= MIN_WINS)) return false;
    var last = state && typeof state.last === 'number' ? state.last : 0;
    if (last > now) return true; // clock moved backwards: treat as stale
    return !last || now - last >= GAP_MS;
  }
  var Logic = { MIN_WINS: MIN_WINS, GAP_MS: GAP_MS, shouldAsk: shouldAsk };
  root.ReviewLogic = Logic;
  if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
  if (typeof document === 'undefined') return;
  function plugin() { return root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.InAppReview; }
  function native() { return !!(root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform()); }
  /** Call ONLY when a win/result screen is showing. Returns true if a request was made. */
  function maybe(key, wins) {
    var st = {}; try { st = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) {}
    var now = Date.now();
    if (!shouldAsk(st, wins, now)) return false;
    st.last = now; st.count = (st.count || 0) + 1;
    try { localStorage.setItem(key, JSON.stringify(st)); } catch (e) {}
    var p = plugin();
    if (native() && p && p.requestReview) { setTimeout(function () { p.requestReview().catch(function () {}); }, 1200); }
    return true;
  }
  root.Review = { maybe: maybe };
})(typeof window !== 'undefined' ? window : globalThis);
