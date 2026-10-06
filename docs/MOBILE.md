# Game Night on iOS and Android (Capacitor)

The store apps are the same React + Vite build as the website, wrapped by
[Capacitor 8](https://capacitorjs.com/docs) in `ios/` and `android/`. The web
assets are bundled into each binary (`webDir: 'dist'`, no `server.url`), so a
reviewed build never changes when Hosting deploys, and the app starts offline.
The web keeps behaving exactly as before: every native code path sits behind
`isNative` (`src/lib/platform.js`) and loads its plugin with a dynamic import.

Status (2026-10-01): the shell builds for the iOS Simulator and as an Android
debug APK (about 14 MB). On the iOS Simulator (iPhone 17, against the local
emulators) it signed in anonymously, ran Animal Stack at 60 fps, created a
Connect Four room that a web browser joined and played in, reclaimed its seat
after a relaunch, shared `https://game-night-91464.web.app/game/<id>` links,
and dropped and restored presence when sent to the background and back.
On an Android 16 emulator (x86_64 Google APIs image, against the same local
emulators) it signed in anonymously, ran Animal Stack, opened an invite through
`gamenight://game/<id>`, joined a Connect Four room hosted from the web and
exchanged moves both ways, showed the "Leave match?" prompt on the system Back
button instead of exiting, and dropped and restored presence when sent Home and
back. Sign-in with Google or
Apple and push notifications are wired but switched off until the accounts
and keys below exist.

## Build and run

```bash
npm run build                 # or: npx vite build --mode emulator (local emulators)
npx cap sync                  # copies dist/ into ios/ and android/, updates plugins
npx cap open ios              # Xcode: pick a simulator or device, Run
npx cap open android          # Android Studio: Run
```

Command-line builds:

```bash
# iOS Simulator (no signing)
cd ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
# Android debug APK (JDK 21, ANDROID_HOME set)
cd android && ./gradlew assembleDebug   # app/build/outputs/apk/debug/app-debug.apk
```

- Always run `npx cap sync` after `npm run build`, otherwise the app ships the
  previous `dist/`.
- The first iOS build resolves the Firebase iOS SDK through Swift Package
  Manager. Its binary downloads sometimes stall for many minutes; cancel and
  retry (`xcodebuild -resolvePackageDependencies`), and cache SwiftPM
  artifacts in CI.
- To try the app against the local emulators, build with
  `npx vite build --mode emulator`. When another checkout holds ports
  9000/9099, run the emulators from a copy of `firebase.json` on other ports
  and build with `VITE_EMULATOR_AUTH_PORT` / `VITE_EMULATOR_DB_PORT` set to
  them. The iOS Simulator reaches the Mac's `127.0.0.1`; for an Android
  emulator or device, forward the ports first (`adb reverse tcp:9099 tcp:9099`
  and the same for the database port), since the app connects to `127.0.0.1`.
  Debug builds carry a network security config (`android/app/src/debug`) that
  allows cleartext HTTP to `127.0.0.1`; without it Android blocks the emulator
  traffic and sign-in fails with `auth/network-request-failed`. Release builds
  keep the platform default, which blocks cleartext.

## What is where

| Concern | Where |
|---|---|
| Bundle id / application id (placeholder `app.gamenight`) | `APP_ID` in `capacitor.config.ts`; also `PRODUCT_BUNDLE_IDENTIFIER` in `ios/App/App.xcodeproj` and `applicationId`/`namespace` in `android/app/build.gradle` (update all three) |
| Platform detection, public link origin | `src/lib/platform.js` (`isNative`, `PUBLIC_ORIGIN`, `shareUrl`) |
| Launch flags (all off) | `src/lib/features.js`: `VITE_NATIVE_GOOGLE_SIGNIN`, `VITE_NATIVE_APPLE_SIGNIN`, `VITE_NATIVE_PUSH` |
| Splash, system bars, Android back, pause/resume, keyboard bar | `src/lib/native/shell.js` (+ `shellLogic.js`) |
| Native-only CSS (no pull-to-refresh, zoom, tap flash, selection) | `html[data-native]` rules in `src/index.css` |
| Haptics | `src/lib/haptics.js` (`navigator.vibrate` on the web, `@capacitor/haptics` in the shell) |
| Google / Apple sign-in, re-auth before deletion, Apple revocation | `src/lib/auth.js`, `src/lib/native/nativeAuth.js`, `src/lib/nativeAuthLogic.js` |
| Native push | `src/lib/push.js`, `src/lib/native/nativePush.js`, `functions/push.js` |
| Invite links opening the app | `public/.well-known/*`, `src/lib/deepLinkLogic.js`, `src/lib/native/deepLinks.js` |
| Minimum-version gate | `config/minNativeVersion` in the database, `src/lib/versionGateLogic.js`, `src/components/NativeUpdateGate.jsx` |
| Icons and splash images | `node scripts/make-icons.mjs --native` |

Behaviour in the shell, in short:

- Shared and invited links use `PUBLIC_ORIGIN` (default
  `https://game-night-91464.web.app`, override with `VITE_PUBLIC_ORIGIN`),
  never `capacitor://localhost`.
- No service worker, no update prompt, no App Check (reCAPTCHA cannot attest
  the app's origin; native App Attest / Play Integrity is later work, so keep
  App Check "Unenforced" for the Realtime Database and Auth until then).
- The splash stays up until auth has settled and the first screen has
  rendered (at most 6 s).
- Backgrounding the app drops the database connection, so presence goes
  offline straight away and opponents see WAIT / CLAIM WIN as they would for a
  closed tab; returning reconnects. Android also pauses the web view so
  animation loops stop.
- Android back closes an open sheet, then goes back, then goes home, then
  minimizes the app.
- Haptics: sound cues give a light tap in the shell (never on the web), and
  wins, refused moves and losses use the platform's notification haptics
  (`hapticNotify` in `src/lib/haptics.js`). Settings › Audio › HAPTICS turns
  all of it off; it is separate from the sound switch.
- Without the sign-in flags the shell shows no Google or Apple button (the web
  popup cannot work in a web view). Without `VITE_NATIVE_PUSH` the
  notifications toggle is hidden.

## Captain's steps

These need accounts or decisions this repository cannot make. Placeholders are
written in capitals so a search finds them all:
`grep -rn "PLACEHOLDER" ios android public/.well-known src/lib/versionGateLogic.js`.

### 1. Accounts and identity

1. Enroll in the Apple Developer Program ($99/year) and note the **Team ID**.
2. Create the Google Play Console account ($25). A personal account created
   after 2023-11-13 must run a closed test with 12 testers for 14 days before
   production; an organization account (D-U-N-S number) is exempt.
3. Choose the final **bundle id**. If it is not `app.gamenight`, change the
   three places listed under "What is where", plus `appIDs` in
   `public/.well-known/apple-app-site-association`, `package_name` in
   `public/.well-known/assetlinks.json` and the Play URL in
   `src/lib/versionGateLogic.js` (`STORE_URLS`).
4. Decide whether a custom domain comes first. It becomes the link host:
   set `VITE_PUBLIC_ORIGIN` (and `VITE_LINK_ORIGINS` for any other host that
   stays valid), add `applinks:<domain>` to `ios/App/App/App.entitlements` and
   an `https` `<data>` host to `android/app/src/main/AndroidManifest.xml`, and
   serve `/.well-known/` from that domain without redirects.
5. Set the support email (`VITE_CONTACT_EMAIL`); both stores require published
   contact details.

### 2. Firebase apps and config files

1. Firebase console → Project settings → Add app: register an **iOS** app with
   the bundle id and an **Android** app with the application id. For Android,
   add the SHA-1 and SHA-256 of the debug key, the upload key and the Play App
   Signing key.
2. Download `GoogleService-Info.plist` into `ios/App/App/` and add it to the
   App target in Xcode (drag it into the App group, "Copy items if needed",
   target App ticked). Download `google-services.json` into `android/app/`.
   Without these files the Firebase plugins stay inactive; the rest of the app
   works, since the web SDK uses the `VITE_FIREBASE_*` config.
3. In `ios/App/App/Info.plist`, replace
   `com.googleusercontent.apps.REVERSED_CLIENT_ID_PLACEHOLDER` with the
   `REVERSED_CLIENT_ID` value from `GoogleService-Info.plist`.
4. If the browser API key is restricted by HTTP referrer, allow
   `capacitor://localhost` and `https://localhost`, or Auth and the Realtime
   Database fail inside the apps.

### 3. Google sign-in (both platforms)

1. Firebase Auth → Sign-in method: Google is already on for the web; the iOS
   and Android OAuth clients are created when the apps are registered (step
   2.1). Re-download the config files if they were fetched before.
2. Build with `VITE_NATIVE_GOOGLE_SIGNIN=1`.
3. Test: guest → sign in (keeps the same uid, profile carries over), an
   account that already exists on another device (signs into it), dismissing
   the sheet, and Profile → Delete my data (re-authenticates first).

### 4. Sign in with Apple (iOS)

Required on iOS by App Store guideline 4.8 once Google sign-in is offered.

1. Apple Developer → Identifiers → the App ID: enable **Sign in with Apple**.
2. Create a **Services ID** and a **Sign in with Apple key** (.p8); set the
   Services ID return URL to `https://<authDomain>/__/auth/handler`.
3. Firebase Auth → Sign-in method → Apple: enable, and enter the Services ID,
   Team ID, key ID and private key. The key is also what lets account deletion
   revoke the Apple authorization (guideline 5.1.1(v)).
4. The entitlement is already in `ios/App/App/App.entitlements`; with
   automatic signing Xcode registers the capability on the App ID.
5. Build with `VITE_NATIVE_APPLE_SIGNIN=1`.
6. Test on a device: sign in as a guest, then delete the account, and check
   that Settings → Apple ID → Sign in with Apple no longer lists Game Night.
   The revocation call has not yet run against the live backend.

Note: Apple shares the person's name only on the first authorization, and the
current flow does not capture it; Apple users keep the name they chose in the
app.

### 5. Push notifications

1. Apple Developer: enable **Push Notifications** on the App ID and create an
   **APNs auth key** (.p8; note its Key ID).
2. Firebase console → Project settings → Cloud Messaging → Apple app
   configuration: upload the APNs key with its Key ID and Team ID.
3. The config files from step 2 are required on both platforms.
4. Deploy the database rules and Cloud Functions **before** the first native
   build that has push on: the rules accept the new `platform` field on
   `users/{uid}/fcmTokens`, and `sendInvitePush` sends a visible notification
   to native tokens (a data-only push is never shown on iOS). Web tokens keep
   the data-only payload their service worker draws.
5. Build with `VITE_NATIVE_PUSH=1`.
6. What is sent (`functions/push.js`): game invites, friend requests, and
   "your friend joined your room" to a host who has left the app. The app asks
   in context (`PushNudge`: the waiting room and the Friends page, snoozed two
   weeks by NOT NOW) as well as from Profile; once refused, Profile shows OPEN
   SETTINGS (`src/lib/native/appSettings.js`; on Android the app-local
   `AppSettingsPlugin`).
7. Test on real devices (the iOS Simulator cannot receive remote pushes):
   enable in Profile → notifications, send an invite from another account,
   tap the notification with the app closed and with it in the background;
   both should open the room.

`ios/App/App/App.entitlements` sets `aps-environment` to `development`; Xcode
switches it for distribution builds.

### 6. Universal Links and App Links

1. Replace `TEAMID_PLACEHOLDER` in
   `public/.well-known/apple-app-site-association` with the Team ID.
2. Replace `SHA256_CERT_FINGERPRINT_PLACEHOLDER` in
   `public/.well-known/assetlinks.json` with the **Play App Signing**
   certificate SHA-256 (Play Console → Test and release → App integrity), as
   colon-separated hex. Add the upload key's fingerprint as a second entry if
   you install locally signed release builds.
3. Deploy Hosting (the `firebase.json` headers serve both files as JSON).
4. Check: `https://game-night-91464.web.app/.well-known/apple-app-site-association`
   returns the JSON with no redirect; on Android run
   `adb shell pm get-app-links app.gamenight` after installing.
5. Links that are not verified still work through the `gamenight://` scheme
   (for example `gamenight://game/<id>`). On the Simulator,
   `xcrun simctl openurl booted gamenight://game/<id>` first shows iOS's
   "Open in Game Night?" prompt; tap Open. The routing itself is covered by
   `src/lib/deepLinkLogic.test.js` but has not yet been clicked through on a
   device.

### 7. Minimum-version gate

A store binary stays installed for months while the database rules change
with every deploy. To force an update, set in the Realtime Database console:

```json
"config": { "minNativeVersion": { "ios": "1.2.0", "android": "1.2.0" } }
```

Builds older than the value show a blocking UPDATE REQUIRED screen with a
store button. A missing or malformed value, or a failed read, never blocks.
The versions compared are the app's marketing version (`MARKETING_VERSION` in
Xcode, `versionName` in `android/app/build.gradle`). Replace
`APPSTORE_ID_PLACEHOLDER` in `src/lib/versionGateLogic.js` once the App Store
record exists. Deploy the rules before relying on it.

