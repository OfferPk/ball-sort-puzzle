/*
 * ============================================================
 *  AdMob CONFIGURATION  —  the ONE place to change ad unit IDs
 * ============================================================
 * These are Google's official TEST IDs. They always serve test ads and are
 * safe to use while developing. Before publishing to Google Play:
 *   1. Create an app + ad units in https://apps.admob.com
 *   2. Replace the four IDs below with your real ones
 *   3. Replace the App ID in
 *      android/app/src/main/AndroidManifest.xml
 *      (<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" .../>)
 *   4. Set IS_TESTING to false
 * Never click your own live ads.
 */
window.ADS_CONFIG = {
  APP_ID: 'ca-app-pub-3940256099942544~3347511713', // also in AndroidManifest.xml
  BANNER_ID: 'ca-app-pub-3940256099942544/6300978111',
  INTERSTITIAL_ID: 'ca-app-pub-3940256099942544/1033173712',
  REWARDED_ID: 'ca-app-pub-3940256099942544/5224354917',
  IS_TESTING: true,

  // Frequency rules
  INTERSTITIAL_EVERY_N_LEVELS: 3,
  INTERSTITIAL_MIN_INTERVAL_MS: 60 * 1000
};
