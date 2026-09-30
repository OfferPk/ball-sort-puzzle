// Contract tests for the AdMob wrapper using a mocked Capacitor plugin.
// These verify JavaScript reward-gating only; they do not run the Android SDK.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'www', 'js', 'ads.js'), 'utf8');

function makeEnvironment({ native = true, emitReward = false, result = null, failShow = false } = {}) {
  const calls = { initialize: 0, listeners: [], prepared: 0, shown: 0, removed: 0 };
  let rewardListener = null;
  const adMob = {
    initialize: async () => { calls.initialize++; },
    requestConsentInfo: async () => ({}),
    addListener: async (name, listener) => {
      calls.listeners.push(name);
      rewardListener = listener;
      return { remove: () => { calls.removed++; rewardListener = null; } };
    },
    prepareRewardVideoAd: async () => { calls.prepared++; },
    showRewardVideoAd: async () => {
      calls.shown++;
      if (emitReward && rewardListener) rewardListener({ amount: 3, type: 'undo' });
      if (failShow) throw new Error('mocked ad was not completed');
      return result;
    }
  };
  const window = {
    ADS_CONFIG: { REWARDED_ID: 'test-rewarded-unit', IS_TESTING: true },
    Capacitor: native ? {
      isNativePlatform: () => true,
      Plugins: { AdMob: adMob }
    } : undefined
  };
  vm.runInNewContext(source, { window, console: { warn() {} } }, { filename: 'www/js/ads.js' });
  return { ads: window.Ads, calls };
}

(async () => {
  let rewards = 0;
  const web = makeEnvironment({ native: false });
  await web.ads.showRewarded(() => { rewards++; });
  assert.equal(rewards, 1, 'web fallback should continue to grant its immediate reward');
  assert.equal(web.calls.initialize, 0, 'web fallback must not initialize AdMob');

  rewards = 0;
  const unearned = makeEnvironment();
  await unearned.ads.showRewarded(() => { rewards++; });
  assert.equal(rewards, 0, 'native ad dismissal without an earned event/result must not grant');
  assert.equal(unearned.calls.shown, 1, 'native rewarded ad should be shown');
  assert.equal(unearned.calls.removed, 1, 'reward listener should be removed after dismissal');

  rewards = 0;
  const eventEarned = makeEnvironment({ emitReward: true });
  await eventEarned.ads.showRewarded(() => { rewards++; });
  assert.equal(rewards, 1, 'the native earned-reward event should grant exactly once');
  assert.deepEqual(eventEarned.calls.listeners, ['onRewardedVideoAdReward']);
  assert.equal(eventEarned.calls.removed, 1, 'earned-reward listener should be removed');

  rewards = 0;
  const resultEarned = makeEnvironment({ result: { amount: 3, type: 'undo' } });
  await resultEarned.ads.showRewarded(() => { rewards++; });
  assert.equal(rewards, 1, 'a returned AdMob reward item should grant exactly once');

  rewards = 0;
  const failed = makeEnvironment({ failShow: true });
  await failed.ads.showRewarded(() => { rewards++; });
  assert.equal(rewards, 0, 'a failed native ad must not grant unless an earned event fired');
  assert.equal(failed.calls.removed, 1, 'listener should be removed after native show failure');

  console.log('ALL ADMOB BRIDGE CONTRACT TESTS PASSED (mocked plugin only)');
})().catch(error => {
  console.error('FAIL', error);
  process.exitCode = 1;
});
