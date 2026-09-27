# Play Console: App content answers for Ball Sort Puzzle

App: **Ball Sort Puzzle** · Package `com.offerpk.ballsort` · v1.0.1 (versionCode 2)
Where: **Play Console → your app → Policy and programs → App content** (also listed in Dashboard → "Set up your app").

The app itself has **no accounts, no login, no analytics, no in-app purchases, no chat, and no location permission**. Game progress stays on the device (local storage) and is never sent anywhere.
The only thing that sends data off the device is the **Google Mobile Ads SDK (AdMob)**. It comes in through `@capacitor-community/admob` 8.1.0, which uses `play-services-ads` 25.4.x. The manifest declares `INTERNET`, `ACCESS_NETWORK_STATE` and `com.google.android.gms.permission.AD_ID`.

---

## 1. Privacy policy

- **Privacy policy URL:** `https://offerpk.github.io/ball-sort-puzzle/privacy.html`

## 2. Ads

- **Does your app contain ads?** → **Yes, my app contains ads**

## 3. App access

- → **All functionality in my app is available without any access restrictions**
  (There is no login, no membership and no location lock, so no test credentials are needed.)

## 4. Content ratings (IARC questionnaire)

- **Email address:** your developer email
- **Category:** **Game**. (Pick "Game", not "Reference, News or Educational" and not "Social or Communication".)

Answer **No** to every content question:

| Question group | Answer |
|---|---|
| Violence (cartoon, fantasy, realistic, blood, gore) | **No** |
| Fear / horror / scary content | **No** |
| Sexuality / nudity / sexual content | **No** |
| Language (profanity, crude humor) | **No** |
| Controlled substances (drugs, alcohol, tobacco) | **No** |
| Gambling / simulated gambling / loot boxes | **No** (no betting, no casino mechanics, no random paid rewards) |
| Discrimination / hate | **No** |
| Miscellaneous: does the app let users interact or exchange content with each other (chat, UGC)? | **No** |
| Does the app share the user's current physical location with other users? | **No** |
| Does the app allow users to purchase digital goods? | **No** (there are no in-app purchases) |
| Is the app a web browser or search engine / unrestricted internet access? | **No** |
| Does the app contain real-money gambling / NFTs / crypto rewards? | **No** |

**Expected result:** ESRB **Everyone**, PEGI **3**, USK **0**, ClassInd **L**, IARC Generic **3+**, Google Play **Rated for 3+**.
(Having ads does not raise the IARC rating.)

## 5. Target audience and content

- **Target age groups:** tick **13–15, 16–17 and 18 and over**. Do **not** tick 5 and under, 6–8, 9–12 or "Under 13".
  - A stricter option is **18 and over only**. It is also valid, and it keeps you furthest from Families-policy questions. It does not stop anyone from downloading the game, because who can download is set by the content rating, not by the target audience.
- **Could your store listing unintentionally appeal to children?** Answer honestly. The listing has no "kids", cartoon mascots or child-focused wording, so the usual answer is **No**. If Google's reviewers later decide it appeals to children, they will ask you to adjust. The listing text in `listing-en.md` was written with that in mind.
- **Why 13+ (or 18+) and not "all ages":**
  1. If you choose any age group under 13, the app falls under Google Play's **Families policy**. Then **every ad SDK must be a Google-certified Families ads SDK**, and ads shown to children must be family-safe and non-personalized. The Advertising ID and other identifiers must not be sent for child users. You must also follow **COPPA** (US), **GDPR-K** and similar laws, and add an age-screen/neutral age gate if you pick mixed audiences. Reviews also get stricter.
  2. Our AdMob setup serves personalized ads (with UMP consent in the EEA/UK) and collects the ad ID. That is fine for a 13+ audience but would need code changes for children: child-directed treatment (`tagForChildDirectedTreatment`), no AD_ID permission, and a max ad content rating of G.
  3. The published privacy policy already says the game is **"not directed at children under 13"**, so choosing 13+ keeps the policy and the Console answers consistent.
  - Source: Target audience and content, https://support.google.com/googleplay/android-developer/answer/9867159 · Families policy, https://support.google.com/googleplay/android-developer/answer/9893335

## 6. News apps

- **Is your app a news app?** → **No**

## 7. Government apps

- **Is your app developed by or on behalf of a government?** → **No**

## 8. Other declarations you will also see

| Section | Answer |
|---|---|
| **COVID-19 contact tracing and status apps** | My app is **not** a publicly available COVID-19 contact tracing or status app |
| **Financial features** | My app **doesn't provide any financial features** |
| **Health apps** | My app **does not have any health features** (select none / "My app does not have any health features") |
| **Data safety** | See section 10 |
| **Advertising ID** | See section 9 |

