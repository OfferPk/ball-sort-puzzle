/*
 * MetaKit (v1.1 upgrade layer for Capacitor puzzle games): how-to card, coins wallet,
 * 7-day Daily reward + seeded Daily challenge, Skin Shop, Achievements + Stats,
 * first-level coach, accessibility settings. Coins are cosmetic only (never bought,
 * never cashed out, no loot boxes, no betting). Rewarded ads only from a tap.
 *
 *   MetaLogic.*            pure helpers (node-testable)
 *   Meta.init(cfg)         wires the UI; game calls Meta.win(d) / Meta.move() / Meta.start(d)
 */
(function (root) {
  'use strict';
  function dateKey(d) { d = d || new Date(); var m = d.getMonth() + 1, x = d.getDate(); return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (x < 10 ? '0' : '') + x; }
  function hash(s) { var h = 2166136261 >>> 0; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  /** today's challenge: same for every player (seeded by date + game salt) */
  function challengeFor(day, list, salt) { return list[hash(day + '|chal|' + (salt || '')) % list.length]; }
  /** progress the challenge with a win event; returns {n, done} */
  function progressChallenge(prog, day, ch, d) {
    if (!prog || prog.day !== day) { prog = { day: day, n: 0 }; }
    if (ch.test(d)) prog.n += 1;
    return { prog: prog, done: prog.n >= (ch.count || 1) };
  }
  /** coins for a win: base + per star, small bonus for a help-free solve. Cosmetic only. */
  function winCoins(d) { var s = Math.max(0, Math.min(3, d.stars | 0)); return 10 + 5 * s + (d.clean ? 5 : 0); }
  function freshMeta() { return { coins: 0, owned: {}, equip: {}, trial: {}, settings: {}, chal: null }; }
  function normalize(m) {
    var d = freshMeta();
    if (!m || typeof m !== 'object') return d;
    d.coins = typeof m.coins === 'number' && isFinite(m.coins) && m.coins >= 0 ? Math.floor(m.coins) : 0;
    ['owned', 'equip', 'trial', 'settings'].forEach(function (k) { if (m[k] && typeof m[k] === 'object') d[k] = m[k]; });
    Object.keys(d.owned).forEach(function (k) { if (!Array.isArray(d.owned[k])) d.owned[k] = []; });
    d.chal = m.chal && typeof m.chal === 'object' ? m.chal : null;
    return d;
  }
  var Logic = { dateKey: dateKey, hash: hash, challengeFor: challengeFor, progressChallenge: progressChallenge, winCoins: winCoins, normalize: normalize, freshMeta: freshMeta };
  root.MetaLogic = Logic;
  if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
  if (typeof document === 'undefined') return;

  /* ---------------- UI ---------------- */
  var cfg, m, ach, daily, KEY;
  function $(id) { return document.getElementById(id); }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) {} }
  function sfx(k) { try { if (cfg.sfx) cfg.sfx(k); } catch (e) {} }
  function toast(msg, ms) { if (cfg.toast) return cfg.toast(msg, ms); var t = $('toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, ms || 2000); }
  function say(msg) { if (root.SR && root.SR.say) root.SR.say(msg); }
  function wallet() { return cfg.wallet || { get: function () { return m.coins; }, add: function (n) { m.coins += n; persist(); } }; }
  function coins() { return wallet().get(); }
  function addCoins(n) { if (!n) return; wallet().add(n); refreshCoins(); if (ach) ach.sync(); }
  function refreshCoins() { Array.prototype.forEach.call(document.querySelectorAll('.meta-coins-val'), function (e) { e.textContent = coins(); }); }
  function rewarded(ok, fail) { if (cfg.rewarded) cfg.rewarded(ok, fail); else if (fail) fail(); }
  function overlay(id, label, inner) {
    var ov = document.createElement('div'); ov.id = id; ov.className = 'overlay hidden';
    ov.innerHTML = '<div class="panel" role="dialog" aria-modal="true" aria-label="' + label + '">' + inner + '</div>';
    document.body.appendChild(ov);
    Array.prototype.forEach.call(ov.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', function () { sfx('click'); close(ov); }); });
    return ov;
  }
  function open(ov) { ov.classList.remove('hidden'); ov.setAttribute('aria-hidden', 'false'); var f = ov.querySelector('button'); if (f) try { f.focus(); } catch (e) {} }
  function close(ov) { ov.classList.add('hidden'); ov.setAttribute('aria-hidden', 'true'); if (ov.onclose) ov.onclose(); }

  /* how to play */
  function buildHowto() {
    var items = cfg.howto.map(function (t, i) { return '<li><i>' + (i + 1) + '</i><span></span></li>'; }).join('');
    var ov = overlay('howto', 'How to play', '<div class="panel-head"><h3>How to play</h3><button class="icon-btn close" data-close aria-label="Close">✕</button></div><ol class="howto-list">' + items + '</ol><p class="note">Coins are cosmetic only: spend them on ball finishes and backgrounds. They can never be bought or cashed out.</p><div class="panel-actions"><button class="btn primary howto-go">Let\'s play</button></div>');
    Array.prototype.forEach.call(ov.querySelectorAll('.howto-list span'), function (s, i) { s.textContent = cfg.howto[i]; });
    ov.querySelector('.howto-go').addEventListener('click', function () { sfx('click'); close(ov); });
    ov.onclose = function () { try { localStorage.setItem(KEY + '.howto', '1'); } catch (e) {} if (ov._after) { var f = ov._after; ov._after = null; f(); } };
    return ov;
  }
  /* shop */
  function groups() {
    return cfg.shop.map(function (g) {
      m.owned[g.kind] = m.owned[g.kind] || [];
      if (m.equip[g.kind] == null) m.equip[g.kind] = g.items[0].id;
      return { title: g.title, kind: g.kind, field: 'eq_' + g.kind, owned: m.owned[g.kind], items: g.items, thumb: g.thumb };
    });
  }
  // ShopCore reads save[field] and save.coins; give it a live view onto the meta save
  function shopSave() {
    var v = { trial: m.trial };
    Object.defineProperty(v, 'coins', { get: function () { return coins(); }, set: function (n) { var d = n - coins(); if (cfg.wallet) cfg.wallet.add(d); else m.coins = n; } });
    cfg.shop.forEach(function (g) { Object.defineProperty(v, 'eq_' + g.kind, { get: function () { return m.equip[g.kind]; }, set: function (x) { m.equip[g.kind] = x; } }); });
    return v;
  }
  var sv;
  function applySkins() {
    var cl = document.body.classList;
    cfg.shop.forEach(function (g) {
      var id = root.ShopCore.current(sv, g.kind, 'eq_' + g.kind);
      Array.prototype.slice.call(cl).forEach(function (c) { if (c.indexOf(g.prefix) === 0) cl.remove(c); });
      if (id && id !== g.items[0].id) cl.add(g.prefix + id);
    });
  }
  function bought() { var n = 0; cfg.shop.forEach(function (g) { n += (m.owned[g.kind] || []).length; }); return n; }
  function renderShop() {
    root.ShopCore.render({ grid: $('shop-grid'), save: sv, groups: groups(), apply: function () { applySkins(); refreshCoins(); if (ach) ach.sync(); },
      persist: persist, toast: toast, sfx: sfx, rewarded: rewarded, needMsg: function (n) { return 'Need ' + n + ' more coins. Win levels to earn more.'; } });
    refreshCoins();
  }
  function buildShop() {
    var ov = overlay('shop', 'Skin shop', '<div class="panel-head"><h3>Skin Shop</h3><span class="meta-coins"><span class="coin-ico"></span><b class="meta-coins-val">0</b></span><button class="icon-btn close" data-close aria-label="Close">✕</button></div><p class="note">Cosmetic only. Tap a preview to try it on the board, or watch an ad to try any skin free for 24 hours.</p><div id="shop-grid" class="shop-grid"></div>');
    ov.classList.add('shop-overlay'); ov.querySelector('.panel').classList.add('shop-panel');
    ov.onclose = function () { if (root.ShopCore.endPreview()) applySkins(); if (root.A11y && root.A11y.previewBar && ov._bar) {} };
    return ov;
  }
  /* daily challenge */
  function todayCh() { return challengeFor(dateKey(), cfg.challenges, cfg.salt); }

  /* settings rows */
  function addA11yRows() {
    var host = cfg.settingsAnchor && document.querySelector(cfg.settingsAnchor); if (!host) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = '<p class="a11y-head">Accessibility</p>' +
      '<label class="row a11y-row"><span>Reduce motion<small>Follows your device until you change it</small></span><input type="checkbox" id="set-motion" class="switch" /></label>' +
      '<label class="row a11y-row"><span>Larger text</span><input type="checkbox" id="set-large" class="switch" /></label>' +
      '<label class="row a11y-row"><span>High contrast</span><input type="checkbox" id="set-contrast" class="switch" /></label>' +
      '<div class="row"><button class="small-btn" id="btn-howto-again" type="button">How to play</button><button class="small-btn" id="btn-tour-again" type="button">Replay tutorial</button></div>';
    while (wrap.firstChild) host.parentNode.insertBefore(wrap.firstChild, host);
  }
  var IDS = { reduceMotion: 'set-motion', largeText: 'set-large', contrast: 'set-contrast' };

  function runCoach(force) {
    if (!root.Coach || !cfg.coach) return;
    var go = function () { if (cfg.beforeCoach) cfg.beforeCoach(); root.Coach.run(KEY + '.coach', cfg.coach, { force: force, sfx: function () { sfx('click'); } }); };
    setTimeout(go, force ? 120 : 400);
  }

  var api = {
    init: function (c) {
      cfg = c; KEY = c.key;
      try { m = normalize(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { m = freshMeta(); }
      if (root.A11y) root.A11y.apply(m.settings);
      sv = shopSave();
      // bar
      var bar = document.createElement('nav'); bar.className = 'meta-bar'; bar.id = 'meta-bar'; bar.setAttribute('aria-label', 'Rewards and extras');
      bar.innerHTML = '<span class="meta-coins" aria-label="Coins"><span class="coin-ico" aria-hidden="true"></span><b class="meta-coins-val">0</b></span>' +
        '<button class="meta-btn" id="btn-daily" type="button"><span class="mi" aria-hidden="true">📅</span>Daily<i id="daily-dot" class="hidden" aria-hidden="true"></i></button>' +
        '<button class="meta-btn" id="btn-shop" type="button"><span class="mi" aria-hidden="true">🎨</span>Shop</button>' +
        '<button class="meta-btn" id="btn-awards" type="button"><span class="mi" aria-hidden="true">🏆</span>Awards</button>' +
        '<button class="meta-btn" id="btn-howto" type="button" aria-label="How to play"><span class="mi" aria-hidden="true">?</span></button>';
      var anchor = document.querySelector(c.barAfter); anchor.parentNode.insertBefore(bar, anchor.nextSibling);
      var how = buildHowto(), shop = buildShop();
      addA11yRows();
      ach = root.Achievements.create({ key: KEY + '.ach', defs: c.achDefs || [], addCoins: function (n) { addCoins(n); }, coins: coins, bought: bought, toast: toast, sfx: sfx, stats: c.stats });
      daily = root.Daily.create({
        key: KEY + '.daily', toast: toast, sfx: sfx, rewarded: rewarded, addCoins: addCoins,
        challenge: function () { var ch = todayCh(), n = m.chal && m.chal.day === dateKey() ? m.chal.n : 0; return { title: ch.title, desc: ch.desc + ((ch.count || 1) > 1 ? ' (' + Math.min(n, ch.count) + '/' + ch.count + ')' : ''), cta: 'Play now' }; },
        play: function () { if (c.playChallenge) c.playChallenge(todayCh()); },
        onEvent: function (t, d) { if (t === 'claim') { ach.bump('daily_claims'); ach.max('daily_best_day', d.day); } else { ach.bump('challenges'); ach.max('best_chal_streak', d.streak); } }
      });
      if (root.A11y) {
        root.A11y.bind(m.settings, persist, IDS, function () { if (c.onA11y) c.onA11y(); });
        if (root.A11y.previewBar) root.A11y.previewBar({ settings: m.settings, overlay: 'shop', rerender: function () { if (c.onA11y) c.onA11y(); }, sfx: function () { sfx('click'); } });
      }
      $('btn-daily').addEventListener('click', function () { sfx('click'); daily.open(); });
      $('btn-shop').addEventListener('click', function () { sfx('click'); renderShop(); open(shop); });
      $('btn-awards').addEventListener('click', function () { sfx('click'); ach.open(); });
      $('btn-howto').addEventListener('click', function () { sfx('click'); open(how); });
      var h2 = $('btn-howto-again'); if (h2) h2.addEventListener('click', function () { if (c.closeSettings) c.closeSettings(); open(how); });
      var t2 = $('btn-tour-again'); if (t2) t2.addEventListener('click', function () { if (c.closeSettings) c.closeSettings(); runCoach(true); });
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        ['howto', 'shop', 'daily', 'achievements'].forEach(function (id) { var o = $(id); if (o && !o.classList.contains('hidden')) { e.stopPropagation(); close(o); } });
      }, true);
      applySkins(); refreshCoins(); ach.sync(); daily.refresh();
      // first launch: how-to card, then the first-level coach
      var seen = false; try { seen = localStorage.getItem(KEY + '.howto') === '1'; } catch (e) {}
      var wantCoach = c.isFirstLevel && c.isFirstLevel();
      if (!seen && !c.noAutoHowto) { how._after = wantCoach ? function () { runCoach(false); } : null; open(how); }
      else if (wantCoach) runCoach(false);
      return api;
    },
    /** d: {level, moves, stars, clean, ...} */
    win: function (d) {
      var n = (cfg.winCoins || winCoins)(d);
      if (n) { addCoins(n); d.coins = n; }
      ach.bump('games'); ach.bump('wins');
      if (d.stars >= 3) ach.bump('stars3');
      if (d.clean) ach.bump('clean_wins');
      if (d.level) ach.max('best_level', d.level);
      if (cfg.onWinStats) cfg.onWinStats(ach, d);
      var ch = todayCh(), r = progressChallenge(m.chal, dateKey(), ch, d); m.chal = r.prog; persist();
      if (r.done && !daily.isDone()) daily.complete(); else daily.refresh();
      if (root.Review) root.Review.maybe(KEY + '.review', ach.get('wins'));
      say(n ? '+' + n + ' coins' : '');
      return n;
    },
    move: function () { if (ach) ach.bump('moves'); },
    coins: coins, addCoins: addCoins, persist: persist,
    state: function () { return m; }, ach: function () { return ach; }, daily: function () { return daily; },
    todayChallenge: todayCh, applySkins: applySkins, runCoach: runCoach,
    sync: function () { if (root.A11y) root.A11y.sync(m.settings, IDS); }
  };
  root.Meta = api;
})(typeof window !== 'undefined' ? window : globalThis);
