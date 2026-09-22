# Mobile integration plan: Capacitor first

## 1. Decision and status

**Recommendation:** package the existing React application with Capacitor, validate Android first, and add iOS after the Android feasibility gate passes. Keep the existing website and PWA working throughout.

Capacitor runs the existing web UI inside a native application and exposes native capabilities through plugins. It is not React Native and does not convert DOM components into native views.

This document is an implementation plan based on source inspection, not a record of completed work. No Capacitor dependencies, native projects, device builds, or store submissions have been created or tested. Package versions, plugin compatibility, platform requirements, and store policies must be checked against current official documentation when implementation starts.

### Why this route

- The repository currently registers 51 games and variants in `src/lib/games.js`.
- It already has responsive React screens, touch controls, CSS themes, and PWA support.
- Its 46 `*Logic.js` modules provide a useful separation between game rules and rendering.
- Firebase already provides shared identity, rooms, profiles, friends, and game state.
- React Native would require substantial UI, navigation, styling, input, and platform-integration work. Packaging the existing application tests the mobile opportunity with much less duplication.

### Goals

1. Preserve existing web behavior and deployment.
2. Run bundled application assets on Android and iOS.
3. Support mobile-versus-browser multiplayer using existing Firebase state and protocols.
4. Make authentication, invitations, navigation, and lifecycle behavior reliable on devices.
5. Prove one turn-based game and one real-time game before committing to catalog-wide testing.
6. Produce a maintainable release process with explicit compatibility and rollback procedures.

### Non-goals for the first milestone

- Rewriting the UI in React Native.
- Porting all shared logic into a monorepo or new package hierarchy.
- Replacing Firebase, changing game rules, or redesigning the database.
- Adding monetization, ads, push notifications, or background gameplay.
- Adding an over-the-air JavaScript update service.
- Promising store acceptance or full catalog readiness before validation.

## 2. Repository findings and integration points

| Area | Current implementation | Planned treatment |
| --- | --- | --- |
| Build | React/Vite; `vite.config.js`; `dist/` output | Add a separate native build target and output directory. |
| Web deployment | `firebase.json` serves `dist/` | Keep web deployment unchanged; never deploy native output as the website. |
| PWA updates | `VitePWA` and `src/components/UpdatePrompt.jsx` | Preserve on web; disable service-worker registration and PWA update UI in native builds. |
| Navigation | `BrowserRouter` in `src/App.jsx` | Keep web routes; bridge incoming native links into the router. |
| Back navigation | `src/pages/Game.jsx`, `src/hooks/useModalHistory.js`, navigation components | Integrate Android Back without bypassing existing modal and leave-match guards. |
| Authentication | `src/lib/auth.js` uses browser Google popup/redirect flows | Add native Google credential acquisition and link/sign in to the existing JS Firebase Auth instance. |
| Firebase setup | `src/lib/firebase.js` reads Vite environment values | Reuse JS SDK initially; test persistence and WebView origin compatibility. |
| Local state | `localStorage` and `sessionStorage` across game/profile modules | Preserve initially inside WebView; test restart, upgrade, and secret-loss behavior. |
| Invitations | `src/components/WaitingRoom.jsx` builds URLs from `window.location.origin` | Use a canonical public HTTPS origin rather than the native local origin. |
| Sharing | Browser APIs in waiting room and `src/lib/shareCard.js` | Add native sharing where needed, including a separate file-sharing path. |
| Real-time transport | `src/lib/realtime/rtc.js`; public STUN, no TURN | Validate WebView data channels and native/browser interoperability; make a TURN decision from evidence. |
| Input | `src/hooks/use*Controls.js` uses DOM keyboard/pointer events | Retain DOM controls and test device touch behavior. |
| Audio | `src/lib/sounds.js` uses Web Audio | Retain initially; test unlock, interruption, mute, and resume. |
| Themes and layout | `src/index.css`, `src/lib/theme.js`; existing safe-area support | Preserve theme system; fix only measured native layout problems. |

Native Google sign-in is the most important early integration boundary. Real-time lifecycle behavior is the highest gameplay risk.

## 3. Target architecture

### Shared application

