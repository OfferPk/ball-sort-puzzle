/*
 * Daily Reward + Daily Challenge (fully offline, localStorage, local device date).
 * Rewards are cosmetic coins only: no betting, cash-out or loot boxes.
 * The optional "2x with ad" is a rewarded ad shown ONLY when the player taps it.
 *
 *   DailyLogic.*         pure helpers (node-testable)
 *   Daily.create(opts)   wires the home "Daily" card + overlay
 */
(function (root) {
  'use strict';
  var REWARDS = [10, 15, 20, 30, 40, 60, 100];
  var CHALLENGE_REWARD = 25;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dayIndex(key) { var p = String(key).split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
  function daysBetween(a, b) { return dayIndex(b) - dayIndex(a); }
  function seedFor(key, salt) {
    var s = String(key) + '|' + (salt || ''), h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function fresh() { return { lastClaim: null, streak: 0, done: {}, cStreak: 0, cLast: null }; }
  function normalize(s) {
    var d = fresh();
    if (s && typeof s === 'object') {
      if (typeof s.lastClaim === 'string') d.lastClaim = s.lastClaim;
      if (s.streak >= 0 && s.streak <= 7) d.streak = s.streak | 0;
      if (s.done && typeof s.done === 'object') d.done = s.done;
      if (s.cStreak >= 0) d.cStreak = s.cStreak | 0;
      if (typeof s.cLast === 'string') d.cLast = s.cLast;
    }
    // keep only recent completion records
    var keys = Object.keys(d.done).sort(); while (keys.length > 40) delete d.done[keys.shift()];
    return d;
  }
  /** What the calendar looks like today. day = 1..7 slot to claim (or claimed). */
  function status(s, today) {
    if (s.lastClaim === today) return { claimed: true, day: s.streak, reward: REWARDS[s.streak - 1] };
    var cont = s.lastClaim && daysBetween(s.lastClaim, today) === 1;
    var day = cont ? (s.streak % 7) + 1 : 1;
    return { claimed: false, day: day, reward: REWARDS[day - 1], broken: !!s.lastClaim && !cont };
  }
  function claim(s, today) {
    var st = status(s, today);
    if (st.claimed) return { ok: false, coins: 0 };
    s.streak = st.day; s.lastClaim = today;
    return { ok: true, coins: st.reward, day: st.day };
  }
  function completeChallenge(s, today) {
    if (s.done[today]) return { ok: false, coins: 0 };
    s.done[today] = 1;
    s.cStreak = (s.cLast && daysBetween(s.cLast, today) === 1) ? s.cStreak + 1 : 1;
    s.cLast = today;
    return { ok: true, coins: CHALLENGE_REWARD, streak: s.cStreak };
  }
  function challengeStreak(s, today) {
    if (!s.cLast) return 0;
    var g = daysBetween(s.cLast, today);
    return g <= 1 ? s.cStreak : 0;
  }
  var Logic = { REWARDS: REWARDS, CHALLENGE_REWARD: CHALLENGE_REWARD, dateKey: dateKey, daysBetween: daysBetween, seedFor: seedFor,
    fresh: fresh, normalize: normalize, status: status, claim: claim, completeChallenge: completeChallenge, challengeStreak: challengeStreak };
  root.DailyLogic = Logic;
  if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
  if (typeof document === 'undefined') return;

  /* ---------------- UI ---------------- */
  function create(o) {
    var KEY = o.key, s;
    try { s = normalize(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { s = fresh(); }
    function persist() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
    function today() { return dateKey(new Date()); }
    var toast = o.toast || function () {}, sfx = o.sfx || function () {};

    var ov = document.createElement('div');
    ov.id = 'daily'; ov.className = 'overlay hidden daily-overlay';
    ov.innerHTML =
      '<div class="panel daily-panel" role="dialog" aria-modal="true" aria-label="Daily">' +
      '<div class="panel-head"><h3>Daily</h3><button class="icon-btn close daily-x" aria-label="Close">✕</button></div>' +
      '<p class="daily-sub">Daily reward</p><div class="daily-cal"></div>' +
      '<div class="daily-actions"><button class="btn primary daily-claim"></button>' +
      '<button class="btn plate rewarded daily-2x">2x reward <em class="ad-badge">▶ AD</em></button></div>' +
      '<p class="daily-sub">Daily challenge</p><div class="daily-ch"><b class="daily-ch-t"></b><span class="daily-ch-s"></span></div>' +
      '<div class="daily-actions"><button class="btn primary daily-play"></button></div>' +
      '<p class="note daily-note">Cosmetic coins only. Miss a day and the reward streak starts again at day 1.</p></div>';
    (document.getElementById('app') || document.body).appendChild(ov);
    var q = function (c) { return ov.querySelector(c); };
    var lastClaimCoins = 0, doubledFor = null;

    function render() {
      var t = today(), st = status(s, t), cal = q('.daily-cal');
      cal.innerHTML = '';
      for (var i = 1; i <= 7; i++) {
        var c = document.createElement('div');
        var got = st.claimed ? i <= st.day : i < st.day;
        c.className = 'daily-day' + (got ? ' got' : '') + (i === st.day && !st.claimed ? ' now' : '');
        c.innerHTML = '<small>Day ' + i + '</small><b>' + REWARDS[i - 1] + '</b><span class="coin-ico"></span>';
        cal.appendChild(c);
      }
      var cb = q('.daily-claim');
      cb.disabled = st.claimed;
      cb.textContent = st.claimed ? 'Claimed · come back tomorrow' : 'Claim ' + st.reward + ' coins';
      q('.daily-2x').classList.toggle('hidden', !(st.claimed && doubledFor !== t && lastClaimCoins > 0 && o.rewarded));
      var ch = o.challenge(t), done = !!s.done[t], cs = challengeStreak(s, t);
      q('.daily-ch-t').textContent = ch.title;
      q('.daily-ch-s').textContent = (done ? '✓ Completed today' : ch.desc + ' · +' + CHALLENGE_REWARD + ' coins') + (cs ? ' · streak ' + cs : '');
      var pb = q('.daily-play'); pb.textContent = done ? 'Completed ✓' : (ch.cta || 'Play challenge'); pb.disabled = done;
      var badge = document.getElementById('daily-dot');
      var extra = api && api._extraDot ? api._extraDot() : null;
      if (badge) badge.classList.toggle('hidden', st.claimed && done && !(extra && extra.dot));
      var sub = document.getElementById('daily-card-sub');
      if (sub) sub.textContent = !st.claimed ? 'Reward ready' : (!done ? 'Challenge open' : (extra && extra.dot ? extra.text : 'All done today'));
    }
    q('.daily-x').addEventListener('click', function () { sfx('click'); ov.classList.add('hidden'); });
    q('.daily-claim').addEventListener('click', function () {
      var r = claim(s, today()); if (!r.ok) return;
      persist(); o.addCoins(r.coins); lastClaimCoins = r.coins; sfx('coin');
      toast('Day ' + r.day + ' reward: +' + r.coins + ' coins'); render();
      if (o.onEvent) o.onEvent('claim', { day: r.day });
    });
    q('.daily-2x').addEventListener('click', function () {
      var t = today(); if (doubledFor === t || !lastClaimCoins) return;
      sfx('click');
      o.rewarded(function () {
        doubledFor = t; o.addCoins(lastClaimCoins); sfx('coin'); toast('Doubled: +' + lastClaimCoins + ' coins'); render();
      }, function () { toast('No ad available right now. Try again in a moment.'); });
    });
    q('.daily-play').addEventListener('click', function () { sfx('click'); ov.classList.add('hidden'); o.play(today()); });

    var api = {
      open: function () { render(); ov.classList.remove('hidden'); },
      refresh: render,
      today: today,
      isDone: function (t) { return !!s.done[t || today()]; },
      /** game calls this when today's challenge is met */
      complete: function (forDate) {
        var t = today();
        if (forDate && forDate !== t) return false;
        var r = completeChallenge(s, t); if (!r.ok) return false;
        persist(); o.addCoins(r.coins); sfx('coin');
        toast('Daily challenge complete! +' + r.coins + ' coins', 2600); render();
        if (o.onEvent) o.onEvent('challenge', { streak: r.streak });
        return true;
      },
      state: function () { return s; },
      /** v1.7: fn() -> {dot:bool, text:string}; lets the weekly challenge light the card dot mid-week */
      setExtraDot: function (fn) { api._extraDot = fn; render(); }
    };
    render();
    return api;
  }
  root.Daily = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
