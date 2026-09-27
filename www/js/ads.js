/*
 * Ad hooks. In a normal web browser every call is a no-op (rewarded ads
 * simply grant the reward). Inside the Capacitor Android app they use
 * @capacitor-community/admob via Capacitor.Plugins.AdMob.
 */
(function () {
  'use strict';
  var cfg = window.ADS_CONFIG || {};
  var levelsSinceInterstitial = 0;
  var lastInterstitialAt = 0;
  var initPromise = null;
  var rewardedBusy = false;

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }
  function plugin() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob;
  }

  function init() {
    if (initPromise) return initPromise;
    var AdMob = plugin();
    if (!isNative() || !AdMob) { initPromise = Promise.resolve(false); return initPromise; }
    initPromise = (async function () {
      try {
        await AdMob.initialize({ initializeForTesting: !!cfg.IS_TESTING });
        // Google UMP consent (required for EEA/UK users)
        try {
          var info = await AdMob.requestConsentInfo();
          if (info && info.isConsentFormAvailable && info.status === 'REQUIRED') {
            await AdMob.showConsentForm();
          }
        } catch (e) { /* consent not configured – continue */ }
        return true;
      } catch (e) { console.warn('AdMob init failed', e); return false; }
    })();
    return initPromise;
  }

  async function showBanner() {
    if (!(await init())) return;
    try {
      await plugin().showBanner({
        adId: cfg.BANNER_ID, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER',
        margin: 0, isTesting: !!cfg.IS_TESTING
      });
      document.body.classList.add('has-banner');
    } catch (e) { console.warn('banner failed', e); }
  }

  /** Call after every completed level. Shows an interstitial every N levels, max once per 60 s. */
  async function showInterstitial() {
    levelsSinceInterstitial++;
    var now = Date.now();
    if (levelsSinceInterstitial < (cfg.INTERSTITIAL_EVERY_N_LEVELS || 3)) return false;
    if (now - lastInterstitialAt < (cfg.INTERSTITIAL_MIN_INTERVAL_MS || 60000)) return false;
    levelsSinceInterstitial = 0;
    lastInterstitialAt = now;
    if (!(await init())) return false; // web: no-op
    try {
      await plugin().prepareInterstitial({ adId: cfg.INTERSTITIAL_ID, isTesting: !!cfg.IS_TESTING });
      await plugin().showInterstitial();
      return true;
    } catch (e) { console.warn('interstitial failed', e); return false; }
  }

  /** Shows a rewarded ad; calls onReward() only if the reward was earned. In a browser the reward is granted immediately. */
  async function showRewarded(onReward) {
    if (rewardedBusy) return;
    var native = await init();
    if (!native) { if (onReward) onReward(); return; }
    rewardedBusy = true;
    var AdMob = plugin();
    var rewarded = false;
    var handle = null;
    try {
      handle = await AdMob.addListener('onRewardedVideoAdReward', function () { rewarded = true; });
      await AdMob.prepareRewardVideoAd({ adId: cfg.REWARDED_ID, isTesting: !!cfg.IS_TESTING });
      var item = await AdMob.showRewardVideoAd();
      if (item) rewarded = true;
    } catch (e) {
      console.warn('rewarded failed', e);
    } finally {
      rewardedBusy = false;
      if (handle && handle.remove) try { handle.remove(); } catch (e) {}
    }
    if (rewarded && onReward) onReward();
  }

  window.Ads = { init: init, isNative: isNative, showBanner: showBanner, showInterstitial: showInterstitial, showRewarded: showRewarded };
})();