Keep the existing `src/` application as the main frontend. Capacitor should load bundled assets, not the production website through a permanent remote `server.url`.

Proposed additions, subject to the initial toolchain check:

```text
capacitor.config.*                 Native application configuration
android/                          Android native project
ios/                              iOS native project, added after Android gate
src/lib/platform/                 Small adapters only where required
  index.js                        Runtime platform detection
  auth.js                         Native credential acquisition boundary
  links.js                        Public URLs and incoming-link validation
  share.js                        Native/web sharing behavior
  lifecycle.js                    App foreground/background event boundary
public/.well-known/               Verified-link association files
```

No separate mobile React application is needed for this approach.

Do not create adapters for every browser API in advance. Introduce one only when a concrete native difference requires it. A Capacitor WebView still supports DOM rendering, CSS, and browser storage; it is not the same runtime constraint as React Native.

### Build separation

Proposed scripts:

- `npm run build`: existing web/PWA build into `dist/`.
- `npm run build:native`: native build into a separate directory such as `dist-native/`, with PWA registration disabled.
- `npm run native:sync`: build native assets, then run Capacitor sync.
- Platform-open scripts for Android Studio and Xcode.

Configure Capacitor's `webDir` to the native output. Ignore generated build output and local IDE/build caches, but commit native project source and reproducible configuration. Keep signing credentials and private keys outside Git.

Use explicit build-time selection for the PWA integration. Merely hiding the update banner is insufficient: the native bundle must not register a web service worker. Because `UpdatePrompt.jsx` imports `virtual:pwa-register/react`, ensure the native build substitutes or excludes that module cleanly rather than leaving an unresolved virtual import.

## 4. Phase 0: prerequisites and baseline

### Tasks

- [ ] Confirm Android-first scope and whether iOS is required for the first public release.
- [ ] Choose the final application name, Android application ID, and iOS bundle ID before registering OAuth clients.
- [ ] Confirm the canonical HTTPS website origin and ownership of its hosting configuration.
- [ ] Confirm access to Firebase configuration, Android signing, and eventual Apple/Google developer accounts.
- [ ] Select compatible Capacitor core, CLI, platform packages, and plugins using current documentation. Record versions and minimum OS requirements.
- [ ] Verify required Node, JDK, Android SDK/Gradle, macOS, and Xcode versions. Do not assume the current web toolchain satisfies native requirements.
- [ ] Choose a test Firebase project where practical; keep experimental rooms and identities out of production.
- [ ] Run `npm test`, `npm run lint`, and `npm run build`; record existing failures separately from migration regressions.
- [ ] Record a browser baseline for Tic Tac Toe, Pong, sign-in, room creation, and invite sharing.
- [ ] Preserve unrelated working-tree changes. Do not combine UI cleanups or existing generated artifacts into integration commits.

### Exit criteria

A reproducible web baseline, an agreed application identity, and a compatible native toolchain are documented. No unrelated refactor is required to start.

## 5. Phase 1: Android shell and bundled assets

### Tasks

- [ ] Install compatible Capacitor packages and initialize configuration.
- [ ] Add the Android native project and the separate native build target.
- [ ] Bundle fonts, icons, images, and dictionary assets from `public/`.
- [ ] Verify assets and fetch paths against the native local origin, including `src/lib/wordhuntDictionary.js`.
- [ ] Disable native service-worker registration, update prompts, and PWA installation prompts.
- [ ] Keep web/PWA registration and installation behavior unchanged.
- [ ] Verify Firebase JS initialization, anonymous sign-in, Realtime Database connection, and error presentation in WebView.
- [ ] Test auth persistence across force-close and relaunch. Select explicit supported persistence if the default proves unreliable; do not create a new anonymous identity on every launch.
- [ ] Verify `crypto.getRandomValues` and SHA-256 behavior on supported WebViews. Never replace cryptographic randomness with `Math.random` for secret commitments.
- [ ] Validate status bar, navigation bar, keyboard resize, safe areas, and system text scaling.
- [ ] Restrict in-app navigation to intended content. Open unrelated external links through the system browser; do not expose the native plugin bridge to arbitrary sites.

### Exit criteria

