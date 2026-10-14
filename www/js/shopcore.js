/*
 * Skin Shop core (cosmetic only; coins are earned in-game, never bought or cashed out, no loot boxes).
 * Free 24h try: a rewarded ad the player starts by tapping "Try 24h". Pure helpers, node-testable.
 */
(function (root) {
  'use strict';
  var TRIAL_MS = 24 * 60 * 60 * 1000;
  /** Shared background overlays (layered over the theme's own background). */
  var BACKGROUNDS = [
    { id: 'none', name: 'Theme default', price: 0 },
    { id: 'starlit', name: 'Starlit Night', price: 150 },
    { id: 'waves', name: 'Soft Waves', price: 250 },
    { id: 'prism', name: 'Prism Glow', price: 400 }
  ];
  function trialActive(save, kind, now) {
    var t = save.trial && save.trial[kind];
    return !!(t && typeof t.until === 'number' && t.until > (now || Date.now()) && t.until - (now || Date.now()) <= TRIAL_MS);
  }
  function effective(save, kind, field, now) {
    return trialActive(save, kind, now) ? save.trial[kind].id : save[field];
  }
  function startTrial(save, kind, id, now) {
    save.trial = save.trial && typeof save.trial === 'object' ? save.trial : {};
    save.trial[kind] = { id: id, until: (now || Date.now()) + TRIAL_MS };
    return save.trial[kind];
  }
  function trialLeft(save, kind, now) {
    if (!trialActive(save, kind, now)) return 0;
    return save.trial[kind].until - (now || Date.now());
  }
  function fmtLeft(ms) { var h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000); return h + 'h ' + m + 'm'; }
  /** buy: returns {ok, reason}. Mutates save.coins and the owned list. */
  function buy(save, ownedList, item) {
    if (ownedList.indexOf(item.id) >= 0) return { ok: true, already: true };
    if (save.coins < item.price) return { ok: false, reason: 'coins', need: item.price - save.coins };
    save.coins -= item.price; ownedList.push(item.id);
    return { ok: true };
  }
  var api = { TRIAL_MS: TRIAL_MS, BACKGROUNDS: BACKGROUNDS, trialActive: trialActive, effective: effective,
    startTrial: startTrial, trialLeft: trialLeft, fmtLeft: fmtLeft, buy: buy };
  root.ShopCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof document === 'undefined') return;
  /* ---------------- UI ---------------- */
  var preview = {};
  /** current(save, kind, field): preview > active 24h trial > equipped */
  function current(save, kind, field) { return preview[kind] || effective(save, kind, field); }
  function endPreview() { var had = Object.keys(preview).length > 0; preview = {}; return had; }
  /**
   * render(o): o.grid, o.save, o.groups [{ title, kind, field, owned (array), items, thumb(item) -> Element }],
   *   o.apply(), o.toast(msg), o.sfx(kind), o.rewarded(onOk, onFail) (rewarded ad; only from the Try tap), o.needMsg(n)
   */
  function render(o) {
    var save = o.save, grid = o.grid; grid.innerHTML = '';
    o.groups.forEach(function (g) {
      var h = document.createElement('div'); h.className = 'shop-sec'; h.textContent = g.title; grid.appendChild(h);
      g.items.forEach(function (it) {
        var owned = it.price === 0 || g.owned.indexOf(it.id) >= 0;
        var equipped = save[g.field] === it.id;
        var trial = trialActive(save, g.kind) && save.trial[g.kind].id === it.id;
        var d = document.createElement('div');
        d.className = 'item' + (g.itemClass ? ' ' + g.itemClass(it) : '') + (equipped ? ' selected' : '') + (preview[g.kind] === it.id ? ' previewing' : '');
        var prev = document.createElement('div'); prev.className = 'prev'; prev.title = 'Preview';
        prev.appendChild(g.thumb(it)); d.appendChild(prev);
        prev.addEventListener('click', function () {
          o.sfx('click');
          if (preview[g.kind] === it.id) delete preview[g.kind]; else preview[g.kind] = it.id;
          o.apply(); render(o);
          if (preview[g.kind]) o.toast('Previewing ' + it.name + '. Close the shop to go back.', 1600);
        });
        var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = it.name; d.appendChild(nm);
        if (trial) { var tt = document.createElement('span'); tt.className = 'trial-tag'; tt.textContent = 'Trial · ' + fmtLeft(trialLeft(save, g.kind)) + ' left'; d.appendChild(tt); }
        var b = document.createElement('button'); b.className = 'buy';
        if (equipped && !trialActive(save, g.kind)) b.textContent = 'Equipped';
        else if (owned) { b.textContent = 'Equip'; b.classList.add('can'); }
        else { b.innerHTML = '<span class="coin-ico"></span>' + it.price; if (save.coins >= it.price) b.classList.add('can'); }
        b.addEventListener('click', function () {
          if (!owned) {
            var r = buy(save, g.owned, it);
            if (!r.ok) { o.sfx('error'); o.toast(o.needMsg ? o.needMsg(r.need) : 'Need ' + r.need + ' more coins'); return; }
            o.sfx('coin');
          } else o.sfx('click');
          save[g.field] = it.id;
          if (save.trial) delete save.trial[g.kind];
          delete preview[g.kind];
          o.persist(); o.apply(); render(o);
        });
        d.appendChild(b);
        if (!owned && !trial && o.rewarded) {
          var t = document.createElement('button'); t.className = 'try rewarded'; t.innerHTML = 'Try 24h free <em class="ad-badge">▶ AD</em>';
          t.addEventListener('click', function () {
            o.sfx('click');
            o.rewarded(function () {
              startTrial(save, g.kind, it.id); delete preview[g.kind];
              o.persist(); o.apply(); render(o); o.toast(it.name + ' unlocked for 24 hours');
            }, function () { o.toast('No ad available right now. Try again in a moment.'); });
          });
          d.appendChild(t);
        }
        grid.appendChild(d);
      });
    });
  }
  function applyBg(save) {
    var id = current(save, 'bg', 'bg'), cl = document.body.classList;
    Array.prototype.slice.call(cl).forEach(function (c) { if (/^bg-/.test(c)) cl.remove(c); });
    if (id && id !== 'none') cl.add('bg-' + id);
  }
  function bgThumb(it) { var e = document.createElement('div'); e.className = 'bg-swatch bg-' + it.id; return e; }
  api.current = current; api.endPreview = endPreview; api.render = render; api.applyBg = applyBg; api.bgThumb = bgThumb;
})(typeof window !== 'undefined' ? window : globalThis);
