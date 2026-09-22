# Game Night

A browser-based multiplayer games platform. Play with friends in real time — no account needed. Share a link, join instantly.

**Live:** https://game-night-91464.web.app

## Games

**30 games** across five categories, plus a daily solo puzzle. Every multiplayer game runs in a shareable room; most also have a solo vs-AI practice mode at `/demo`.

### Board (10)
- **Tic Tac Toe** — the classic 3×3
- **Ultimate Tic Tac Toe** — nine boards in a 3×3 grid; your move dictates which board your rival plays next; win three boards in a row *(selectable as a mode when starting Tic Tac Toe)*
- **Connect Four** — 6×7 drop-a-disc
- **Connect Four Pop Out** — drop *or* pop one of your own bottom discs so the column slides down; a pop can complete a line for either player *(selectable as a mode when starting Connect Four)*
- **Dots & Boxes** — 6×6 by default (first to 19 clinches); 4×4 classic mode via +MODES ([design notes](README-dots-and-boxes.md))
- **SOS** — 7×7; place an S or an O anywhere; each S-O-S line scores and grants another move
- **Gomoku** — five in a row on 15×15
- **Reversi** — 8×8 capture-and-flip with forced passes and big late-game swings
- **Order & Chaos** — asymmetric 6×6: Order wants any five-in-a-row, Chaos wants a full board without one
- **Pig** — push-your-luck dice; bank or roll, a 1 wipes your turn; first to 100

### Reflex & skill (10)
- **Reaction Time** — four wait-for-green rounds, lowest milliseconds wins
- **Aim Trainer** — race to click targets
- **Typing Race** — same passage, live ghost cursor, effective WPM (speed × accuracy) wins
- **Mental Math** — 2-minute blitz with speed scoring, ⚡ power questions, and 🔥 streak multipliers
- **Arrows Puzzle** — shared-board tap duel: clear snake arrows, avoid the trap, best of 3 rounds (easy → medium → hard) ([review & backlog](docs/README-ARROWS-REVIEW.md))
- **Pong** — real-time paddle duel over WebRTC
- **Snake Battle** — two snakes, one arena, real-time
- **Tron** — light-cycle trails, one collision decides it
- **Sumo Arena** — shove the other blob off a shrinking platform
- **Space Duel** — asteroids-style ship combat with HP and cooldowns

### Memory (4)
- **Simon** — the pad sequence flashes once, replay it from memory, then extend it
- **Chimp Test** — numbered squares flash then hide; click them in order as the count climbs
- **Number Memory** — memorize a number that grows a digit per level
- **Visual Memory** — reproduce a flashed tile pattern

### Word & bluff (3)
- **Hangwoman** — hidden-word game; a salted SHA-256 commit–reveal scheme keeps the word secret with no server, and a cheating word-keeper is detected *and forfeits the round* ([design](docs/HANGMAN.md))
- **Two Truths & a Lie** — fool the guesser or catch the lie (commit–reveal keeps the lie index secret)
- **Bluff Battle** — liar's dice with cryptographically committed rolls

### Party · 3–8 players (3)
- **Wavelength** — read the clue-giver's mind on a hidden spectrum
- **Fibbage** — invent fake answers, vote for the truth, score for fooling the room
- **Spyfair** — everyone knows the location except the spy; find them before the vote

### Daily
- **`/daily`** — a date-seeded solo puzzle, same board for everyone, personal best tracked locally

## How it works