### 8. Store listings and review

- App Store privacy labels and the Play Data safety form must match the data
  the app handles: uid, display name, FCM tokens (with user agent), error
  reports, Google email, chat, and the peer IP address in real-time games.
- Age rating: public chat with strangers and user-generated names, chat and
  drawings put it at about 13+ (16+ if the public lobby stays unmoderated).
  Do not target children.
- v1 is iPhone only (`TARGETED_DEVICE_FAMILY = 1`; iPads run it in
  compatibility mode) and portrait only on both platforms. The shell has no
  in-app purchases: `monetizationActive` returns false whenever `isNative`.
- Terms, Privacy and Support links inside the shell point at the public https
  pages (`legalHref`, `src/lib/legal.js`), since `capacitor://localhost` cannot
  be opened by the system. The Support URL for App Store Connect is
  `/support`; the Play account-deletion URL is `/privacy#delete`.
- Before every upload run `npm run native:bump` (add `-- 1.1` for a new
  marketing version): it raises the build number on both projects.
- Blocking and reporting: a player's name in room chat or on the Friends page
  opens BLOCK and REPORT (blocks sync to `blocks/{uid}`); Sketch guessers can
  report a drawing. Mention these in the review notes.
- Review notes: solo and bot modes let a reviewer play without a second
  device.
