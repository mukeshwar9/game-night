# Launch checklist

One list of what still stands between the finished build and a public launch. It replaces hunting through `docs/LAUNCH.md`, `docs/MOBILE.md`, `docs/ANALYTICS.md`, `docs/MONETIZATION.md` and `docs/STATUS.md`; those stay the long-form references and this page links to the section that has the detail.

Check the current state any time, offline and read-only:

```bash
npm run launch:check             # one done / open / unknown line per item below
npm run launch:check -- --strict # exit 1 while anything is open or unknown (for a pre-deploy gate)
```

`scripts/launch-check.mjs` reads the build env the way `vite build` does (`.env.local`, `.env`, shell `VITE_*`), the key **names** in `functions/.env`, and a few repo files. It prints names and statuses only, never a value, never calls the network and writes nothing. Item ids below match its output. It can only see this machine: a GitHub secret, a Firebase or Google Cloud console setting, an App Store or Play account and a Secret Manager secret are invisible to it, so those items stay `unknown` until the captain confirms.

Status words: **done**, **open**, and **unknown - captain to confirm** (the repository cannot show it).

## What changed with this page (agent-side wiring)

Verified against the code, the docs were right about the feature switches (each is off until its key exists) but wrong in one place, and one launch variable was missing:

- `docs/LAUNCH.md` says `VITE_CONTACT_EMAIL` goes in "`.env.local` and CI build env". `.github/workflows/deploy.yml` did not pass it to either build job, so a GitHub secret of that name would have changed nothing on the deployed site, and `/privacy` would still have said "Support email coming soon". Both the preview and live jobs now forward `VITE_CONTACT_EMAIL`.
- The same workflow did not forward `VITE_AUTH_SAME_ORIGIN` (the iOS PWA sign-in fix, which `docs/LAUNCH.md` says to "set in `.env.local` and redeploy") or `VITE_FIREBASE_VAPID_KEY` (without it `src/lib/push.js` hides the web notifications toggle). Both are forwarded now, empty when the secret is not set, exactly like the existing App Check, TURN, Sentry and PostHog variables.
- Result: for those three, creating the GitHub secret is now enough. `npm run launch:check` item `ci-forwards-vars` fails if someone removes one again (`src/lib/launchCheckLogic.test.js`).
- Not forwarded, on purpose: `VITE_VOICE_ENABLED`, `VITE_MONETIZATION_ENABLED`, `VITE_PADDLE_*`, `VITE_PUBLIC_ORIGIN`, `VITE_LINK_ORIGINS`, `VITE_NATIVE_*`, `VITE_APPSTORE_ID`, `VITE_PLAY_LIVE`. The native ones belong to local store builds, the rest are later switches the captain has not decided on. When the captain turns one on for the website, an agent adds that one line to `deploy.yml` in the same change.

Other findings while verifying:

- `docs/STATUS.md` is dated 2026-09-27 and is a branch ledger, not a launch list. Its only launch-relevant lines are "Deploy UPDRAFT" and the paused branches; everything else it holds is game work. Nothing was copied from it.
- "Store decisions D1-D8" do not exist in any of the five docs. The only `D1-D10` reference is the Archery game PRD (`docs/STATUS.md`, `docs/prds/archery.md`), which is game design, not launch. The store and domain decisions are listed in section C below under their own names. **Unknown - captain to confirm** whether a separate D1-D8 list exists elsewhere.
- Public `privacy.html` and `terms.html` carry "Last updated 2 October 2026" and do not call themselves drafts; the "working draft" label comes from `docs/LAUNCH.md` ("Still open"). Treat them as unapproved until the captain says otherwise.
- Google sign-in for the website is described as "already on" in `docs/MOBILE.md`; that is a Firebase console state, so it is `unknown - captain to confirm`, not something the code proves.

---

# A. Captain: do these in order

Everything here needs an account, a key, a console click, wording or a decision. Nothing below can be done from the repository. Keys go in `.env.local` for a local deploy (`npm run deploy`) and as a **GitHub repository secret of the same name** for the `deploy.yml` workflow. A `VITE_` value ends up in the public bundle, so only put values there that are public by design (the docs say which).

## A1. Support email

