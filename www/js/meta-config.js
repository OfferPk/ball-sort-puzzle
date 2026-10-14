/* Ball Sort Puzzle v1.1 meta wiring (cosmetic coins, daily, shop, awards, coach, accessibility). */
(function () {
  'use strict';
  var BS = window.__ballSort;
  if (!BS || !window.Meta) return;
  var SW = ['#e63946', '#3a86ff', '#ffbe0b', '#2a9d8f'];
  function ballThumb(it) {
    var w = document.createElement('div'); w.className = 'ball-prev ball-' + it.id;
    SW.forEach(function (c) { var b = document.createElement('div'); b.className = 'ball'; b.style.setProperty('--c', c); w.appendChild(b); });
    // finishes are body classes; scope the preview by wrapping a fake body class
    w.dataset.finish = it.id; return w;
  }
  function bgThumb(it) { var e = document.createElement('div'); e.className = 'bg-swatch bgx-' + it.id; return e; }
  function sfx(k) { var S = window.Sound; if (!S) return; if (k === 'coin') S.complete(); else if (k === 'error') S.error(); else S.click(); }
  function stars(level) { return (BS.state.bestStars && BS.state.bestStars[level]) || 0; }
  window.BALLSORT_META = {
    key: 'ballsort.meta.v1', salt: 'ballsort', barAfter: '.subbar', settingsAnchor: '#settings .row.buttons',
    sfx: sfx,
    toast: function (msg) { BS.toast(msg); },
    rewarded: function (ok) { window.Ads.showRewarded(ok); },
    closeSettings: function () { if (BS.activeModal() && BS.activeModal().id === 'settings') BS.hideModal('settings', false); },
    isFirstLevel: function () { return BS.state.level === 1 && BS.state.moves === 0; },
    beforeCoach: function () {},
    onA11y: function () { BS.render(); },
    howto: [
      'Tap a tube to pick up its top ball, then tap another tube to pour it in.',
      'A ball can only land on the same colour or in an empty tube. Each tube holds 4 balls.',
      'Sort every colour into its own tube to clear the level.',
      'Stuck? Use Undo (3 free per level), Hint, or watch an ad for +1 Tube.',
      'Fewer moves earn more stars, and every win earns cosmetic coins for the Skin Shop.',
      'Claim the Daily reward each day and finish the Daily challenge for bonus coins.'
    ],
    coach: [
      { target: '#board .tube', text: 'Tap a tube to pick up the top ball.' },
      { target: '#board', text: 'Then tap another tube to pour. Same colour or an empty tube only.' },
      { target: '#btn-undo', text: 'Made a mistake? Undo takes back your last pour.' },
      { target: '#btn-hint', text: 'Hint shows one good move without changing the board.' },
      { target: '#meta-bar', text: 'Daily rewards, the Skin Shop and your Awards live up here. Have fun!' }
    ],
    challenges: [
      { id: 'triple', title: 'Triple Star', desc: 'Earn 3 stars on any level', count: 1, test: function (d) { return d.stars >= 3; } },
      { id: 'three', title: 'Hat Trick', desc: 'Solve 3 levels', count: 3, test: function () { return true; } },
      { id: 'clean', title: 'No Help Needed', desc: 'Solve a level without Undo or +1 Tube', count: 1, test: function (d) { return d.clean; } },
      { id: 'five', title: 'Pour Marathon', desc: 'Solve 5 levels', count: 5, test: function () { return true; } },
      { id: 'twostar', title: 'Steady Hands', desc: 'Solve 2 levels with at least 2 stars', count: 2, test: function (d) { return d.stars >= 2; } }
    ],
    playChallenge: function () { var t = document.querySelector('#board .tube'); if (t) t.focus(); },
    achDefs: window.ACH_DEFS || [],
    stats: function (st) {
      var g = function (k) { return st.m[k] || 0; };
      return [['Levels won', String(g('wins'))], ['Highest level', String(Math.max(g('best_level'), BS.state.unlockedLevel - 1))],
        ['3-star clears', String(g('stars3'))], ['Help-free clears', String(g('clean_wins'))], ['Total pours', g('moves').toLocaleString('en-US')]];
    },
    shop: [
      { title: 'Ball finishes', kind: 'ball', prefix: 'ball-', thumb: ballThumb, items: [
        { id: 'gloss', name: 'Classic Gloss', price: 0 }, { id: 'matte', name: 'Soft Matte', price: 150 },
        { id: 'pearl', name: 'Pearl Sheen', price: 250 }, { id: 'candy', name: 'Candy Stripe', price: 300 },
        { id: 'marble', name: 'Marble Swirl', price: 350 }, { id: 'ring', name: 'Ringed Orb', price: 400 },
        { id: 'neon', name: 'Neon Glow', price: 500 }] },
      { title: 'Backgrounds', kind: 'bg', prefix: 'bgx-', thumb: bgThumb, items: [
        { id: 'none', name: 'Twilight', price: 0 }, { id: 'ocean', name: 'Deep Ocean', price: 150 },
        { id: 'forest', name: 'Pine Forest', price: 200 }, { id: 'sunset', name: 'Sunset Glow', price: 250 },
        { id: 'rose', name: 'Rose Dusk', price: 300 }, { id: 'slate', name: 'Calm Slate', price: 300 },
        { id: 'midnight', name: 'Midnight', price: 400 }] }
    ]
  };
  window.Meta.init(window.BALLSORT_META);
})();