An Android debug build loads locally bundled assets and can play solo Tic Tac Toe. An online launch obtains a Firebase uid and reconnects with that same uid after restart. The ordinary web build still succeeds and retains PWA behavior.

An offline launch should show usable local content or an explicit offline state rather than an indefinite authentication splash. Offline multiplayer is not a goal.

## 6. Phase 2: identity, Google login, and storage

### Native authentication flow

The existing JS Firebase Auth instance should remain the identity source used by `getUid()`, `AuthContext`, and database access.

1. A vetted native Google sign-in integration obtains a Google credential through the supported native/system flow, not an embedded OAuth page.
2. Convert that result into a Firebase JS Google credential.
3. Link the credential to the current anonymous JS Firebase user when upgrading a guest.
4. If the credential belongs to an existing account, follow the current explicit sign-in fallback and explain that the guest's data is not merged automatically.
5. Let the existing auth observer and profile bootstrap react to the result.

Do not assume signing into a plugin's native Firebase instance signs into the JavaScript Firebase instance. Avoid two independent identity stores. Never put ID tokens, refresh tokens, or credentials in invite URLs, logs, or analytics.

### Tasks

- [ ] Choose a maintained plugin with compatible Capacitor versions and a documented credential-only or equivalent JS-auth bridging flow.
- [ ] Register correct Android package names and certificate fingerprints, including release/Play App Signing identities where applicable.
- [ ] Preserve existing browser popup/redirect behavior outside native builds.
- [ ] Handle cancellation, missing platform services, network failures, revoked access, and credential collisions.
- [ ] Verify anonymous-to-Google linking preserves uid, profile, friends, avatar, and room ownership.
- [ ] Verify existing Google users can sign in and recover their cloud profile.
- [ ] Verify sign-out clears relevant native provider state as needed and creates a fresh guest through the existing flow.
- [ ] Test `localStorage` persistence across restart and app upgrade. Do not assume it survives uninstall or app-data clearing.
- [ ] Define what happens when process death loses a `sessionStorage` secret. Preserve existing concede/recovery behavior rather than leaking secrets into public Firebase state.
- [ ] Confirm that an anonymous web identity does not automatically become the same native identity. Cross-device continuity requires account sign-in or a separately designed transfer mechanism.

### Exit criteria

Guest persistence, Google upgrade, existing-account login, and sign-out pass on a physical Android device. A linked guest keeps its uid. No browser redirect loop or disconnected native/JS identity remains.

## 7. Phase 3: links, invitations, and sharing

### Public URLs

Create one shared helper for public game links, for example:

```text
https://<canonical-host>/game/<gameId>
```

Audit all origin-based URL construction, QR codes, invite messages, and share-card fallbacks. Never share `capacitor://localhost`, an Android local origin, or a development server URL.

### Incoming links

- [ ] Configure Android App Links and host `/.well-known/assetlinks.json` with the correct package and signing certificates.
- [ ] Add iOS Universal Links and `apple-app-site-association` when starting the iOS phase.
- [ ] Verify hosting serves actual association files with appropriate content types, not the SPA fallback HTML. `firebase.json` currently ignores dotfiles, so explicitly address `.well-known` deployment.
- [ ] Support cold-start links and links received while the app is already running.
- [ ] Queue navigation until authentication bootstrapping completes.
- [ ] Accept only the intended HTTPS host and supported route shapes; validate game IDs using the application's actual rules.
- [ ] Process each event once and remove listeners on cleanup.
- [ ] Respect active-match leave confirmation when a different room link arrives.
- [ ] Preserve browser fallback when the app is not installed or association is unavailable.
- [ ] Keep custom URL schemes optional; public invitations should remain usable HTTPS links.

### Sharing

- [ ] Use native text sharing and clipboard plugins only where the browser path is insufficient.
- [ ] Retain browser Web Share and clipboard fallbacks on web.
- [ ] Treat cancellation as cancellation, not an error requiring a toast.
- [ ] Support PNG share cards through the plugin's documented file-sharing mechanism; do not assume a browser `File` can be passed directly to native sharing.
- [ ] Clean up temporary share files and request no broad storage permissions without a demonstrated need.

### Exit criteria