## 9. Advertising ID declaration

- **Does your app use advertising ID?** → **Yes**
- **Purpose(s):** tick **Advertising or marketing**. You should also tick **Analytics** and **Fraud prevention, security and compliance**, because Google says the Mobile Ads SDK uses the data it collects "for advertising, analytics, and fraud prevention purposes". Keep this the same as the Data safety purposes below.
- **Why:** the Google Mobile Ads SDK (AdMob) reads the Android advertising ID to serve and measure ads. The manifest already declares `com.google.android.gms.permission.AD_ID`, which is required for apps targeting Android 13+ that use the ad ID.
- Source: https://support.google.com/googleplay/android-developer/answer/6048248

## 10. Data safety form

Source of truth: Google's official page **"Google Play data disclosure" for the Google Mobile Ads SDK**,
https://developers.google.com/admob/android/privacy/play-data-disclosure (fetched 27 Sep 2026; page "Last updated 2026-09-25 UTC"; it describes SDK version 25.5.0. Our app currently resolves `play-services-ads` 25.4.x. Google advises checking the page again when you update the SDK. The four data types below are the standard AdMob disclosure, and they cover what our version collects).

The page says the SDK "collects and shares the following data types automatically for advertising, analytics, and fraud prevention purposes":

> - **IP address**: "Collects device's IP address, which may be used to estimate the general location of a device."
> - **User product interactions**: "including app launch, taps, and video views."
> - **Diagnostic information**: "including app launch time, hang rate, and energy usage."
> - **Device and Account identifiers**: "Collects Android advertising (ad) ID, app set ID, and, if applicable, other identifiers related to signed-in accounts on the device."
>
> "All of the user data collected by Google Mobile Ads SDK (Legacy) is encrypted in transit using the Transport Layer Security (TLS) protocol."

### 10a. Overview questions

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (AdMob uses TLS, see quote above) |
| Which of the following methods of account creation does your app support? | **My app does not allow users to create an account** |
| Do you provide a way for users to request that their data be deleted? | **No**. There is no account and we store no user data on our servers. The data the AdMob SDK collects is handled by Google. Users can reset or delete their advertising ID in Android Settings. (A "Delete account URL" is only required for apps that let users create accounts, which ours doesn't.) |
| (If asked) Has your app successfully completed an independent security review (MASA)? | **No** (optional) |
| (If asked) Is your app designed for families / complies with Families policy? | Not applicable (target audience is 13+) |

### 10b. Data types: tick exactly these four

| Data category → type | Collected | Shared | Processed ephemerally? | Required or optional | Purposes (for both collected and shared) |
|---|---|---|---|---|---|
| **Location → Approximate location** (derived from IP address) | Yes | Yes | No | **Required** (users can't turn it off) | Advertising or marketing · Analytics · Fraud prevention, security, and compliance |
| **App activity → App interactions** (app launch, taps, ad/video views) | Yes | Yes | No | **Required** | Advertising or marketing · Analytics · Fraud prevention, security, and compliance |
| **App info and performance → Diagnostics** (launch time, hang rate, energy usage) | Yes | Yes | No | **Required** | Advertising or marketing · Analytics · Fraud prevention, security, and compliance |
| **Device or other IDs** (Android advertising ID, app set ID) | Yes | Yes | No | **Required** | Advertising or marketing · Analytics · Fraud prevention, security, and compliance |

Leave **everything else unticked**: Personal info (name, email, user IDs…), Financial info, Health and fitness, Messages, Photos and videos, Audio, Files and docs, Calendar, Contacts, Web browsing, Precise location, Crash logs, "Other app performance data", Installed apps, Search history, "Other user-generated content", "Other actions".

Notes:
- **Precise location = No.** The app does not request any location permission. Only the approximate location that Google may estimate from the IP address applies.
- **Game progress and settings** stay on the device and never leave it, so they are *not* "collected" under Play's definition.
- **"Shared" = Yes** because the SDK sends the data to Google (a third party) for advertising. This matches Google's wording ("collects and shares") and the checklist in the task.
- The Play Store will then show roughly: *"This app may share these data types with third parties: Location, App activity, App info and performance, Device or other IDs"*, *"This app may collect these data types: …(same)…"*, *"Data is encrypted in transit"*, *"You can't request that data be deleted"*.
- If you later add Firebase/analytics/crash reporting, update this form.

## 11. Store settings (quick reference)

- **App or game:** Game · **Category:** Puzzle
- **Contains ads:** Yes · **In-app purchases:** No
- **Price:** Free. (Once published as free, an app can't be changed to paid.)
- **Countries:** all countries (or pick yours)