- **Item:** `contact-email`. Owner: captain.
- **What / why it blocks:** the support address is not chosen. Until it is, `/privacy`, `/terms` and `/support` print "Support email coming soon", the in-app Contact link is hidden and `security.txt` points at the site. Both stores also require published contact details (`docs/MOBILE.md` step 1.5), and Razorpay's website review wants contact details (`docs/MONETIZATION.md`).
- **Step:** choose an address (a mailbox someone reads). Set `VITE_CONTACT_EMAIL` in `.env.local` and as the GitHub secret `VITE_CONTACT_EMAIL`, then redeploy hosting.
- **Verify:** `npm run launch:check` shows `DONE contact-email`; after the deploy `/privacy`, `/terms`, `/support` show the address and `/.well-known/security.txt` has `Contact: mailto:...`.
- **Depends on it:** store listings (A8), Razorpay activation (C3), A2 reads better with it in place.

## A2. Privacy policy and terms approved

- **Item:** `legal-review`. Owner: captain. State: **unknown - captain to confirm**.
- **What / why it blocks:** `docs/LAUNCH.md` says both pages are a working draft and "read them before ads run". `docs/MONETIZATION.md` adds that the refund wording in `public/terms.html` (full refund within 7 days for double or mistaken charges) needs review "with someone qualified" before real money, and that Razorpay asks for a **legal name and contact address** on the Support page and Terms, which the code does not invent. The store privacy labels must match the data the app handles (`docs/MOBILE.md` section 8: uid, display name, FCM tokens with user agent, error reports, Google email, chat, the peer IP in real-time games), and now also what Sentry and PostHog collect (`docs/ANALYTICS.md`, "What is collected").
- **Step:** read `public/privacy.html` and `public/terms.html`; confirm or give the wording changes, the legal name and the address. Agents change wording only on the captain's explicit text.
- **Verify:** the captain says approved. Nothing offline can check this.
- **Depends on it:** running ads, A5-A7 (analytics collect data the policy must describe), C1-C3 (taking money), A8 (store review).

## A3. Sentry and PostHog keys

- **Items:** `sentry-dsn`, `posthog-key`, `sentry-sourcemaps`. Owner: captain.
- **What / why it blocks:** both tools are wired and stay off until their key exists (`docs/ANALYTICS.md`, "Keys"). Without them the only error view is the in-house `/notes` page and the only funnel is the in-house five-step one; there is no session replay and no native crash capture.
- **Step:** create a Sentry project and put its DSN in `VITE_SENTRY_DSN`. Create a PostHog project and put its key (`phc_...`) in `VITE_POSTHOG_KEY` and its region host in `VITE_POSTHOG_HOST` (`https://us.i.posthog.com` default, or `https://eu.i.posthog.com`). Both are already forwarded by `deploy.yml`, so GitHub secrets of those names are enough. For readable stacks also set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` in the shell or CI that runs `npm run sourcemaps:sentry` after each build. **Never** a `VITE_` variable for the token.
- **Verify:** `npm run launch:check` shows the first two DONE (the source-map item reads this shell only, so for CI it stays OPEN and the captain confirms the secrets exist). In the live site, a thrown test error appears in Sentry and a played game shows `game_started` in PostHog.
- **Depends on it:** A2 (the policy must describe both tools). `docs/ANALYTICS.md` notes the native projects were not built with the Sentry plugin yet; open Xcode and Android Studio once to confirm they resolve it.

## A4. Error alerts

- **Items:** `error-digest-webhook`. Owner: captain.
- **What / why it blocks:** the `errorDigest` function writes yesterday's report to `errorDigests/{day}` and logs an alert when there are 50+ reports or a new message repeats three times, but nothing tells anyone (`docs/LAUNCH.md`, "Error alerting"; "neither configured yet"). During a launch, failures would go unnoticed.
- **Step:** either create the Cloud Logging alert (Logs-based alerting on `resource.type="cloud_run_revision" AND jsonPayload.alert=true`, email as the channel), or put `ERROR_DIGEST_WEBHOOK_URL=<Slack or Discord incoming webhook>` in `functions/.env` and deploy functions.
- **Verify:** `launch:check` shows DONE for the webhook route only. The email route is a console state: **unknown - captain to confirm**.
- **Depends on it:** nothing; pairs with A3.

## A5. App Check

- **Items:** `appcheck-key`, `appcheck-enforce`. Owner: captain.
- **What / why it blocks:** the in-house funnel counters are client-written, so scripted accounts can inflate them; `docs/LAUNCH.md` says to turn App Check on and compare with the ad platform before spending on ads. The code is done (`src/lib/firebase.js` starts `initializeAppCheck` only when `VITE_APPCHECK_SITE_KEY` is set and never against the emulators).
- **Step:** the five console steps in `docs/LAUNCH.md` ("App Check (monitor mode)"): create the reCAPTCHA Enterprise key for `game-night-91464.web.app`, `game-night-91464.firebaseapp.com` and any custom domain; register the app in Firebase App Check; set `VITE_APPCHECK_SITE_KEY` (already forwarded by `deploy.yml`); deploy; leave everything **Unenforced**. After about a week, with 98% or more of Realtime Database requests verified, click **Enforce**.
- **Verify:** `launch:check` shows `DONE appcheck-key`; in the network tab `exchangeRecaptchaEnterpriseToken` returns 200; the Firebase console split shows verified requests. Enforcement is a console state: **unknown - captain to confirm**.
- **Depends on it:** A6 interacts with it (in-app webviews should be checked per platform); enforce only after native builds ship the key too.

## A6. Google sign-in on installed iOS web apps

- **Item:** `auth-same-origin`. Owner: captain.
- **What / why it blocks:** Google sign-in in an installed iOS home-screen app loses its redirect result while `authDomain` is `firebaseapp.com` and the app is served from `web.app`. The fix exists and is off (`VITE_AUTH_SAME_ORIGIN=1`, `src/lib/firebase.js`). It must stay off until the redirect URI is allowed, or Google answers `redirect_uri_mismatch`.
- **Step:** Google Cloud console, APIs & Services, Credentials, the OAuth web client Firebase created: add `https://game-night-91464.web.app/__/auth/handler` to the authorised redirect URIs. Then set `VITE_AUTH_SAME_ORIGIN=1` (`.env.local`, and the GitHub secret, now forwarded) and redeploy. Also confirm Google and Anonymous sign-in are enabled in Firebase Auth (`CLAUDE.md` setup prerequisites; **unknown - captain to confirm**).
- **Verify:** `launch:check` shows `DONE auth-same-origin`; test the upgrade from a home-screen install on an iPhone.
- **Depends on it:** nothing blocks on it, but ads to iPhone users hit it (the whole upgrade-to-account path).