A native-created invitation opens the same room on the website and on an installed app. Cold and warm launches work. QR codes encode public HTTPS URLs. A missing or expired room shows a recoverable screen.

## 8. Phase 4: lifecycle, Back, and mobile UX

### Navigation and layout

- [ ] Integrate Android Back with the existing route, modal, bottom-sheet, and active-match guards.
- [ ] Close the topmost modal before navigating away; avoid double handling between native and browser history events.
- [ ] Define root-screen Back behavior explicitly instead of exiting from arbitrary screens.
- [ ] Test the software keyboard on login/profile, chat, party answers, word entry, and typing games.
- [ ] Verify small displays, cutouts, gesture navigation, system text scaling, rotation, and screen-reader labels.
- [ ] Preserve CSS theme tokens and existing async `useBusy()` conventions.
- [ ] Add native haptics only where useful; prevent duplicate feedback with existing vibration calls.

### Foreground/background handling

Do not promise continuous gameplay while the app is backgrounded. Mobile operating systems may suspend timers, audio, networking, or the entire process.

- [ ] Connect native app-state events to existing gameplay lifecycle boundaries.
- [ ] Clear held keys, drag state, and continuous movement input on backgrounding or interruption.
- [ ] Suspend unnecessary rendering/audio work; re-enable audio only under supported platform rules.
- [ ] On resume, re-read authoritative room state, current game type, turn, scores, and seat ownership before accepting input.
- [ ] Reconcile turn deadlines against server-aligned timestamps where the game already uses them; do not replay stale local timers.
- [ ] Check Firebase reconnection and presence behavior. Keep `onDisconnect`; do not treat background callbacks as guaranteed delivery.
- [ ] Test multiple sessions sharing one uid so one backgrounding app does not incorrectly mark all sessions offline.
- [ ] Define real-time interruption behavior: reconnect, terminate the round, or another explicit policy compatible with browser peers. A local-only pause is not a synchronized multiplayer pause.
- [ ] Prevent large elapsed-time simulation jumps and duplicate score writes after suspension.

### Exit criteria

Background/resume, lock/unlock, process restart, and Android Back do not silently corrupt matches, duplicate listeners, strand overlays, or apply stale moves.

## 9. Phase 5: two-game feasibility gate

### Tic Tac Toe: prove the shared room layer

Test with genuinely distinct users, not two browser tabs sharing one uid:

- Native creates; browser joins, then reverse the roles.
- Two concurrent join attempts still use transactional seat claims.
- Moves, invalid-move feedback, wins, draws, scores, rematches, and spectators behave consistently.
- Reopening the invite reclaims the correct seat after restart.
- Disconnect/reconnect and background/resume do not overwrite newer state.
- Switching game type remounts the correct game on both clients.

### Pong: prove real-time WebView feasibility

Retain the current browser WebRTC implementation for the first experiment. Capacitor does not by itself require `react-native-webrtc`; that dependency belongs to a React Native approach.

Test:

- Native host/browser guest and browser host/native guest.
- Native/native peers on two physical devices.
- Same Wi-Fi, different Wi-Fi networks, and Wi-Fi/cellular combinations.
- Touch latency, audio unlock, stable frame pacing, and a full match.
- Network changes, lock screen, backgrounding, failed connection, retry, and stale signaling cleanup.
- Guest prediction, authoritative scoring, and prevention of repeated finish writes.

### TURN decision

The current transport uses STUN only. A successful same-network test does not demonstrate public-network reliability.

- Record observed connection success, failure, and connection time across the test matrix.
- If public-network reliability is unacceptable, evaluate a TURN service before claiming production real-time support.
- Budget relay bandwidth and credential issuance separately. Use short-lived TURN credentials from a trusted service, not permanent secrets bundled in JavaScript.
- Do not request microphone/camera permissions for data-channel-only gameplay unless an identified platform requirement demands it.

### Go/no-go outcome

**Proceed** when identity, invitation handling, Tic Tac Toe interoperability, lifecycle recovery, and an agreed real-time connection/performance target pass on physical devices.

