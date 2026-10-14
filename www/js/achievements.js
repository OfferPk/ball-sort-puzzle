/*
 * Achievements + Stats (offline, localStorage). Cosmetic coin rewards only; no ads here.
 *   AchLogic.*            pure helpers (node-testable)
 *   Achievements.create() home card + overlay (Achievements / Stats tabs)
 */
(function (root) {
  'use strict';
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dayIdx(k) { var p = String(k).split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
  function fresh() { return { m: {}, done: {}, coinsSeen: null, lastDay: null }; }
  function normalize(s) {
    var d = fresh();
    if (s && typeof s === 'object') {
      if (s.m && typeof s.m === 'object') Object.keys(s.m).forEach(function (k) { var v = +s.m[k]; if (isFinite(v) && v >= 0) d.m[k] = v; });
      if (s.done && typeof s.done === 'object') Object.keys(s.done).forEach(function (k) { if (s.done[k]) d.done[k] = 1; });
      if (typeof s.coinsSeen === 'number') d.coinsSeen = s.coinsSeen;
      if (typeof s.lastDay === 'string') d.lastDay = s.lastDay;
    }
    return d;
  }
  function get(s, k) { return s.m[k] || 0; }
  function bump(s, k, n) { s.m[k] = get(s, k) + (n == null ? 1 : n); return s.m[k]; }
  function max(s, k, v) { if (v > get(s, k)) s.m[k] = v; return s.m[k]; }
  /** lower-is-better record (e.g. fewest moves / fastest time); 0 = none yet */
  function min(s, k, v) { if (v > 0 && (!get(s, k) || v < get(s, k))) s.m[k] = v; return s.m[k]; }
  /** count a play day; keeps current + longest consecutive-day streak */
  function playDay(s, today) {
    if (s.lastDay === today) return;
    var gap = s.lastDay ? dayIdx(today) - dayIdx(s.lastDay) : 0;
    s.m.day_streak = gap === 1 ? get(s, 'day_streak') + 1 : 1;
    max(s, 'best_day_streak', s.m.day_streak);
    bump(s, 'days_played');
    s.lastDay = today;
  }
  function observeCoins(s, coins) {
    if (typeof coins !== 'number' || !isFinite(coins)) return 0;
    if (s.coinsSeen == null) { s.coinsSeen = coins; return 0; }
    var diff = coins - s.coinsSeen; s.coinsSeen = coins;
    if (diff > 0) { bump(s, 'coins_earned', diff); return diff; }
    return 0;
  }
  function progress(s, def) {
    var v = get(s, def.metric), p = def.lower ? (v > 0 && v <= def.goal ? 1 : 0) : Math.min(1, v / def.goal);
    return { value: v, pct: p, done: !!s.done[def.id] };
  }
  /** returns defs newly unlocked (marks them done) */
  function check(s, defs) {
    var out = [];
    defs.forEach(function (d) { if (!s.done[d.id] && progress(s, d).pct >= 1) { s.done[d.id] = 1; out.push(d); } });
    return out;
  }
  /** Shared achievements every puzzle game gets (daily, streak, shop collection, coins). */
  var COMMON = [
    { id: 'daily_first', name: 'Early Bird', desc: 'Claim a Daily reward', metric: 'daily_claims', goal: 1, reward: 20 },
    { id: 'daily_week', name: 'Full Week', desc: 'Reach day 7 of the Daily reward calendar', metric: 'daily_best_day', goal: 7, reward: 100 },
    { id: 'chal_first', name: 'Challenger', desc: 'Complete a Daily challenge', metric: 'challenges', goal: 1, reward: 25 },
    { id: 'chal_ten', name: 'Challenge Regular', desc: 'Complete 10 Daily challenges', metric: 'challenges', goal: 10, reward: 120 },
    { id: 'chal_streak', name: 'Hat Trick', desc: 'Complete Daily challenges 3 days in a row', metric: 'best_chal_streak', goal: 3, reward: 60 },
    { id: 'days_5', name: 'Habit Forming', desc: 'Play on 5 days in a row', metric: 'best_day_streak', goal: 5, reward: 75 },
    { id: 'shop_1', name: 'New Look', desc: 'Buy your first item in the Skin Shop', metric: 'bought', goal: 1, reward: 30 },
    { id: 'shop_5', name: 'Collector', desc: 'Own 5 bought Skin Shop items', metric: 'bought', goal: 5, reward: 150 },
    { id: 'coins_1k', name: 'Treasure Keeper', desc: 'Earn 1,000 coins in total', metric: 'coins_earned', goal: 1000, reward: 50 }
  ];
  var Logic = { dateKey: dateKey, fresh: fresh, normalize: normalize, get: get, bump: bump, max: max, min: min, playDay: playDay,
    observeCoins: observeCoins, progress: progress, check: check, COMMON: COMMON };
  root.AchLogic = Logic;
  if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
  if (typeof document === 'undefined') return;

  /* ---------------- UI ---------------- */
  function create(o) {
    var KEY = o.key, s, defs = COMMON.concat(o.defs || []);
    try { s = normalize(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { s = fresh(); }
    function persist() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
    var toast = o.toast || function () {}, sfx = o.sfx || function () {}, tab = 'ach', queue = [], showing = false, extra = {};

    var ov = document.createElement('div');
    ov.id = 'achievements'; ov.className = 'overlay hidden ach-overlay';
    ov.innerHTML = '<div class="panel ach-panel" role="dialog" aria-modal="true" aria-label="Achievements">' +
      '<div class="panel-head"><h3>Achievements</h3><button class="icon-btn close ach-x" aria-label="Close">✕</button></div>' +
      '<div class="ach-tabs"><button data-t="ach" class="on">Achievements</button><button data-t="stats">Stats</button></div>' +
      '<div class="ach-body"></div></div>';
    (document.getElementById('app') || document.body).appendChild(ov);
    var body = ov.querySelector('.ach-body');
    ov.querySelector('.ach-x').addEventListener('click', function () { sfx('click'); ov.classList.add('hidden'); });
    Array.prototype.forEach.call(ov.querySelectorAll('.ach-tabs button'), function (b) {
      b.addEventListener('click', function () { sfx('click'); tab = b.dataset.t; render(); });
    });
    function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
    function render() {
      Array.prototype.forEach.call(ov.querySelectorAll('.ach-tabs button'), function (b) { b.classList.toggle('on', b.dataset.t === tab); });
      body.innerHTML = '';
      if (tab === 'ach') {
        var n = defs.filter(function (d) { return s.done[d.id]; }).length;
        var sum = document.createElement('p'); sum.className = 'ach-sum'; sum.textContent = n + ' / ' + defs.length + ' unlocked'; body.appendChild(sum);
        defs.slice().sort(function (a, b) { return (s.done[a.id] ? 1 : 0) - (s.done[b.id] ? 1 : 0); }).forEach(function (d) {
          var p = progress(s, d), r = document.createElement('div');
          r.className = 'ach-row' + (p.done ? ' done' : '');
          var shown = d.lower ? (p.value ? fmt(p.value) : '—') + ' (need ≤ ' + fmt(d.goal) + ')' : fmt(Math.min(p.value, d.goal)) + ' / ' + fmt(d.goal);
          r.innerHTML = '<div class="ach-top"><b></b><span class="ach-rw"><span class="coin-ico"></span>' + d.reward + '</span></div>' +
            '<small></small><div class="ach-bar"><i style="width:' + Math.round((p.done ? 1 : p.pct) * 100) + '%"></i></div><em class="ach-v"></em>';
          r.querySelector('b').textContent = (p.done ? '✓ ' : '') + d.name;
          r.querySelector('small').textContent = d.desc;
          r.querySelector('.ach-v').textContent = p.done ? 'Unlocked' : shown;
          body.appendChild(r);
        });
      } else if (extra[tab]) {
        extra[tab].render(body);
      } else {
        var rows = [['Games played', fmt(get(s, 'games'))]].concat(o.stats ? o.stats(s) : []).concat([
          ['Total coins earned', fmt(get(s, 'coins_earned'))],
          ['Longest play streak', fmt(get(s, 'best_day_streak')) + (get(s, 'best_day_streak') === 1 ? ' day' : ' days')],
          ['Daily challenges done', fmt(get(s, 'challenges'))],
          ['Days played', fmt(get(s, 'days_played'))]]);
        var t = document.createElement('div'); t.className = 'stats-tbl';
        rows.forEach(function (rw) { var e = document.createElement('div'); e.className = 'stat-row'; e.innerHTML = '<span></span><b></b>'; e.firstChild.textContent = rw[0]; e.lastChild.textContent = rw[1]; t.appendChild(e); });
        body.appendChild(t);
      }
      var sub = document.getElementById('ach-card-sub');
      if (sub) sub.textContent = defs.filter(function (d) { return s.done[d.id]; }).length + ' / ' + defs.length + ' unlocked';
    }
    function nextToast() {
      if (showing || !queue.length) return;
      showing = true; var d = queue.shift();
      setTimeout(function () { toast('🏆 ' + d.name + ' unlocked! +' + d.reward + ' coins', 2400); sfx('coin'); }, 900);
      setTimeout(function () { showing = false; nextToast(); }, 3400);
    }
    function sync() {
      if (o.coins) observeCoins(s, o.coins());
      if (o.bought) s.m.bought = o.bought();
      playDay(s, dateKey());
      var got = check(s, defs);
      persist();
      if (got.length) {
        var total = 0; got.forEach(function (d) { total += d.reward; queue.push(d); });
        o.addCoins(total);
        if (o.coins) observeCoins(s, o.coins()); // rewards count as earned
        persist(); nextToast();
      }
      if (!ov.classList.contains('hidden')) render(); else { var sub = document.getElementById('ach-card-sub'); if (sub) render(); }
      return got;
    }
    var api = {
      /** v1.7: extra tab (e.g. weekly crests) rendered into the same overlay */
      addTab: function (id, label, renderFn) {
        if (extra[id]) return; extra[id] = { render: renderFn };
        var b = document.createElement('button'); b.dataset.t = id; b.textContent = label;
        ov.querySelector('.ach-tabs').appendChild(b);
        b.addEventListener('click', function () { sfx('click'); tab = id; render(); });
      },
      openTab: function (id) { tab = id; sync(); render(); ov.classList.remove('hidden'); },
      bump: function (k, n) { bump(s, k, n); return sync(); },
      max: function (k, v) { max(s, k, v); return sync(); },
      min: function (k, v) { min(s, k, v); return sync(); },
      get: function (k) { return get(s, k); },
      sync: sync,
      open: function () { tab = 'ach'; sync(); render(); ov.classList.remove('hidden'); },
      state: function () { return s; }, defs: defs
    };
    setTimeout(sync, 0);
    return api;
  }
  root.Achievements = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