## A7. TURN relay for the peer-to-peer games

- **Item:** `turn`. Owner: captain.
- **What / why it blocks:** the thirteen peer-to-peer games (Pong, Snake, Tron, Sumo, Space Duel, Paint, Pac Mac, Air Hockey, Puck Rush, Sticky Fingers, Bonk Buggies, Quiver, Fender Bender; `p2p: true` in `src/lib/games.js`; `docs/LAUNCH.md` still lists only the first eight) use public STUN only, so players on symmetric NATs and many mobile carriers cannot connect. That is why they are kept out of the public lobby (`src/lib/matchmaking.js`, `docs/LAUNCH.md`). Friends and private links still work, with roughly 5 to 10 percent of pairs unable to connect (`.env.local.example`). The provider and its cost are the captain's decision: **unknown - captain to confirm** (the docs name no provider for `VITE_TURN_*`; the party-voice Cloudflare TURN in `docs/PARTY-SHELL.md` is a separate, server-side setting).
- **Step:** choose a TURN provider and get a URL list, username and credential. Set `VITE_TURN_URLS` (comma-separated `turn:` or `turns:` URLs), `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`; all three are required, otherwise `src/lib/realtime/iceConfig.js` leaves TURN off. They are already forwarded by `deploy.yml`. Note the credential ships in the public bundle, so use short-lived or usage-capped credentials from the provider.
- **Verify:** `launch:check` shows `DONE turn`; two phones on different cellular networks complete a Pong match. With TURN set, public rooms go relay-only so strangers never see each other's IP.
- **Depends on it:** removing `p2p: true` from the thirteen registry entries so they join the public lobby (agent change, after TURN is verified); the A2 privacy text (peer IP wording changes); the native apps (`docs/MOBILE.md`, "Performance notes").

## A8. Native apps: accounts, config files, identifiers

Skip this whole block if launch is web only. Items: `native-config-files`, `native-placeholders`, `native-google-signin`, `native-apple-signin`, `native-push`, `web-push-vapid`, `appstore-id`, `play-live`. All owner: captain; every step is in `docs/MOBILE.md` ("Captain's steps"), in this order:

1. Apple Developer Program ($99/year, note the Team ID) and Google Play Console ($25; a personal account made after 2023-11-13 needs a closed test with 12 testers for 14 days, an organisation account does not).
2. Decide the bundle id (`app.gamenight` today) and whether a custom domain comes first (it becomes the link host: `VITE_PUBLIC_ORIGIN`, `VITE_LINK_ORIGINS`, an entitlement and a manifest host). **Unknown - captain to confirm** both.
3. Register the iOS and Android apps in the Firebase console; download `GoogleService-Info.plist` to `ios/App/App/` and `google-services.json` to `android/app/` (check: `native-config-files`).
4. Replace the three placeholders: `REVERSED_CLIENT_ID_PLACEHOLDER` in `ios/App/App/Info.plist`, `TEAMID_PLACEHOLDER` in `public/.well-known/apple-app-site-association`, `SHA256_CERT_FINGERPRINT_PLACEHOLDER` in `public/.well-known/assetlinks.json` (check: `native-placeholders`). These three are plain file edits an agent can make once the captain hands over the values.
5. Native Google sign-in (`VITE_NATIVE_GOOGLE_SIGNIN=1` at build), Sign in with Apple (App ID capability, Services ID, `.p8` key, the Firebase Apple provider, `VITE_NATIVE_APPLE_SIGNIN=1`; the store requires Apple once Google is offered), push (APNs auth key uploaded to Firebase, `VITE_NATIVE_PUSH=1`, rules and functions deployed **before** the first native build with push).
6. Web push (separate from native): generate the Web Push certificate key pair in Firebase Cloud Messaging and set `VITE_FIREBASE_VAPID_KEY` (now forwarded by `deploy.yml`). Check: `web-push-vapid`.
7. Store listings go live, then set `VITE_APPSTORE_ID` and `VITE_PLAY_LIVE=1` (they turn on the Smart App Banner, the "get the app" links and the update screen's store button). The minimum-version gate needs `config/minNativeVersion` set in the database console only when an update must be forced (`docs/MOBILE.md` section 7).
8. Store forms: privacy labels and Data safety must match A2; age rating about 13+ (16+ if the public lobby stays unmoderated); review notes mention blocking, reporting and the solo modes. The Support URL is `/support`, the Play account-deletion URL is `/privacy#delete`.

- **Verify:** `launch:check` for the file and flag items; on real devices: guest to Google sign-in keeps the uid, an invite push opens the room from a closed app, `adb shell pm get-app-links app.gamenight`, and the two `.well-known` files return JSON with no redirect.
- **Depends on it:** A1 (contact details), A2 (labels), A7 (P2P on mobile networks). Not yet verified on a device per `docs/MOBILE.md`: the Apple revocation call against the live backend, universal-link click-through, and audio-session behaviour after leaving voice.

## A9. Decisions with no key attached

Owner: captain. Each is a choice, not a click; an agent implements after the answer.

| Item | Decision | Today | Detail |
|---|---|---|---|
| `leaderboard` | Show the public leaderboard? | off, `LEADERBOARD_ENABLED = false` in `src/lib/features.js`; no route, tab or link | Credits are trust-based for games the server cannot verify (`docs/LAUNCH.md`). The function and rules are kept. |
| `voice` | Turn on party voice and camera? | off | Needs a Cloudflare app, `CF_SFU_APP_*` secrets, `VOICE_ENABLED=1` and `VOICE_SECRETS=1` in `functions/.env`, and `VITE_VOICE_ENABLED=1` (`docs/PARTY-SHELL.md`). Strongly wants TURN (`CF_TURN_*`). Needs the device-test list in that doc. |
| `monetization` | Sell the Pass and packs at launch? | off in production builds | Section C. Not part of a first launch unless the captain says so. |
| CSP report endpoint | Collect Content-Security-Policy violation reports? | none; violations show only in the browser console and e2e | Needs a function or a third-party service (`docs/LAUNCH.md`, last section). |
| Dependency audit | Do the major `firebase-admin` 14 and `firebase-functions` 7 upgrade? | moderate `uuid` findings in `functions/`; the flagged calls are not used | A separate, tested agent change once approved (`docs/LAUNCH.md`). |
| Custom domain | Move invite links and share cards to a custom domain before launch? | `game-night-91464.web.app` | If yes: App Check key domains, OAuth redirect URI (A6), `VITE_PUBLIC_ORIGIN`, and the native link files all change (`docs/MOBILE.md`). **Unknown - captain to confirm.** |
| Audio session | Keep game audio on the `.ambient` category (follows the silent switch) or `.playback`? | `.ambient` | `docs/MOBILE.md`, "Decisions still open". |
| Keep source maps | Keep each release's `sourcemaps/<build id>/` from the deploying machine | git-ignored, per machine | Without them live stacks cannot be symbolicated (`docs/LAUNCH.md`). |

---

# B. Agent can do (no secrets)

| Item | State | Detail |
|---|---|---|
| `ci-forwards-vars` | **done** (this change) | `deploy.yml` passes `VITE_CONTACT_EMAIL`, `VITE_AUTH_SAME_ORIGIN`, `VITE_FIREBASE_VAPID_KEY` plus the existing App Check, TURN, Sentry and PostHog variables to both build jobs. Verify: `npm run launch:check`. |
| Launch check script | **done** (this change) | `scripts/launch-check.mjs`, logic and tests in `src/lib/launchCheckLogic.js` and `.test.js`. |
| Remove `p2p: true` from the thirteen registry entries | open, **after A7 is verified** | Puts the real-time games in the public lobby. Do not do it before TURN works end to end. |
| Fill the three native placeholders | open, after A8 gives the values | Plain edits in `Info.plist`, `apple-app-site-association`, `assetlinks.json`. |
| Add `VITE_VOICE_ENABLED` / `VITE_MONETIZATION_ENABLED` / `VITE_PADDLE_*` to `deploy.yml` | open, only when the captain turns that feature on for the website | One line per variable in each build job. |
| Dependency upgrade | open, after the A9 decision | See A9. |
| Product-code checks that already pass | **done** | Budget alert of about $25 a month is confirmed by the captain (`docs/LAUNCH.md`, "Budget"); the CSP is enforcing with a CI check (`scripts/check-csp.mjs`); rules tests cover the audit probes (`tests/rules/launch.test.js`); each switch in this page is off by default and safe when unset. |

---

# C. Money (only if the shop and Pass are in the launch)

`monetization` in `launch:check`; everything sold sits behind one switch that is off by default in production builds (`docs/MONETIZATION.md`, "Launch switch"). Owner: captain for every step. Skip until A1-A7 are done.

1. **Paddle (everyone outside India):** account (sandbox first), products and prices matching `PRODUCTS` with a 7-day trial on both Pass prices, default payment link set to `https://game-night-91464.web.app/shop`, client-side token in `VITE_PADDLE_CLIENT_TOKEN` and `VITE_PADDLE_ENV=sandbox`; `PADDLE_PRICES` and `ADMIN_EMAILS` in `functions/.env`; Secret Manager enabled, `PADDLE_API_KEY` and `PADDLE_WEBHOOK_SECRET` set, `PAYMENTS_SECRETS=1`; a webhook destination for `subscription.*`, `transaction.completed`, `adjustment.updated`. Test purchase, cancel and refund in the sandbox.
2. **Razorpay (India):** account and KYC (legal name and address on the Support page and Terms, A2), test keys first, `RAZORPAY_KEY_ID` in `functions/.env`, the two secrets, the webhook with `payment.captured`, `order.paid`, `refund.processed`, auto-capture on, international cards off, GST registration when turnover passes the threshold.
3. **Go live:** legal review done (A2), Paddle domain approval, then `PADDLE_ENV=production` and `RAZORPAY_ENV=production` with live keys, `VITE_PADDLE_ENV=production` with a `live_` token, both switches (`VITE_MONETIZATION_ENABLED=1` at build, `MONETIZATION_ENABLED=1` in `functions/.env`), and deploy rules, functions and hosting together.

- **Verify:** `launch:check` shows `DONE monetization` only once both switches are set; the secrets and provider accounts are **unknown - captain to confirm** because they live in Secret Manager and the provider dashboards. The shell never shows the shop (Apple and Play billing rules).
- **Depends on it:** A2 (refund wording, legal name), A1 (contact details).

---

# D. Order of play

1. A1 support email, A2 policy review, A3 monitoring keys, A4 alerts: all small, and A1 plus A3 are one-line secrets now that `deploy.yml` forwards them.
2. A5 App Check in monitor mode, then A6 sign-in redirect, before spending on ads.
3. A7 TURN, then the agent step that moves the thirteen P2P games into the public lobby.
4. A9 decisions as they come up.
5. A8 native apps and section C money only if they are part of the launch.

After each change, run `npm run launch:check` and redeploy; `unknown` rows stay until the captain confirms the console or account state.