**Proceed with a limited catalog** only when unsupported games are handled explicitly. Filtering the native picker is insufficient because a browser peer can switch an existing room's mutable `gameType`. Unsupported routes, invites, and remote switches must offer an honest fallback without claiming a player seat that cannot participate.

**Pause** if identity bridging remains unreliable, data is lost, or core WebView behavior cannot meet the target device requirements. Investigate the specific blocker before expanding scope or selecting React Native.

This gate proves the approach, not the readiness of all 51 entries.

## 10. Phase 6: iOS proof and catalog expansion

### iOS proof

- [ ] Add the iOS project using the same bundled application build.
- [ ] Configure signing, bundle identity, URL callbacks, associated domains, and the chosen Google plugin's iOS requirements.
- [ ] Repeat authentication and both game gates on a physical iPhone. Android results do not establish WKWebView compatibility.
- [ ] Test audio interruptions, silent-mode behavior, app switching, keyboard resizing, safe areas, WebRTC, and sharing.
- [ ] Review current Sign in with Apple requirements for the app's third-party login options and implement it if required; do not assume Google-only login is acceptable.

### Catalog expansion order

1. Registry-driven board games: Connect Four, SOS, Dots and Boxes, Reversi, and similar games.
2. Memory, timed, and typing games: timer suspension and keyboard behavior.
3. Hidden-information games: commitment verification and loss of locally stored secrets.
4. Party games: multiple participants, changing roles, deadlines, chat, and host/coordinator recovery.
5. Drawing and gesture-heavy games: Sketch, Word Hunt, and precision touch controls.
6. Remaining real-time games: Snake, Tron, Sumo, Space Duel, Paint, Pac Mac, and Air Hockey.
7. Playground and supporting screens: profile, friends, leaderboard, daily challenges, and local play.

Maintain a catalog checklist with device/OS, build version, test result, and known limitations. Do not mark an entire category validated from a single game.

## 11. Verification strategy

### Automated checks

Retain the existing commands:

```bash
npm test
npm run lint
npm run build
```

Add the native web build and a native compilation check once those scripts exist. Existing pure-logic tests are valuable but do not prove native UI or multiplayer behavior.

Add focused tests for new boundaries where feasible:

- Canonical invite URL generation and rejection of untrusted incoming URLs.
- Cold-start link queuing and duplicate-event handling.
- Authentication decisions: guest linking, existing-account fallback, and cancellation.
- Platform selection that preserves browser behavior.
- Lifecycle cleanup and suppression of stale input or duplicate subscriptions.
- Unsupported game handling, if the native catalog is restricted.

Verify the native build does not register a service worker, and that the web build still does. Run test Firebase rules/emulator checks if data access paths or rules change; do not loosen rules to make a native client connect.

### Manual device matrix

At minimum, cover:

- A lower-performance supported Android phone and a current Android phone.
- A physical iPhone once iOS work begins.
- Current supported browser peers on desktop and mobile.
- Distinct accounts and separate networks for real-time tests.
- Cold launch, warm launch, process death, offline launch, reconnect, upgrade, and logout.
- Both room roles, spectators, rematches, and remote game switching.

Capture results, not just impressions: launch/auth time, connection establishment time, frame pacing, visible input lag, battery/thermal behavior during extended real-time play, and crash/error reports. Agree on numerical targets after obtaining the baseline and before the feasibility gate is accepted.

## 12. Store readiness and release operations

These tasks are outside the initial technical spike but inside the public-release scope.

### Store and privacy checklist

- [ ] Prepare original app icons, splash assets, screenshots, descriptions, age ratings, and support contact details.
- [ ] Publish a privacy policy and complete platform data-safety/privacy disclosures for actual Firebase, analytics, diagnostics, and social behavior.
- [ ] Review current minimum-functionality requirements; packaging a website does not guarantee acceptance.
- [ ] Audit current account-deletion support. No obvious deletion flow was found in the inspected profile/auth files. If accounts can be created, implement the deletion options required by the target stores, including reauthentication and an explicit policy for profiles, friend indexes, invitations, and retained match records.
- [ ] Review chat, drawings, and other user-generated content against applicable reporting, blocking, moderation, and child-safety requirements. Resolve required gaps before submission.
- [ ] Verify platform login requirements, including any required Apple login option.
- [ ] Request only necessary permissions and explain them accurately.
- [ ] Provide review instructions and a reliable way for reviewers to exercise multiplayer without hidden prerequisites.

