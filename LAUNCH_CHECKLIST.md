# Launch checklist: Ball Sort Puzzle (`com.offerpk.ballsort`)

This is what John must provide before the first Google Play upload, and exactly where to paste each item.
**Never commit real IDs to the repo.** They go into GitHub **repository secrets** only. The committed code keeps Google's *test* AdMob IDs, so normal debug and test builds keep working.

Where to add secrets: **GitHub → OfferPk/ball-sort-puzzle → Settings → Secrets and variables → Actions → New repository secret**. Use the name exactly as written, and paste only the value (no quotes or spaces).

## 1. AdMob (required for a store build)

Create the app in https://apps.admob.com (Apps → Add app → Android → "Ball Sort Puzzle"), then create 3 ad units: **Banner**, **Interstitial** and **Rewarded**.

| Secret name | What to paste | Format | Where to find it |
|---|---|---|---|
| `ADMOB_APP_ID` | AdMob **App ID** | `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY` (with `~`) | AdMob → Apps → this app → App settings |
| `ADMOB_BANNER_ID` | Banner ad unit ID | `ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ` (with `/`) | AdMob → Apps → this app → Ad units |
| `ADMOB_INTERSTITIAL_ID` | Interstitial ad unit ID | `ca-app-pub-…/…` | same |
| `ADMOB_REWARDED_ID` | Rewarded ad unit ID | `ca-app-pub-…/…` | same |

Each game needs its own AdMob app and its own 3 ad units. Don't reuse the IDs from another game.
The build injects them into `www/js/ads-config.js` (and sets `IS_TESTING: false`) and into `android/app/src/main/AndroidManifest.xml` (`com.google.android.gms.ads.APPLICATION_ID`). This happens only inside the CI run; nothing is committed.
Also in AdMob: complete **Privacy & messaging → GDPR/consent message** (the app already uses the UMP consent form), and link the app to the Play listing once it is published.

## 2. App signing (already set: keep as is)

| Secret name | Status |
|---|---|
| `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` | ✅ already set (upload key). Keep a private backup of the keystore; losing it means asking Google for an upload-key reset. |

In Play Console, enrol in **Play App Signing** when you create the app. The CI keystore is the *upload* key.

## 3. Google Play Console (manual, in John's account)

- [ ] Developer account (one-time US$25) with identity verification done
- [ ] Create the app "Ball Sort Puzzle", package `com.offerpk.ballsort`
- [ ] Store listing: copy the text from `store/LISTING-v1.1.md`, the screenshots from `store/screenshots/01–08.png`, `store/feature-graphic-1024x500.png` and `store/icon-512.png`
- [ ] App content: privacy policy URL (GitHub Pages `privacy.html`), Ads = **Yes**, Data safety + Advertising ID declaration (`store/play-console-answers.md`), target audience 13+, content rating questionnaire
- [ ] New personal developer accounts must run a **closed test** (12+ testers for 14 days) before production access

## 4. Play Games cloud save (not available yet)

This game has only the disabled config scaffold (`www/js/cloud-config.js`); there is no native bridge. Always run the store build with **cloud_save unticked** (the default). The placeholder is then stripped and cloud save stays off.

## 5. Make the Play Store build

1. GitHub → **Actions → "Play Store build" → Run workflow** (branch `main`)
2. Leave **release** ticked. The run **fails** if any Google test AdMob ID, an `IS_TESTING: true`, a manifest test App ID, a `REPLACE_WITH…` Play Games placeholder or a missing signing key would ship. It checks both the sources and the synced app bundle.
3. When it passes, download the artifact **ball-sort-puzzle-play-store-aab** (`ball-sort-puzzle-v<version>-store.aab`) and upload it in Play Console → Testing → Closed testing (or Production).
- Untick **release** for a dry run. The guard then only warns, and the AAB is named `…-store-dryrun.aab`. Don't upload that one.
- The normal **"Android build"** workflow (every push and every `v*` tag) is unchanged: it still uses the test IDs and produces the GitHub Release APK/AAB for testing. Never upload those test-ID builds to Play.

## Quick status

| Item | Provided? |
|---|---|
| ADMOB_APP_ID / ADMOB_BANNER_ID / ADMOB_INTERSTITIAL_ID / ADMOB_REWARDED_ID | ❌ not set |
| Signing secrets | ✅ set |
| Play Console app created | ❓ John |
| PLAY_GAMES_APP_ID | not needed (cloud save not built for this game) |
