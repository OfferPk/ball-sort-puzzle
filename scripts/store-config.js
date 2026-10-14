#!/usr/bin/env node
/*
 * Play Store release config: inject real IDs from environment (GitHub secrets) and
 * refuse to produce a store build that still contains test or placeholder IDs.
 *
 *   node scripts/store-config.js inject   # writes IDs from env into the build tree (CI only, never commit)
 *   node scripts/store-config.js check    # exits 1 if anything would ship as a test/placeholder value
 *
 * Env (all optional for `inject`; `check` decides what is required):
 *   ADMOB_APP_ID, ADMOB_BANNER_ID, ADMOB_INTERSTITIAL_ID, ADMOB_REWARDED_ID
 *   PLAY_GAMES_APP_ID        numeric Play Games Services App ID (only if CLOUD_SAVE=true)
 *   CLOUD_SAVE=true|false    turn Play Games cloud save on for this build (default false = stripped/off)
 * Nothing here contains or guesses a real ID.
 */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.resolve(__dirname, '..');
var TEST_PUB = 'ca-app-pub-3940256099942544';           // Google's public sample/test publisher
var RE_APP = /^ca-app-pub-\d{16}~\d{10}$/, RE_UNIT = /^ca-app-pub-\d{16}\/\d{10}$/, RE_PGS = /^\d{6,20}$/;
var FILES = {
  ads: 'www/js/ads-config.js',
  cloud: 'www/js/cloud-config.js',
  manifest: 'android/app/src/main/AndroidManifest.xml',
  synced: 'android/app/src/main/assets/public/js'      // copy made by `npx cap sync`
};
var ADS_KEYS = { APP_ID: 'ADMOB_APP_ID', BANNER_ID: 'ADMOB_BANNER_ID', INTERSTITIAL_ID: 'ADMOB_INTERSTITIAL_ID', REWARDED_ID: 'ADMOB_REWARDED_ID' };

function validId(key, v) {
  if (!v || v.indexOf(TEST_PUB) === 0) return false;
  if (/^ca-app-pub-0+[~/]/.test(v)) return false;       // all-zero dummy = placeholder
  return key === 'APP_ID' ? RE_APP.test(v) : RE_UNIT.test(v);
}
function readAds(src) {
  var out = {};
  Object.keys(ADS_KEYS).forEach(function (k) { var m = src.match(new RegExp(k + ":\\s*'([^']*)'")); out[k] = m ? m[1] : null; });
  var t = src.match(/IS_TESTING:\s*(true|false)/); out.IS_TESTING = t ? t[1] === 'true' : null;
  return out;
}
function setAds(src, ids) {
  Object.keys(ids).forEach(function (k) { src = src.replace(new RegExp('(' + k + ":\\s*')[^']*(')"), '$1' + ids[k] + '$2'); });
  return src.replace(/IS_TESTING:\s*true/, 'IS_TESTING: false');
}
function manifestAppId(xml) { var m = xml.match(/com\.google\.android\.gms\.ads\.APPLICATION_ID"\s*android:value="([^"]*)"/); return m ? m[1] : null; }
function setManifestAppId(xml, id) { return xml.replace(/(com\.google\.android\.gms\.ads\.APPLICATION_ID"\s*android:value=")[^"]*(")/, '$1' + id + '$2'); }
function readCloud(src) {
  var e = src.match(/ENABLED:\s*(true|false)/), id = src.match(/PLAY_GAMES_APP_ID:\s*'([^']*)'/);
  return { ENABLED: e ? e[1] === 'true' : null, PLAY_GAMES_APP_ID: id ? id[1] : null };
}
function setCloud(src, enabled, id) {
  return src.replace(/ENABLED:\s*(true|false)/, 'ENABLED: ' + (enabled ? 'true' : 'false')).replace(/(PLAY_GAMES_APP_ID:\s*')[^']*(')/, '$1' + id + '$2');
}

/** Pure check over file contents. Returns a list of problems (empty = OK to ship). */
function problems(f, opts) {
  opts = opts || {};
  var out = [], a = readAds(f.ads || '');
  Object.keys(ADS_KEYS).forEach(function (k) {
    if (!validId(k, a[k])) out.push('AdMob ' + k + ' is ' + (a[k] && a[k].indexOf(TEST_PUB) === 0 ? 'a Google TEST id' : 'missing/invalid (' + a[k] + ')') + ' -> set secret ' + ADS_KEYS[k]);
  });
  if (a.IS_TESTING !== false) out.push('ads-config.js IS_TESTING is not false');
  var mid = manifestAppId(f.manifest || '');
  if (!validId('APP_ID', mid)) out.push('AndroidManifest APPLICATION_ID is a test/placeholder value (' + mid + ')');
  else if (mid !== a.APP_ID) out.push('AndroidManifest APPLICATION_ID does not match ads-config APP_ID');
  var c = readCloud(f.cloud || '');
  if (/REPLACE_WITH/.test(f.cloud || '')) out.push('cloud-config.js still contains a REPLACE_WITH placeholder (Play Games)');
  if (c.ENABLED && !RE_PGS.test(c.PLAY_GAMES_APP_ID || '')) out.push('Cloud save is ENABLED but PLAY_GAMES_APP_ID is not a real numeric ID -> set secret PLAY_GAMES_APP_ID');
  if (c.ENABLED && !opts.nativeBridge) out.push('Cloud save is ENABLED but no native PlayGamesSaves plugin exists in android/ (see SETUP_PLAY_GAMES.md)');
  if (c.ENABLED && !/com\.google\.android\.gms\.games\.APP_ID/.test(f.manifest || '')) out.push('Cloud save is ENABLED but AndroidManifest has no com.google.android.gms.games.APP_ID meta-data');
  (f.synced || []).forEach(function (s) {
    if (s.text.indexOf(TEST_PUB) >= 0) out.push('synced web bundle ' + s.name + ' still contains the Google TEST publisher id (run cap sync after inject)');
    if (/REPLACE_WITH/.test(s.text)) out.push('synced web bundle ' + s.name + ' still contains a REPLACE_WITH placeholder');
  });
  return out;
}

function rd(rel) { var p = path.join(ROOT, rel); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }
function wr(rel, s) { fs.writeFileSync(path.join(ROOT, rel), s); }
function hasBridge() {
  var dir = path.join(ROOT, 'android/app/src/main/java'), found = false;
  (function walk(d) { if (!fs.existsSync(d) || found) return; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(java|kt)$/.test(n) && /PlayGamesSaves/.test(fs.readFileSync(p, 'utf8'))) found = true; }); })(dir);
  return found;
}