- Play: internal testing, then closed testing (the 12-tester rule above),
  then production. iOS: TestFlight, then App Review.

## Decisions still open

- Game audio uses the `.ambient` AVAudioSession category (`AppDelegate.swift`),
  so it follows the silent switch and mixes with the player's own music. Use
  `.playback` instead if sound should play with the switch on.
- Whether invite links and share cards move to a custom domain before launch.
- Party voice ends when the app goes to the background and rejoins on return
  (the panel then says VOICE PAUSED WHILE YOU WERE AWAY). Keeping it alive
  would need the `audio` background mode and a native audio-session hand-off.
  Not yet checked on a device: whether game sounds return to the speaker and
  follow the silent switch after leaving voice (WebKit switches the session to
  play-and-record while the mic is open, over the `.ambient` category above).

## Profiling and debugging

- **iOS (Simulator or device):** Safari → Settings → Advanced → "Show features
  for web developers", then Develop → *the simulator or device* → Game Night.
  Debug builds are inspectable (Capacitor sets `isInspectable` in debug).
  Timelines → record a game to see frame rate, JavaScript and layout time; the
  Console shows the app's logs and errors with stacks, which is also how to
  trace an opaque `Script error.`. Native logs:
  `xcrun simctl launch --console-pty booted app.gamenight`.
- **Android:** enable USB debugging, open `chrome://inspect` in desktop
  Chrome and pick the Game Night web view. The Performance panel records
  frames; CPU throttling approximates a low-end phone. Native logs:
  `adb logcat | grep -i capacitor`.
- Measure on real low-end hardware before release: the Simulator runs on the
  Mac's CPU.
- Field data: every native launch bumps `bootDaily/{day}/{ios|android}/{bucket}`
  (page start to first screen: `lt1s`, `lt2s`, `lt4s`, `lt6s`, `slow`;
  admin-read). The entry chunk (about 780 KB, mostly React, React Router and
  the game registry) is worth splitting if `lt2s` stops being the common
  bucket on Android.

## Performance notes

- WKWebView and the Android web view run the same engines as Safari and
  Chrome; the audit measured 57–60 fps for DOM, canvas and physics games on
  the Simulator.
- Canvas games cap `devicePixelRatio` at 2 on low-end Android
  (`canvasPixelRatio()` in `platform.js`).
- Backgrounded apps stop animation loops (iOS by itself, Android via
  `WebView.onPause()` in `MainActivity`) and drop the database socket.
- Real-time P2P games on mobile networks need TURN (`VITE_TURN_*`), as on the
  web.
