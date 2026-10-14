// v1.1 meta layer unit tests: daily challenge seeding, coin rewards, save normalisation,
// interstitial first-session gate, achievement + shop data sanity, policy rules.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const W = p => path.join(__dirname, '..', 'www', p);
const ML = require(W('js/metakit.js'));
const Gate = require(W('js/adgate.js'));
const DailyLogic = require(W('js/daily.js'));
const Shop = require(W('js/shopcore.js'));

// --- challenge seeding: deterministic per date, varies across dates
const list = [{ id: 'a', test: () => true, count: 1 }, { id: 'b', test: d => d.stars >= 3, count: 1 }, { id: 'c', test: d => d.clean, count: 2 }];
assert.equal(ML.challengeFor('2026-10-14', list, 'x').id, ML.challengeFor('2026-10-14', list, 'x').id);
const seen = new Set(); for (let d = 1; d <= 28; d++) seen.add(ML.challengeFor('2026-11-' + String(d).padStart(2, '0'), list, 'ballsort').id);
assert.ok(seen.size >= 2, 'challenge should rotate');
// progress: counts only matching wins, resets on a new day
let r = ML.progressChallenge(null, 'D1', list[2], { clean: true }); assert.equal(r.prog.n, 1); assert.equal(r.done, false);
r = ML.progressChallenge(r.prog, 'D1', list[2], { clean: false }); assert.equal(r.prog.n, 1);
r = ML.progressChallenge(r.prog, 'D1', list[2], { clean: true }); assert.equal(r.done, true);
r = ML.progressChallenge(r.prog, 'D2', list[2], { clean: false }); assert.equal(r.prog.n, 0); assert.equal(r.prog.day, 'D2');
// coins: 10 + 5/star + 5 clean, clamped
assert.equal(ML.winCoins({ stars: 0 }), 10); assert.equal(ML.winCoins({ stars: 3, clean: true }), 30); assert.equal(ML.winCoins({ stars: 9 }), 25);
// normalise: junk -> safe defaults, never negative coins
assert.deepEqual(ML.normalize(null).coins, 0);
assert.equal(ML.normalize({ coins: -5 }).coins, 0);
assert.equal(ML.normalize({ coins: 12.7, owned: { ball: 'x' } }).coins, 12);
assert.deepEqual(ML.normalize({ owned: { ball: 'x' } }).owned.ball, []);

// --- interstitial gate: never in the first session, needs 5 finished levels
function mem() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; }
let st = mem(), g = Gate.make(st); g.startSession();
for (let i = 0; i < 20; i++) g.levelDone();
assert.equal(g.allow(), false, 'first session must never allow interstitials');
g.startSession(); assert.equal(g.allow(), true);
st = mem(); g = Gate.make(st); g.startSession(); g.startSession(); g.levelDone();
assert.equal(g.allow(), false, 'needs 5 lifetime levels');
st.setItem(Gate.KEY, '{broken'); assert.deepEqual(Gate.make(st).state(), { sessions: 0, levels: 0 });

// --- ads.js honours the gate (mocked native plugin)
const adsSrc = fs.readFileSync(W('js/ads.js'), 'utf8');
async function interstitialCount(gate, levels) {
  let shown = 0;
  const window = { ADS_CONFIG: { INTERSTITIAL_ID: 't', IS_TESTING: true, INTERSTITIAL_MIN_INTERVAL_MS: 0 }, AdGate: gate,
    Capacitor: { isNativePlatform: () => true, Plugins: { AdMob: { initialize: async () => {}, requestConsentInfo: async () => ({}), prepareInterstitial: async () => {}, showInterstitial: async () => { shown++; } } } } };
  vm.runInNewContext(adsSrc, { window, console: { warn() {} }, Date }, {});
  for (let i = 0; i < levels; i++) await window.Ads.showInterstitial();
  return shown;
}
(async () => {
  st = mem(); g = Gate.make(st); g.startSession();
  assert.equal(await interstitialCount(g, 12), 0, 'no interstitial in the first session');
  g.startSession();
  assert.ok(await interstitialCount(g, 6) >= 1, 'interstitial allowed later, after levels');
  // launch path: game.js only calls showInterstitial from nextLevel()
  const game = fs.readFileSync(W('js/game.js'), 'utf8');
  const calls = game.split('Ads.showInterstitial').length - 1;
  assert.equal(calls, 1); assert.ok(/function nextLevel\(\)[\s\S]{0,120}Ads\.showInterstitial/.test(game));

  // --- achievements + shop data
  const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(W('js/ach-defs.js'), 'utf8'), ctx);
  const defs = ctx.window.ACH_DEFS; const ids = new Set(defs.map(d => d.id));
  assert.equal(ids.size, defs.length); defs.forEach(d => { assert.ok(d.goal > 0 && d.reward > 0 && d.reward <= 250 && d.metric); });
  const cfgSrc = fs.readFileSync(W('js/meta-config.js'), 'utf8');
  const prices = [...cfgSrc.matchAll(/price: (\d+)/g)].map(m => +m[1]);
  assert.ok(prices.length >= 12 && prices.every(p => p >= 0 && p <= 600));
  assert.ok(/kind: 'ball'/.test(cfgSrc) && /kind: 'bg'/.test(cfgSrc));
  // finishes never change hue: only var(--c) based backgrounds for ball skins
  const css = fs.readFileSync(W('css/meta.css'), 'utf8');
  css.split('\n').filter(l => /^body\.ball-/.test(l)).forEach(l => assert.ok(/var\(--c\)/.test(l), 'finish keeps colour: ' + l.slice(0, 40)));
  // shop buy + trial
  const save = { coins: 100, trial: {} }, owned = [];
  assert.equal(Shop.buy(save, owned, { id: 'x', price: 150 }).ok, false); save.coins = 200;
  assert.equal(Shop.buy(save, owned, { id: 'x', price: 150 }).ok, true); assert.equal(save.coins, 50);
  Shop.startTrial(save, 'ball', 'neon'); assert.equal(Shop.trialActive(save, 'ball'), true);
  // daily calendar is 7 days
  assert.equal(DailyLogic.REWARDS.length, 7);
  // policy: no cash-out / betting / loot boxes / purchases of coins
  const ui = ['index.html', 'js/metakit.js', 'js/meta-config.js', 'js/ach-defs.js'].map(f => fs.readFileSync(W(f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')).join('\n').toLowerCase();
  ['withdraw', 'paypal', 'real money', 'loot box', 'lootbox', 'bet ', 'wager', 'gamble', 'buy coins'].forEach(w => assert.ok(!ui.includes(w), 'policy word: ' + w));
  // rewarded ads only via user taps (try / 2x / undo / tube buttons)
  assert.ok(!/showRewarded\(/.test(fs.readFileSync(W('js/metakit.js'), 'utf8')));
  console.log('ALL META TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });
