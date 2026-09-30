# Launch notes

What the launch-hardening pass changed, the switches it left, and what is still open. Source: the production-readiness audit of 2026-09-30.

## Switches and placeholders

| What | Where | State |
|---|---|---|
| Public leaderboard | `LEADERBOARD_ENABLED` in `src/lib/features.js` | `false`: no `/leaderboard` route, tab or "SEE WHERE YOU RANK" link. The code, the `leaderboard/` rules and the `creditMatchResults` function are kept. |
| Peer-to-peer real-time games in the public lobby | `p2p: true` on the registry entries (Pong, Snake, Tron, Sumo, Space Duel, Paint, Pac Mac, Air Hockey) | Kept out of the public lobby (`matchmaking.js`). Friends and private invite links still work. Remove the flag only when a TURN relay is in place (no TURN is configured). |
| Support address | `VITE_CONTACT_EMAIL` (`.env.local` and CI build env) | Empty: `/privacy` and `/terms` say "Support email coming soon", the in-app Contact link is hidden and `security.txt` points at the site. Set it to an address and rebuild: the pages, `security.txt` (tokens `%CONTACT%` and `%CONTACT_URL%`, filled by `vite.config.js`) and the app all pick it up. |

## Rules

- Every client-written timestamp is bounded to `now` (one hour of clock slack, five minutes for lobby listing dates), with an accept-unchanged branch so a parent transaction over an old room still passes.
- Lobby listings need a bounded `createdAt`/`expiresAt` and a 1-40 character `hostName`; the client also drops poisoned rows (`normalizePublicRooms`).
- `games/$gameId` accepts only known top-level keys (the `$other` regex in `database.rules.json`). A new game that writes a new room-level key must add it there, or its writes fail with `permission_denied`. `tests/rules/launch.test.js` covers the probes A1-A10 from the audit.
- `users/$uid` and `friendRequests/$uid/$from` take only known keys; error reports are keyed `{uid}-{slot}` (20 per account per day).
- Owners can delete their own `users/{uid}` and `codes/{code}` (Delete my data).
- Chat names are not enforced by the rules (a message can carry any `name`); the room is moderated on read (`moderateRoomNames`), and each chat line is labelled with its sender's recorded seat name.

## Analytics (in-house)

`attribution.js` keeps the first touch (UTM tags, click id, referrer) on the device and, once, on `users/{uid}/attribution`. `analytics.js` counts five steps by source and campaign in `funnelDaily/{day}/{source}/{campaign}/{step}`: landed, named, started, finished, shared. An account counts once per step (`funnelSeen/{uid}/{step}`, written in the same update). The admin view is the FUNNEL tab on `/notes`. Counters are client-written, so new accounts can still be scripted: turn on App Check and compare against the ad platform's click counts.

## Push

The FCM worker registers under its own scope (`/firebase-cloud-messaging-push-scope`), so it no longer replaces the Workbox worker; enabled users are re-registered on boot (`resyncPush`). `sendInvitePush` sends data-only messages linking to `/game/{id}`. The Cloudflare worker in `worker/` is no longer called by the client.

## Still open

- TURN is not configured.
- `functions/` still reports moderate `npm audit` findings (transitive `uuid`).
- The privacy policy and terms are a working draft: read them before ads run.

## App Check (monitor mode)

`src/lib/firebase.js` calls `initializeAppCheck` with a reCAPTCHA Enterprise provider whenever `VITE_APPCHECK_SITE_KEY` is set (never against the emulators). With no key the app runs exactly as before, so shipping the code does nothing until the key exists. The Firebase SDK attaches the App Check token to Realtime Database requests and to any Cloud Functions call, so the same initialisation covers both.

Console steps for the captain, in order:

1. Google Cloud console, Security, reCAPTCHA Enterprise: create a website key (score-based) for `game-night-91464.web.app`, `game-night-91464.firebaseapp.com` and any custom domain. Copy the site key.
2. Firebase console, App Check, Apps: register the web app with the reCAPTCHA Enterprise provider and that site key.
3. Put the key in `.env.local` as `VITE_APPCHECK_SITE_KEY` (and in the CI build secrets), then build and deploy. In the network tab `exchangeRecaptchaEnterpriseToken` should return 200.
4. Leave every product (Realtime Database, Authentication, Functions) on **Unenforced**. That is monitor mode: the console shows the verified and unverified request split, nothing is rejected.
5. After about a week, when at least 98% of Realtime Database requests are verified (old cached clients send no token, and in-app webviews should be checked per platform), click **Enforce** for Realtime Database, and then optionally for Authentication. Add `enforceAppCheck: true` to any callable function at that point.

For local dev against the real project, register a debug token under "Manage debug tokens" and set `VITE_APPCHECK_DEBUG_TOKEN`.

## In-app browsers and iOS PWA sign-in

`uaLogic.js` recognises the Instagram, Facebook, TikTok, Snapchat, Twitter, LINE, Pinterest and LinkedIn webviews. There, `OpenInBrowserHint` replaces the Google sign-in button (Onboarding, Profile) and the notifications toggle, and the iOS "Add to Home Screen" hint is hidden; play, rooms and chat are untouched. Android gets an "open in Chrome" intent link, everything else a copy-link button.