1. Enter your name and pick a game — games with variants (Tic Tac Toe, Connect Four) first ask which mode you want
2. Share the room link (or the 6-character code) with a friend
3. They open it and play — moves sync in real time via Firebase
4. **PLAY AGAIN / NEW MATCH / SWITCH GAME** are propose-and-accept: the opponent gets an ACCEPT/DECLINE banner (applies instantly if they're offline). Switching keeps players, presence, and the room code
5. Extra visitors become spectators; party games seat 3–8 players with a host-driven START

Standard games play first-to-3-rounds; Pong has a configurable match length; the arena games (Tron / Sumo / Space Duel) are single-round.

## Identity & social

Every visitor is signed in **anonymously** with Firebase Auth on boot — a real uid with zero login UI, keeping the "no account needed" promise. Optionally **upgrade to Google** (one tap) to make your profile permanent and cross-device; the uid is preserved so your avatar, friends, and stats carry over.

- **Profiles** — display name + one of 19 pixel-art avatars (`/profile`)
- **Friend codes** — a unique 6-character code (unambiguous alphabet); add friends by code, accept/decline requests (`/friends`)
- **Game invites** — invite an online friend into your room from the waiting screen; they get a JOIN card on their home page
- **Presence** — online/offline dots for friends and opponents, powered by `onDisconnect`
- **Local stats** — lifetime W/L, streaks, per-game and head-to-head records in `localStorage`

## Architecture

There is **no backend server**. Firebase Realtime Database holds every room at `games/{gameId}`; security rules are the entire trust boundary.

- **Turn-based games** are pure registry entries (`src/lib/games.js` → `GAME_TYPES`): board size, move validation, win detection, board component. `Game.jsx` has no per-game branches. Non-standard turn shapes (extra turns, letters, dice) use the `applyMove`/`boardProps` hooks; variants declare `variantOf` to appear in the pre-game mode chooser instead of the main grid.
- **Hidden information** never touches the database in plaintext: the secret stays in the owner's `sessionStorage` and only a salted SHA-256 commitment is published (`src/lib/commit.js`); clients verify the reveal. Hangwoman, Two Truths, Bluff Battle, Wavelength, and Spyfair's location all use this.
- **Party games** use an N-player room model: `players` keyed by uid, host-driven start, per-player scores, and phase state machines with disconnect-safe progression (offline players don't stall reveals or votes).
- **Real-time games** (Pong, Snake, Tron, Sumo, Space Duel) run peer-to-peer: Firebase is only the WebRTC signaling channel; gameplay frames travel over an unreliable/unordered `RTCDataChannel`. The host (X) runs the authoritative simulation and streams ~30 Hz snapshots; the guest predicts its own input locally. Pure sims live in `src/lib/*Logic.js` (unit-tested, no DOM/network); transient network blips get a recovery grace window before failing. Public STUN only — no TURN, so ~5–10% of peers behind symmetric NATs see a CONNECTION FAILED / RETRY state.

## Features

- **Six switchable themes** (Midnight Arcade, Phosphor, Amber CRT, Synthwave, The Grid, 1-Bit Mono) — all colors flow through CSS variables; a theme is one CSS block + one registry entry
- **Retro CRT look** — Press Start 2P, neon glows, scanlines, pixel-art cursors, themed caret
- **8-bit audio + haptics** — Web Audio API sound engine (no audio files), mobile vibration, shared mute toggle
- **Shareable result cards** — themed pixel-art canvas cards via the native share sheet, PNG fallback
- **Emote reactions** — 🔥 😂 😭 😎 👏 💀 float over the room for both players
- **Rules overlays** — every game card and in-game header has a HOW TO PLAY modal (`src/lib/rules.js`)
- **Seat reclaim** — your auth uid is stamped into your seat; closing a tab and reopening the link reclaims it
- **Idle/disconnect resilience** — offline opponents unlock instant rematch/switch; idle opponents in memory duels can be claimed against after a timeout; dropped party players don't stall rounds
- **PWA** — installable, offline home screen, UPDATE READY banner instead of mid-game auto-reload
- **Mobile-tuned** — safe-area insets, fast taps, responsive boards, reduced-motion support
- **Solo practice** — `/demo` runs local vs-AI versions of the board games and skill games with no Firebase

## Security

`database.rules.json` is deployed as the sole trust boundary:

- All game reads/writes require **auth** (anonymous counts — no login friction)
- A seat's `playerId` is **immutable and self-only** (`newData === auth.uid`) — seats can't be hijacked or spoofed
- Profiles are readable only by signed-in users; friend lists/requests/invites only by their owner; **invites can only be sent by actual friends** and must carry the sender's real uid
- Friend codes can be claimed once, never overwritten

Deploy rules with `firebase deploy --only database`, and enable **App Check** in the Firebase console for abuse resistance.

**Known trust limits** (inherent to serverless + world-readable rooms, documented in code): a determined devtools user can read Spyfair roles from the room node, look up Fibbage answers in the bundled deck, or read memory-game answer arrays. Fine between friends; a leaderboard would need server-authoritative writes (Cloud Function) first.

## Tech stack

| | |
|---|---|
| Frontend | React 19 + Vite 8 |
| Styling | Tailwind CSS v3 + shadcn utilities |
| Routing | React Router v7 |
| Data / auth | Firebase Realtime Database + Firebase Auth (anonymous → Google link) |
| Real-time games | Native WebRTC (`RTCPeerConnection`), RTDB signaling |
| Tests | Vitest — 28 suites over the pure game/commit/social logic |
| Toasts | Sonner |
| PWA | vite-plugin-pwa (Workbox) |
| Hosting | Firebase Hosting |

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Set up Firebase config
cp .env.local.example .env.local
# Fill in your Firebase project values in .env.local

# 3. Start dev server
npm run dev
# → http://localhost:5173
```

### Firebase setup (one-time)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Realtime Database** (Build → Realtime Database → Create database)
3. Enable **Authentication** and turn on the **Anonymous** and **Google** sign-in providers — without Anonymous, sign-in and the friends system won't work
4. Register a web app (Project Settings → Your apps → `</>`) and copy the config into `.env.local`
5. Deploy the security rules: `firebase deploy --only database`
6. (Recommended) enable **App Check**

Note for manual multiplayer testing: same-browser tabs share the auth uid, so the second player needs a private/incognito window or another browser. Two ordinary tabs CAN play as two distinct players with the dev testing mode below (F-51) — see `docs/DEV-MULTIPLAYER.md`.

## Local multiplayer testing (dev emulators)

Same-browser testing of two-player and party games without incognito profiles — each tab gets its own isolated identity backed by local Firebase emulators (no `.env.local` needed for this mode):

```bash
# Terminal 1 — Auth + Realtime Database emulators (local demo project)
npm run test:emulators

# Terminal 2 — Vite dev server with the testing flag on
npm run dev:test
# → http://localhost:5173 shows the DEV MULTIPLAYER LAUNCHER
```

From the launcher, open slots **P1**–**P8** or **SPECTATOR** — each opens an ordinary tab as a separate player (`?devPlayer=p1`). Full walkthrough + limitations: `docs/DEV-MULTIPLAYER.md`.

## Commands

```bash
npm run dev            # dev server with HMR
npm run build          # production build → dist/
npm run preview        # serve dist/ locally
npm run lint           # ESLint
npm test               # Vitest — 28 suites covering every game's pure logic + commit-reveal + social helpers
npm run test:emulators # local Firebase Auth + RTDB emulators (demo-gamenight-test project)
npm run dev:test       # dev server with the local-multiplayer testing flag on
```

## Deploy

```bash
npm install -g firebase-tools
firebase login
npm run build
firebase deploy --only hosting           # hosting only
firebase deploy --only hosting,database  # hosting + security rules
```

The `functions/` directory contains a scheduled Cloud Function that deletes rooms inactive for 24h (requires the Blaze plan): `firebase deploy --only functions`.

## Adding a new game

The room/invite/presence layer is game-agnostic. A standard board game is:

1. A logic file in `src/lib/` exporting `getWinner(board)` + move helpers, with a `.test.js`
2. A board component in `src/components/`
3. An icon in `src/components/GameIcons.jsx`
4. One `GAME_TYPES` entry in `src/lib/games.js` — this alone drives the home grid, the SWITCH GAME picker, `freshGameState()`, and everything `Game.jsx` renders

Non-standard turn shapes supply `applyMove()` (full control of the Firebase patch — extra turns, captures, letters) and `boardProps()` (extra props for the board). Variants add `variantOf: '<baseType>'` + `variantLabel`/`variantBlurb` to appear in the pre-game mode chooser instead of the grid. Bespoke flows (`custom: true`) get their own page dispatched from `Game.jsx`; party games add `nPlayer: true, minPlayers, maxPlayers`. Real-time games build on `src/lib/realtime/` (`useRealtimeHost`/`useRealtimeGuest` + a pure sim).

Sounds, presence, score tracking, switching, rules modals, and the win effect work automatically for any game type.

## Project structure

```
src/
  lib/
    games.js                 # THE registry (GAME_TYPES) + freshGameState()
    *Logic.js (+ .test.js)   # pure per-game logic — no DOM, no network
    commit.js                # salted SHA-256 commit–reveal primitive
    auth.js / AuthContext.jsx# anonymous boot + Google upgrade (same uid)
    social.js                # profiles, friend codes, requests, invites, presence
    realtime/                # WebRTC transport + host/guest sync hooks
    decks/                   # party-game content decks
    theme.js / sounds.js / shareCard.js / rules.js / profile.js
  components/                # boards, GamePicker, VariantChooser, Avatar, WinEffect, …
  pages/                     # Home, Game (all rooms), Demo, Daily, Profile, Friends,
                             # + one page per custom game (Hangman, Pong, Fibbage, …)
  hooks/                     # input controls per real-time game, PWA install
functions/                   # scheduled room cleanup (Blaze)
database.rules.json          # the security boundary — deploy after every change
```

## Improvement backlog

Ranked by player impact. Status as of 2026-09-19 (unit tests green: 155 files / 3483 tests). Most of the August review's top-10 items are already fixed; these are what remains. Arrows Puzzle review: [docs/README-ARROWS-REVIEW.md](docs/README-ARROWS-REVIEW.md).

### Finish / ship

1. **Notes (feedback) feature is uncommitted** — `src/pages/Notes.jsx`, `src/lib/feedback.js`, the `/notes` route + tab, and the `feedback` rules block. Works, but nothing in the app sets `users/{uid}/admin` (only the rules reference it) — set it once from the Firebase console or add a script. Add `feedback.test.js` for the `normalize*` helpers, then commit.
2. **Herd Mind still leaks answers** — `HerdGame.jsx` writes plaintext to `round/answers` the moment a player submits, before the window closes for everyone else. The commit-reveal imports (`makeCommit`, `verifyReveal`, `allCommitted`) are already there but unused; finish wiring the same salted commit-reveal pattern Hangwoman/Wavelength/Bluff/Word Duel use.
3. **Word Hunt dictionary is unfiltered** — `public/wordhunt-dict.txt` still contains playable slurs/profanity. One denylist pass at asset-prep time, no logic change.

### Arrows Puzzle (review 2026-09-19)

Full write-up: [docs/README-ARROWS-REVIEW.md](docs/README-ARROWS-REVIEW.md). Suggested ship order: **A → B → C** before more levels.

4. **ARROWS-A — Match closure after 3 rounds** — After easy/medium/hard, if neither side has 2 round wins, force a match draw (per PRD). Today “Play again” can fall through into another easy board while match scores keep climbing.
5. **ARROWS-B — Trap readability** — Blocked arrows look identical until tapped. Add a soft visual tell and/or a first-match tip (“One arrow is a trap — three lives”).
6. **ARROWS-C — Feel under lag** — Hit/miss audio fires before the tap is confirmed; play sound from the transaction result. Enlarge invisible hit pads on short/crowded snakes for phones.
7. **ARROWS-D — Round rhythm / coaching** — Show level label (e.g. `TIGHT PACK`), a short interstitial on round start (“MEDIUM — 10 arrows · 1 trap”), and a first-match tip.
8. **ARROWS-E — Spectator / out-of-lives HUD** — Keep the full HUD for spectators and KO’d players; dim their side and label `OUT` instead of clears-only / text-only.
9. **ARROWS-F — Trap / content depth (v2)** — Static one-trap-per-level gets predictable. Next levers: 0–2 traps on hard, dynamic unblock, ban recently played level ids in a room.
10. **ARROWS-G — Solo / teach mode** — Short solo practice board (same rules, no match score) so discovery doesn’t require a second player.
11. **ARROWS-H — Accessibility polish** — Prefer `pointerdown` + `touch-action: manipulation`; announce clears/lives to screen readers; enlarge life glyphs slightly.
12. **ARROWS-I — Hard-tier balance** — Hard is mostly density (16 arrows, still one trap). Try more traps on hard, or fewer clearable arrows with messier routing so exit-direction reading matters more than raw click speed.

### Correctness

13. **Lint has 19 errors** — one impure call during render in `DailyGame.jsx`, the rest unused imports/vars (six of them in `HerdGame.jsx`, cleared by item 2). Add `npm run lint` to the pre-push gate / CI so it can't drift again.
14. **Reversi auto-pass** now exists in `games.js` — verify the double-blocked case (neither player can move) ends the round rather than passing forever.

### Performance

15. **Single ~1.7 MB JS bundle** — no `React.lazy` anywhere in `App.jsx`/`Game.jsx`, no `manualChunks`; every game page loads eagerly. Lazy-load per game page (via the `GAME_TYPES` registry or route level) to cut first load substantially for cold mobile visits.

### Platform themes (open since the August review)

16. **Host latency advantage** in Pong / Air Hockey / Space Duel — no input-delay compensation. Options: host delays its own input by half RTT, or lag-compensated hit detection.
17. **Mixed-game leaderboard** — wins in Pong and Tic Tac Toe rank equally. Split by game or category.
18. **`--c-dim` contrast** — still fails AA body-text contrast on `card` surfaces in several themes. Extend the existing theme contrast regression tests to cover `dim` on `card`, then raise the token per theme.
19. **No TURN server** — roughly 5–10% of P2P connections fail behind symmetric NATs. Add a free-tier TURN provider or accept the failure rate.

### Hygiene

20. **No end-to-end tests** — a Playwright smoke test (create room, join from a second context, play one Tic Tac Toe move) would catch multiplayer regressions unit tests never see.
21. **`Game.jsx` is ~1,900 lines** — extract the lobby, status, and proposal-handshake logic into hooks.
22. **Unreviewed layer** — `src/hooks/`, the sound layer, `src/components/loading/`, and `EmoteBar.jsx` have never been audited. Run the `review-a-game` checklist on the reflex games (Arrows covered in [docs/README-ARROWS-REVIEW.md](docs/README-ARROWS-REVIEW.md)).

Suggested order: 4, 5, 6 (Arrows A→B→C), then 1, 2, 3, 15, 13.

## Roadmap

- **Leaderboards + cross-device stats** — the biggest open opportunity: persist skill-game scores (reaction ms, WPM, chimp level, daily results) to `users/{uid}`, add global + friends boards. Blocked on server-authoritative score writes (Cloud Function) so scores aren't forgeable
- **Realtime polish** — TURN fallback for symmetric NATs, guest-side forfeit when the host drops mid-round, live spectator state for the arena games, softer host advantage
- **More depth** — pie/swap openings for first-player-advantage games, Reversi misère mode, power-ups for the arena games
- **Party QoL** — host migration when the host leaves, bigger content decks
- **Chat / matchmaking / pass-and-play** — long-tail candidates
