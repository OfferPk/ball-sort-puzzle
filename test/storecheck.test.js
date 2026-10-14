// Store-build guard (scripts/store-config.js). IDs below are obviously fake DUMMIES for testing only.
const assert = require('assert'), fs = require('fs');
const S = require('../scripts/store-config.js');
const ads = fs.readFileSync(__dirname + '/../www/js/ads-config.js', 'utf8');
const cloud = fs.readFileSync(__dirname + '/../www/js/cloud-config.js', 'utf8');
const manifest = fs.readFileSync(__dirname + '/../android/app/src/main/AndroidManifest.xml', 'utf8');
// 1) the committed tree is a debug/test tree: the guard must FAIL on it
const p0 = S.problems({ ads, cloud, manifest });
assert(p0.some(x => /TEST id/.test(x)), 'test AdMob ids are rejected');
assert(p0.some(x => /IS_TESTING/.test(x)), 'IS_TESTING:true rejected');
assert(p0.some(x => /REPLACE_WITH/.test(x)), 'Play Games placeholder rejected');
assert(p0.some(x => /AndroidManifest APPLICATION_ID/.test(x)), 'manifest test app id rejected');
// committed files must keep Google's TEST ids (debug builds keep working, no real ids in git)
assert(ads.includes(S.TEST_PUB) && manifest.includes(S.TEST_PUB) && /IS_TESTING:\s*true/.test(ads));
// 2) after injecting dummy ids + stripping cloud placeholder, it passes
const D = { APP_ID: 'ca-app-pub-1111111111111111~2222222222', BANNER_ID: 'ca-app-pub-1111111111111111/3333333333', INTERSTITIAL_ID: 'ca-app-pub-1111111111111111/4444444444', REWARDED_ID: 'ca-app-pub-1111111111111111/5555555555' };
const ads2 = S.setAds(ads, D), man2 = S.setManifestAppId(manifest, D.APP_ID), cloud2 = S.setCloud(cloud, false, '');
assert.deepStrictEqual(S.problems({ ads: ads2, cloud: cloud2, manifest: man2 }), []);
assert.strictEqual(S.readAds(ads2).IS_TESTING, false);
// 3) partial / wrong ids fail
assert(S.problems({ ads: S.setAds(ads, { APP_ID: D.APP_ID }), cloud: cloud2, manifest: man2 }).length >= 3, 'missing unit ids fail');
assert(S.problems({ ads: ads2, cloud: cloud2, manifest }).some(x => /AndroidManifest/.test(x)), 'manifest must be injected too');
assert(S.problems({ ads: ads2, cloud: cloud2, manifest: S.setManifestAppId(manifest, 'ca-app-pub-1111111111111111~9999999999') }).some(x => /does not match/.test(x)));
assert(!S.validId('APP_ID', 'ca-app-pub-0000000000000000~0000000000'), 'all-zero placeholder rejected');
assert(!S.validId('BANNER_ID', 'ca-app-pub-1111111111111111~3333333333'), 'unit id needs a slash');
assert(!S.validId('APP_ID', 'ca-app-pub-3940256099942544~3347511713'));
// 4) cloud save enabled needs a real numeric id, a native bridge and manifest meta-data
const cloudOn = S.setCloud(cloud, true, 'REPLACE_WITH_PLAY_GAMES_APP_ID');
assert(S.problems({ ads: ads2, cloud: cloudOn, manifest: man2 }).some(x => /PLAY_GAMES_APP_ID/.test(x)));
const cloudOnId = S.setCloud(cloud, true, '123456789012');
const pr = S.problems({ ads: ads2, cloud: cloudOnId, manifest: man2 }, { nativeBridge: false });
assert(pr.some(x => /PlayGamesSaves/.test(x)) && pr.some(x => /games\.APP_ID/.test(x)));
// 5) synced bundle is checked too
assert(S.problems({ ads: ads2, cloud: cloud2, manifest: man2, synced: [{ name: 'ads-config.js', text: ads }] }).some(x => /synced/.test(x)));
console.log('store build guard tests ok');