### Build and distribution

- Commit native project source; keep keystores, signing passwords, service-account keys, and private certificates out of Git.
- Firebase client configuration is not an authorization boundary. Database rules remain responsible for access control.
- Use explicit native version names/build numbers and record the web source commit included in each binary.
- Build Android release artifacts and iOS archives in the supported toolchains; validate release-signed builds, not only debug builds.
- Start with Google Play internal testing and TestFlight before public rollout.
- Keep Firebase Hosting deployment separate from native build and synchronization commands.
- Use staged rollout and privacy-conscious crash/error monitoring. Do not collect raw chat, secrets, credentials, or private gameplay inputs as diagnostics.

### Compatibility and rollback

Native users may run old bundles long after the website updates. Keep Firebase state and WebRTC message changes backward-compatible with supported native releases. If a breaking change becomes necessary, version the protocol or enforce an explicit minimum supported client before allowing incompatible peers into a match.

A native build cannot be rolled back by redeploying Firebase Hosting. Stop a staged rollout if necessary and ship a corrected binary with a new build number. Web rollback remains separate.

The migration itself should remain reversible: platform integrations are additive, web paths are retained, and no database migration is required by packaging alone. Do not introduce a remote-update system as an emergency workaround without a separate security and store-policy review.

## 13. Delivery slices and planning estimates

These are rough engineering ranges for one developer familiar with the repository, not commitments. They exclude store review delays, developer-account approval, major existing bugs, extensive policy remediation, and any React Native rewrite.

| Slice | Deliverable | Rough effort |
| --- | --- | --- |
| Baseline and Android shell | Compatible toolchain, native build, bundled assets, guest boot | 2–4 working days |
| Identity and invitations | Native Google bridge, persistent identity, sharing, verified links | 3–6 working days |
| Lifecycle and two-game gate | Back behavior, resume handling, Tic Tac Toe and Pong device evidence | 3–6 working days |
| iOS proof | Signed device build and repeated identity/game gates | 3–6 working days |
| Catalog and release hardening | Game matrix, fixes, assets, disclosures, internal distribution | 1–3+ working weeks |

TURN deployment, account deletion, login-policy work, and moderation features may add substantial time. Re-estimate after the Android gate rather than promising a full-catalog store launch from the initial inspection.

Suggested implementation slices should stay reviewable:

1. Native build configuration and shell, without auth changes.
2. Authentication bridge and persistence tests.
3. Canonical URLs, deep links, and sharing.
4. Lifecycle, Back, and two-game fixes.
5. iOS configuration and platform-specific fixes.
6. Catalog validation and release requirements.

Do not implement every slice simultaneously. Each slice must preserve `npm run build` and the browser experience.

## 14. When to reconsider React Native

Revisit React Native only if device evidence shows a concrete need, such as:

- Unacceptable input/rendering performance after focused WebView fixes.
- Required native interactions that become fragile or costly through the wrapper.
- A product decision to invest in substantially different native navigation and screens.

The fallback is a new Expo/React Native client sharing tested game logic and Firebase contracts, not an automatic conversion of the Capacitor UI. That path requires separating DOM-dependent board/icon registrations in `src/lib/games.js`, extracting reusable room orchestration from `src/pages/Game.jsx`, native storage/auth/navigation, and a native real-time transport integration.

Do not switch architectures solely because a wrapper requires authentication or deep-link work; a React Native application needs those integrations too.

## 15. Immediate next milestone and stop condition

**Milestone:** an Android device build that preserves identity, opens public game invitations, plays Tic Tac Toe against a browser, and completes an explicitly measured Pong connectivity/lifecycle test matrix.

**Stop after this milestone** to review evidence and decide:

1. Proceed to iOS and catalog validation.
2. Release only a clearly supported subset after compatibility handling is added.
3. Resolve a specific blocker before further rollout.
4. Reconsider React Native based on measured requirements.

No full rewrite, store submission, or catalog-wide completion is implied by passing the initial milestone.