Google sign-in in an installed iOS PWA used to lose its redirect result because the auth handler lived on `firebaseapp.com` while the app is served from `web.app`. `VITE_AUTH_SAME_ORIGIN=1` makes `authDomain` follow the serving Hosting host. It is off until the captain adds `https://game-night-91464.web.app/__/auth/handler` to the OAuth web client's authorised redirect URIs (Google Cloud console, APIs & Services, Credentials, the client Firebase created); without that step Google answers `redirect_uri_mismatch`. Then set the variable in `.env.local` and redeploy, and test the upgrade from a home-screen install.

## Ad landing

Point ads at `/play/<game>` (for example `/play/connectfour?utm_source=tiktok&utm_medium=paid&utm_campaign=launch1`). It redirects to `/solo/<game>` with the query string intact, so `attribution.js` still records the UTM tags and click ids, and the visitor is playing against the CPU with no name prompt. The solo page then shows the curated strip (`HEADLINE_GAMES` in `src/lib/adLanding.js`: Connect Four, Dots & Boxes, Battleship, Word Duel, Trivia Blitz, Animal Stack) and a PLAY WITH A FRIEND button instead of the full picker. The same strip appears on Home for someone who has not played anything yet, and gives way to JUMP BACK IN afterwards. An unknown game in `/play/<x>` lands on Connect Four. `/solo/<headline>?utm_...` links get the same treatment.

## Source maps (private)

`vite build` writes hidden source maps (no `sourceMappingURL` in the bundles) and the build moves them out of `dist/` into `sourcemaps/<build id>/` (git-ignored). `firebase.json` also ignores `**/*.map`, so a map cannot reach Hosting. The build id is the `build` field of every error report, so a report finds its own maps. Keep the `sourcemaps/` folder of each release you deploy (it is per machine; copy it somewhere safe if you deploy from several). To read a minified stack from `/notes` or the daily digest:

```
npm run symbolicate -- <build id> < stack.txt
```

## Budget

The captain confirmed a Cloud Billing budget of about $25 per month with alerts on the project (the earlier note that it could not be verified from the CLI is superseded).

## Error alerting

The client already reports uncaught errors, rejections and boundary crashes to `errors/{UTC day}` (`telemetry.js`, admin view on `/notes`). The scheduled function `errorDigest` (`functions/errorDigest.js`, 07:00 UTC) turns yesterday's bucket into `errorDigests/{day}`: total, distinct accounts, the top ten messages with route, game and build, counts per game and per build, and whether a message is new since the previous digest. The digest is alert-worthy when there are at least 50 reports in the day (`ERROR_DIGEST_ALERT_TOTAL`) or a new message was reported three or more times.

An alert always writes a Cloud Logging entry (`severity=ERROR`, `jsonPayload.alert=true`). Two ways to get told, neither configured yet:

1. **Email (captain, console):** Cloud Logging, Logs-based alerting, create an alert on `resource.type="cloud_run_revision" AND jsonPayload.alert=true` (or `severity=ERROR AND textPayload:"error digest alert"`) with the captain's email as the notification channel.
2. **Webhook:** create `functions/.env` with `ERROR_DIGEST_WEBHOOK_URL=<Slack or Discord incoming webhook>` and redeploy the functions. The alert summary is posted as `{ text, content }`.

Read the raw digests in the Firebase console under `errorDigests`; symbolicate a stack with `npm run symbolicate` (see Source maps).

## Hardening pass (before ads)

- **Rules:** every container in a room (`scores`, `board`, `players`, `presence`, `spectators`, `queue`, `chatLog`, `kicked`, `night`, `sealKeys`, `seen`, `wire`, `round`, ...) now refuses a scalar written in its place, so a member can no longer park a huge string there. Board cells must sit at a 1-3 digit index and be a number or a string of at most 16 characters. `tests/rules/hardening.test.js` walks every room key and tries a 100 KB string and a 5,000-entry array. Still open by design: `wire` and `round` are shared sub-trees whose key set is not closed, so a member can still add junk keys there (room-scoped, deleted with the room within a day).
- **`creditMatchResults` cost:** it no longer reads the whole room on every status write. It reads `gameType` first (co-op rooms stop there) and then only the paths the core decides on (`ROOM_PATHS` in `functions/src/core.mjs`: status, scores, winner, board, lastMove, matchLength, arrowsRound, the two seats' presence and player rows). `functions/test/core.test.js` proves that dropping every other key changes no verdict. A member can still flip `status` repeatedly (each flip is an invocation), but each one now costs a few small reads, and `maxInstances: 10` bounds the burst.
- **Functions:** every function has a `maxInstances` cap; `cleanupStaleGames` runs hourly and bounds each run; `errorDigest` and `errorDigests/` prune themselves. `npm --prefix functions audit` still reports moderate `uuid` findings under `firebase-admin` 13 (transitive `@google-cloud/storage`; the flagged `uuid` calls with a `buf` argument are not used here). Clearing them means firebase-admin 14 and firebase-functions 7, both major upgrades: left for a separate, tested change.