function inject(env) {
  var ids = {}, missing = [];
  Object.keys(ADS_KEYS).forEach(function (k) { var v = (env[ADS_KEYS[k]] || '').trim(); if (v) ids[k] = v; else missing.push(ADS_KEYS[k]); });
  var bad = Object.keys(ids).filter(function (k) { return !validId(k, ids[k]); });
  if (bad.length) { console.error('Invalid AdMob id format/test id in: ' + bad.map(function (k) { return ADS_KEYS[k]; }).join(', ')); return 1; }
  if (Object.keys(ids).length) {
    wr(FILES.ads, setAds(rd(FILES.ads), ids));
    if (ids.APP_ID) wr(FILES.manifest, setManifestAppId(rd(FILES.manifest), ids.APP_ID));
    console.log('Injected AdMob ids: ' + Object.keys(ids).join(', ') + ' (IS_TESTING=false)');
  }
  if (missing.length) console.log('::warning::AdMob secrets not set: ' + missing.join(', ') + ' (test ids remain)');
  var cloudOn = String(env.CLOUD_SAVE || 'false') === 'true', pgs = (env.PLAY_GAMES_APP_ID || '').trim();
  if (cloudOn) {
    if (!RE_PGS.test(pgs)) { console.error('CLOUD_SAVE=true needs secret PLAY_GAMES_APP_ID (numeric)'); return 1; }
    wr(FILES.cloud, setCloud(rd(FILES.cloud), true, pgs));
    var m = rd(FILES.manifest);
    if (!/com\.google\.android\.gms\.games\.APP_ID/.test(m)) wr(FILES.manifest, m.replace(/(<application[^>]*>)/, '$1\n        <meta-data android:name="com.google.android.gms.games.APP_ID" android:value="@string/game_services_project_id"/>'));
    fs.mkdirSync(path.join(ROOT, 'android/app/src/main/res/values'), { recursive: true });
    wr('android/app/src/main/res/values/games-ids.xml', '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="game_services_project_id" translatable="false">' + pgs + '</string>\n</resources>\n');
    console.log('Cloud save ON for this build (Play Games App ID injected)');
  } else {
    wr(FILES.cloud, setCloud(rd(FILES.cloud), false, ''));
    console.log('Cloud save OFF for this build (placeholder stripped)');
  }
  return 0;
}
function check() {
  var syncedDir = path.join(ROOT, FILES.synced), synced = [];
  if (fs.existsSync(syncedDir)) ['ads-config.js', 'cloud-config.js'].forEach(function (n) { var p = path.join(syncedDir, n); if (fs.existsSync(p)) synced.push({ name: n, text: fs.readFileSync(p, 'utf8') }); });
  var list = problems({ ads: rd(FILES.ads), cloud: rd(FILES.cloud), manifest: rd(FILES.manifest), synced: synced }, { nativeBridge: hasBridge() });
  if (!list.length) { console.log('Store config check passed: no test or placeholder IDs.'); return 0; }
  list.forEach(function (p) { console.log('::error::' + p); });
  console.log('Store config check FAILED (' + list.length + ' problem' + (list.length > 1 ? 's' : '') + '). See LAUNCH_CHECKLIST.md.');
  return 1;
}
module.exports = { problems: problems, validId: validId, readAds: readAds, setAds: setAds, setCloud: setCloud, readCloud: readCloud, manifestAppId: manifestAppId, setManifestAppId: setManifestAppId, TEST_PUB: TEST_PUB };
if (require.main === module) {
  var cmd = process.argv[2];
  process.exit(cmd === 'inject' ? inject(process.env) : cmd === 'check' ? check() : (console.error('usage: store-config.js inject|check'), 2));
}
