# Game Night

A browser-based multiplayer games platform. Play with friends in real time — no account needed. Share a link, join instantly.

**Live:** https://game-night-91464.web.app

## Games

**64 games** (72 counting modes) across six categories, plus a daily solo puzzle. Every multiplayer game runs in a shareable room; most also have a solo vs-AI practice mode at `/demo` with EASY / NORMAL / HARD bots for the board games. This list is generated from the `GAME_TYPES` registry (`src/lib/games.js`), which is the source of truth.

### Board games (24)
- **Tic Tac Toe** — three in a row wins — modes: Ultimate TTT, TTT 4×4
- **Sim** — color an edge, don't close a triangle
- **Chomp** — eat the bar, dodge the poison
- **Breakthrough** — race a pawn to the far row
- **Ataxx** — clone, jump, convert the neighborhood
- **Kamisado** — your landing picks their tower
- **Onitama** — the way of the master — your card becomes their move
- **Quarto** — place the piece you are given, give the next
- **Santorini** — climb the island, build their grave
- **Lines Of Action** — move as far as the line is crowded, unite all
- **Yavalath** — four in a row wins — three in a row loses
- **Connect Four** — four in a row wins — modes: C4 Five, C4 Pop Out
- **Dots & Boxes** — claim the most boxes — modes: Dots & Boxes 4×4
- **SOS** — spell the most S-O-S
- **Gomoku** — five in a row wins — modes: Gomoku Swap
- **Reversi** — flip the board your way
- **Chain Reaction** — trigger chain explosions — modes: Chain Reaction 6×8
- **Chain Reaction 4P** — 2–4 player chain explosions *(2–4 players)*
- **Blockade** — race across, wall them off
- **Order & Chaos** — order builds, chaos blocks
- **Hex** — connect your two edges
- **Battleship** — sink the hidden fleet
- **Mancala** — sow & capture
- **Checkers** — jumps forced, kings crown

### Reflex & skill (15)
- **Reaction Time** — fastest reflexes win *(2–8 players)*
- **Aim Trainer** — click targets fast *(2–8 players)*
- **Typing Race** — outtype the whole room *(2–8 players)*
- **Mental Math** — solve fastest under pressure *(2–8 players)*
- **Arrows Puzzle** — race to clear the arrows
- **Pong** — first to five points
- **Snake Battle** — outlast the other snake
- **Tron** — don't crash first
- **Sumo Arena** — shove them off the ledge
- **Space Duel** — blast your rival's ship
- **Paint Turf** — claim more turf than they do
- **Pac Mac** — eat more pellets than they do
- **Mine Race** — clear the same minefield faster *(2–8 players)*
- **Air Hockey** — flick the puck, score 7
- **Artillery** — angle, power, bracket

### Memory (5)
- **Simon** — repeat the growing pattern
- **Chimp Test** — recall numbered tiles fast
- **Number Memory** — memorize the growing number
- **Visual Memory** — remember the lit tiles
- **Pairs** — match the hidden pairs

### Word games (8)
- **Hangwoman** — guess the hidden word
- **Two Truths** — spot the lie
- **Word Duel** — race to guess the word
- **Word Co-Op** — solve one word together
- **Word Race** — solve the same word first
- **Word Hunt** — race to find the most words
- **Password** — give clues, guess the word
- **Anagrams** — race to find words

### Dice & bluff (2)
- **Pig** — push your luck, bank often — modes: Pig Big
- **Bluff Battle** — outroll the liar

### Party · 2–8 players (10)
- **Herd Mind** — match the majority answer *(3–8 players)*
- **Trivia Blitz** — fast answers score more *(2–8 players)*
- **Wavelength** — guess the hidden target *(3–8 players)*
- **Fibbage** — bluff a believable answer *(3–8 players)*
- **Spyfair** — find the spy among you *(3–8 players)*
- **Heads Up** — act it out on the call *(3–8 players)*
- **Chameleon** — blend in, or spot who can’t *(3–8 players)*
- **Sketch** — draw & guess the word *(2–8 players)*
- **Code Words** — team clues, hidden agents *(4–8 players)*
- **Just One** — co-op clues, duplicates cancel *(3–8 players)*

### Daily
- **`/daily`** — a date-seeded solo puzzle, same board for everyone, personal best tracked locally

## How it works

1. Pick a game — games with modes (Tic Tac Toe, Connect Four, Gomoku, …) first ask which mode you want
2. Share the room link (or the 6-character code); invited friends see the game, the host and the seats left, type a name once, and join in one tap
3. Moves sync in real time via Firebase; a move shows as pending until the server acknowledges it, and taps while offline are refused instead of landing later
4. **PLAY AGAIN / NEW MATCH / SWITCH GAME** are propose-and-accept in two-player rooms (they apply instantly if the opponent is offline); party rooms follow the host. Switching keeps players, presence and the room code
5. Extra visitors spectate (and can react); latecomers to a party room are seated automatically at the next lobby, and a spectator gets a seat offer when a two-player seat frees up

Standard games play first-to-3-rounds; Pong has a configurable match length; the arena games (Tron / Sumo / Space Duel) are single-round.

### Game-night mode

A room remembers the whole evening:

- **Night scoreboard** — standings survive game switches and NEW MATCH (3/2/1/0 points per placement, 1 each for a draw), with SHARE RECAP (MVP, most wins, closest game) and START A NEW NIGHT.
- **Party room → two-player game** — tonight's top two sit down, everyone else queues, and the loser swaps out for the next in line after each match (winner stays).
- **Host controls** — kick, lock the room, transfer host; the host role passes to the next online player if the host drops.
- **Timer scale** — NORMAL / RELAXED ×2 / OFF for every timed party game; with timers off the host advances manually.
- **Fresh content** — Trivia, Fibbage, Spyfair, Wavelength and Sketch avoid repeating content within a room across matches.

## Choose who goes first (planned)

Add a shared pre-game choice wherever a game has a starting turn or role. This is a documentation-only plan; gameplay is not yet changed.

- **Lobby UX:** show a “WHO GOES FIRST?” row above START with the game's current default selected. Offer RANDOM and eligible players by name/avatar. Use role-specific labels where clearer, such as “FIRST ARTIST” for Sketch or “FIRST WORD SETTER” for Hangwoman.
- **Shared choice:** the room creator or party host selects; everyone sees the selection and a short explanation before play. Two-player games require the opponent's acceptance when changing the default. Party games use the host's visible selection.
- **Starting play:** games that currently start immediately when an opponent joins need a ready step for this choice. Resolve RANDOM once when starting and announce the selected player to everyone. Disable repeated start actions while saving.
- **Game-specific behavior:** keep player identity, seats, teams, and transport host unchanged. Apply the choice to the starting turn or initial role using each game's rules. For rotating-role games, rotate the existing order to start with the selected player, preserving everyone's turns. Games whose rules bind the opening move to a side need an explicit side-selection design before supporting this option.
- **Simultaneous and solo games:** do not show a first-player selector for races, simultaneous reflex games, or solo play. Keep their existing shared or solo start behavior.
- **Rematches and recovery:** preserve each game's normal between-round rotation. Offer the choice again before a new match; switching games uses the new game's default. If the selected player leaves before start, explain the change and require a valid selection before continuing.
- **Validation:** verify both player perspectives, party rotation, random selection, declined changes, disconnects before start, rematches, and game switching. A changed starter must not change scoring, give extra turns, or reassign networking responsibilities.

## Playing on a video call

An optional **PLAYING ON A VIDEO CALL** layout setting adds a portrait 9:16 space beside reactions for a floating WhatsApp or other video-call window. On mobile, the video space stays fixed to the bottom-left or bottom-right while reactions remain below the game. It is available in multiplayer rooms, solo demos, and local pass-and-play games.

- **Entry and setup:** open the video-call layout control before or during play. Toggle the mode, choose one of four corners, and select a Small, Medium, or Large reserved space.
- **Layout behavior:** the game shell keeps the game board and controls unchanged. Desktop reaction rows share space with the call preview; mobile reactions stay in normal flow while the call preview becomes fixed above the bottom navigation. Tight viewports show a warning to choose another corner or a smaller window.
- **Manual control:** move the external video window to match the selected corner. The game cannot move that window or automatically detect WhatsApp, its popup position, or its size. Page visibility and focus events do not reliably indicate an overlapping video window ([browser visibility limits](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)).
- **Personal preference:** the setting stays on the player's device in `localStorage`. Changing it affects only that device and never changes the opponent's layout, game rules, timer, or networking.
- **Validation:** test with a real floating call window in portrait and landscape, including the on-screen keyboard. Disabling the mode restores the normal layout.

## Public online lobby

**PLAY ONLINE** (`/online`) lists public rooms waiting for an opponent, grouped by game, with the host's name and avatar and one-tap JOIN. It covers the two-player games plus the N-player races (a public race room is a 1v1 until more join); other party games stay invite-only. `matchmaking/{gameId}` is only an index — JOIN revalidates the room (public, waiting, host online, seat open) and returns the player to the lobby with an explanation if it is no longer eligible. Listings register disconnect cleanup, expire, are removed on join or cancel, and are republished when the host reconnects to a room that is still eligible. **PLAY WITH FRIENDS** (share link and friend invites) is unchanged.

## Identity & social

Every visitor is signed in **anonymously** with Firebase Auth on boot — a real uid with zero login UI, keeping the "no account needed" promise. Optionally **upgrade to Google** (one tap) to make your profile permanent and cross-device; the uid is preserved so your avatar, friends and stats carry over.

- **Profiles** — display name + one of 19 pixel-art avatars (`/profile`); names are moderated
- **Friend codes** — a unique 6-character code (unambiguous alphabet); add friends by code, accept/decline requests (`/friends`)
- **Game invites** — invite one friend or every online friend into your room; invites expire after a day
- **Presence** — online/offline for friends and opponents, tracked per connection so a second tab never marks you offline
- **Chat safety** — chat masks denied words, and every message has MUTE (local) and REPORT (goes to the feedback inbox)
- **Leaderboard** — server-verified: a Cloud Function credits finished matches and re-checks board-game winners (see `functions/README.md`)
- **Local stats** — lifetime W/L, streaks, per-game and head-to-head records in `localStorage`

## Architecture

Firebase Realtime Database holds every room at `games/{gameId}`; security rules are the trust boundary, and two Cloud Functions (room cleanup, verified results) run server-side.

- **Turn-based games** are registry entries (`src/lib/games.js` → `GAME_TYPES`): board size, move validation, win detection, a lazily loaded board component. Non-standard turn shapes use the `applyMove`/`boardProps` hooks; variants declare `variantOf` to appear in the mode chooser. Custom games declare a lazy `Page` that `Game.jsx` renders from the registry.
- **Room shell** — `src/pages/Game.jsx` plus hooks in `src/hooks/room/` (session and seat claims, per-connection presence, proposal handshake, abandon recovery, back guard, floats, Pig's seed protocol). The match-end rule lives in `src/lib/matchRules.js`, shared with the results function.
- **Code-split** — every route except Home, every game page and board, the Wordle dictionary, framer-motion and qrcode load on demand; `lazyWithRetry` reloads once when an old tab asks for a chunk a newer deploy removed. CI enforces an entry-bundle budget.
- **Hidden information** never sits in the room in plaintext. Two primitives: salted SHA-256 commit–reveal (`src/lib/commit.js`: Hangwoman, Two Truths, Bluff Battle, Wavelength, Herd Mind, Code Words) and per-player sealing (`src/lib/sealed.js`, Web Crypto ECDH + AES-GCM: Spyfair, Chameleon, Heads Up, Code Words, Just One), where each player publishes a public key and the dealer encrypts one entry per recipient.
- **Party games** use an N-player room model: `players` keyed by uid, an online-aware coordinator (`src/lib/coordinator.js`) that hands host duties to the next online player, per-player scores, and phase machines whose steps are transactions. The five races (`race: true`) share `raceLogic.js` and `RaceShell`.
- **Real-time games** (Pong, Snake, Tron, Sumo, Space Duel, Air Hockey, Paint, Pac Mac) run peer-to-peer: Firebase is only the WebRTC signaling channel. Each connection attempt has an id, so RETRY works from either side and after reloads; a heartbeat pauses play while a peer is away and offers WAIT / CLAIM WIN when they're gone; the host can equalize its own input delay to half the RTT. Public STUN by default; set `VITE_TURN_URLS` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` to add TURN, and public rooms then relay so strangers never see each other's IP.
- **Telemetry (in-house)** — errors go to `errors/{day}` (deduped, capped), started/finished/abandoned counts to `playsDaily/{day}`; admins see both at `/notes`.

## Features

- **Sixteen switchable themes** — all colors flow through CSS variables; a theme is one CSS block + one registry entry
- **Settings panel** — theme, arcade font, CRT overlay, reduced motion (also applied to framer-motion and JS animations), text size, win celebrations
- **8-bit audio + haptics** — Web Audio API sound engine (no audio files), mobile vibration, shared mute toggle
- **Shareable cards** — themed result cards and an end-of-night recap via the native share sheet; invite links unfurl as a large preview card
- **Emote reactions and stickers** — float over the room for players and spectators
- **Rules overlays** — every game has a HOW TO PLAY modal (`src/lib/rules.js`)
- **Accessibility** — every board names its cells by position and contents for screen readers, a live region announces turns and results, Reversi discs carry a letter, Mine Race is fully keyboard-playable
- **Resilience** — seat reclaim by uid, pending-move confirmation, a banner when the server is unreachable, LEAVE lets the opponent claim at once, dropped players never stall party rounds
- **PWA** — installable, offline home screen, UPDATE READY banner instead of mid-game auto-reload
- **Solo practice** — `/demo` runs local vs-AI versions with difficulty levels, no Firebase needed

## Security

`database.rules.json` is the trust boundary (see its tests in `tests/rules/`):

- All reads/writes require **auth** (anonymous counts — no login friction).
- Only room members write a room. Non-members may create a room as its host, claim a free seat for themselves (not in a locked room or after a kick), write their own spectator presence, and chat or react as themselves.
- Seats can only be claimed by their own uid or handed to someone already in the room (game-night reseating); unchanged children always validate, so members' whole-room transactions keep working.
- Public profiles (`profiles/{uid}`: name, avatar) are readable by signed-in users; friend codes, stats and admin flags in `users/{uid}` are owner-only; presence is visible to friends only.
- Friend lists, requests and invites are owner-only; **invites can only be sent by actual friends**; friend codes are claimed once.
- Counters are increment-only, error reports create-only with size caps, feedback has a 30 s cooldown, and the leaderboard is written only by the results function.
- **App Check** is wired: set `VITE_APPCHECK_SITE_KEY` (reCAPTCHA Enterprise; steps in `src/lib/firebase.js`) and enforce it in the Firebase console once its metrics look clean.
- Deploy rules, functions and hosting together.

**Known trust limits** (serverless, world-readable rooms; details in the rules tests): members can still write any board state (only winner, scores and seats are guarded, and the results function re-checks board games), members of a party room can remove other party seats, and any member can prune chat. Also: the client that deals a sealed game (Heads Up, Chameleon, Spyfair, Code Words, Just One) knows the whole deal; a determined devtools user can look up Fibbage answers in the bundled deck or read memory-game answer arrays; custom and real-time game results are trusted by the results function, and wins can be farmed against a second anonymous account. Fine between friends.

## Tech stack

| | |
|---|---|
| Frontend | React 19 + Vite 8 (code-split, PWA via vite-plugin-pwa/Workbox) |
| Styling | Tailwind CSS v3 + shadcn utilities |
| Routing | React Router v7 |
| Data / auth | Firebase Realtime Database + Firebase Auth (anonymous → Google link), App Check |
| Server | Cloud Functions for Firebase (Node 22): room cleanup, verified results |
| Real-time games | Native WebRTC (`RTCPeerConnection`), RTDB signaling, optional TURN |
| Tests | Vitest (pure logic), rules tests and Playwright end-to-end tests on the Firebase emulators, node:test for functions |
| Types | `tsc` over `src/lib` (`npm run typecheck`, opt-in `// @ts-check`) |
| Toasts | Sonner |
| Hosting | Firebase Hosting, deployed from GitHub Actions |

## Local development

```bash
npm install

# Option A — local emulators (no Firebase project needed, disposable data)
npm run emulators          # Auth + Realtime Database emulators (needs Java 21)
npm run dev:emu            # app against the emulators → http://localhost:5173

# Option B — your own Firebase project
cp .env.local.example .env.local   # fill in your project's web config
npm run dev
```

`npm run dev:emu` uses `.env.emulator` (a `demo-` project id), so it can never touch a live database.

### Firebase setup (one-time, for a real project)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Realtime Database** (Build → Realtime Database → Create database)
3. Enable **Authentication** and turn on the **Anonymous** and **Google** sign-in providers
4. Register a web app (Project Settings → Your apps → `</>`) and copy the config into `.env.local`
5. Deploy the security rules: `firebase deploy --only database`
6. (Recommended) set up **App Check** with reCAPTCHA Enterprise and put the site key in `VITE_APPCHECK_SITE_KEY`

Manual multiplayer testing: same-browser tabs share the auth uid, so use a private window or another browser for the second player — or run the end-to-end tests, which give each player its own browser context.

## Commands

```bash
npm run dev        # dev server with HMR
npm run dev:emu    # dev server against the local emulators
npm run build      # production build → dist/
npm run preview    # serve dist/ locally
npm run lint       # ESLint
npm run typecheck  # tsc over src/lib
npm test           # Vitest — pure logic, decks, helpers
npm run test:rules # security rules tests on the Database emulator
npm run test:e2e   # Playwright end-to-end tests on the emulators (npm run test:e2e -- tests/e2e/<spec>.js)
npm --prefix functions test   # Cloud Functions tests
npm run deploy     # guarded manual deploy (see Deploy)
```

## Deploy

GitHub Actions (`.github/workflows/`) run lint, typecheck, unit tests, build, the entry-bundle budget, a dependency audit, the functions tests, and the rules + end-to-end suites on every pull request. `deploy.yml` publishes a preview channel per pull request and the live site on every push to `main` — once these repository secrets exist:

- `FIREBASE_SERVICE_ACCOUNT_GAME_NIGHT_91464` (`firebase init hosting:github` creates it)
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` (plus optional `VITE_APPCHECK_SITE_KEY` and `VITE_TURN_*`)

Preview-channel domains must be added to Firebase Auth's authorized domains for Google sign-in to work there. Rules and functions are deployed by hand:

```bash
npm run deploy -- --only hosting,database   # guarded manual deploy: refuses a dirty tree or a build without the Firebase config
firebase deploy --only functions            # room cleanup + verified results (Blaze plan; builds the bundle first)
```

Hosting sends immutable caching for hashed assets, `no-cache` for `index.html`/`sw.js`, security headers and a report-only CSP (`firebase.json`); missing files return 404.

## Adding a new game

The room/invite/presence layer is game-agnostic. A standard board game is:

1. A logic file in `src/lib/` exporting `getWinner(board)` + move helpers, with a `.test.js`
2. A board component in `src/components/`, registered as a lazy `BoardComponent` (`lazyWithRetry`)
3. An icon in `src/components/GameIcons.jsx` and HOW TO PLAY text in `src/lib/rules.js`
4. One `GAME_TYPES` entry in `src/lib/games.js` — this drives the catalogue, the switcher, `freshGameState()` and the room shell

Non-standard turn shapes supply `applyMove()` and `boardProps()`. Variants add `variantOf`. Bespoke flows (`custom: true`) add a lazy `Page`; party games add `nPlayer: true, minPlayers, maxPlayers`; races add `race: true` and build on `RaceShell`. New room keys go in `FIELD_NULLS` (unless they must survive switches) and in `database.rules.json` with a rules test. Full walkthrough: the `add-a-game` skill.

## Project structure

```
src/
  lib/
    games.js                 # THE registry (GAME_TYPES) + freshGameState() + FIELD_NULLS
    *Logic.js (+ .test.js)   # pure per-game logic — no DOM, no network
    matchRules.js            # match-end rule shared with the results function
    commit.js / sealed.js    # commit–reveal and per-player sealing primitives
    coordinator.js / teams.js / raceLogic.js / nightLogic.js
    auth.js / AuthContext.jsx / social.js / profile.js
    telemetry.js / analytics.js / feedback.js / moderationLogic.js
    realtime/                # WebRTC transport, connection/attempt logic, host/guest hooks
    decks/                   # party-game content decks (tested for size and shape)
  components/                # boards, RaceShell, Night*, HostControls, InviteJoinScreen, …
  pages/                     # Home, Game (all rooms), Demo (+ demos/), Daily, Profile, Friends, Notes,
                             # + one page per custom game
  hooks/                     # room/ (room shell hooks), useServerClock, useCommitReveal, useSealKey, controls
functions/                   # Cloud Functions: room cleanup, verified results (see functions/README.md)
tests/rules/ · tests/e2e/    # rules tests and Playwright end-to-end tests (emulators)
database.rules.json          # the security boundary — deploy after every change
```

## Improvement backlog

Status as of 2026-09-26, after the overall-improvements pass (security rules v1, code-splitting, game-night mode, N-player races, four new party games, sealed secrets, verified leaderboard, CI, emulator tests). Arrows Puzzle review: [docs/README-ARROWS-REVIEW.md](docs/README-ARROWS-REVIEW.md).

### Closed by that pass

- Notes/feedback is linked from Settings, has an admin view (notes, reports, errors, play counts) and tests.
- Herd Mind answers are commit-reveal; Spyfair roles are sealed.
- Lint is at zero errors and gated in CI with typecheck, tests, build, a bundle budget and an audit.
- The single 2 MB bundle is code-split (entry ~262 KB gzip; LCP 5.3 s → 4.2 s on a local mobile Lighthouse run).
- Real-time host advantage: opt-in host input delay (Sumo, Space Duel, Air Hockey, Paint); TURN is configurable.
- End-to-end and rules tests run on the Firebase emulators; `Game.jsx` is split into room hooks.

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

### Still open

1. **Word Hunt dictionary is unfiltered** (G-01) — `public/wordhunt-dict.txt` still contains slurs. A filter script, filtered list and runtime check are prepared for the word-games work, together with a Wordle answer-list cleanup and 120 Anagrams racks.
2. **Word, memory, Pong and Pac-Man follow-ups** — solo demos for Word Race / Password / Anagrams (the catalogue offers PRACTICE VS AI but no demo exists), screen-reader labels and the motion setting for the memory boards, server-clock deadlines in Simon / Visual Memory / Chimp, and the Pong / Pac-Man reconnect overlay, input expiry and host prediction (a ready diff exists).
3. **Fonts** — ship the arcade fonts as WOFF2 (−70% bytes) and precache them for offline play.
4. **Mixed-game leaderboard** — wins in Pong and Tic Tac Toe still rank equally; split by game or category now that results are server-side.
5. **Sign-in iframe on mobile** — the Firebase SDK loads Google's gapi and auth iframe at boot on mobile browsers; a lazy popup resolver would remove it but relies on an internal SDK flag.
6. **TURN provider** — pick one and set the `VITE_TURN_*` secrets.

## Roadmap

- **Skill leaderboards** — per-game boards for reaction ms, WPM, chimp level and daily results, credited by the results function
- **Catalogue pruning** — use the started/finished/abandoned counts in `/notes` to decide which games to merge or retire
- **More team and co-op games** on the `teams.js` and sealing primitives
- **Realtime polish** — live spectator state for the arena games, power-ups
- **Pass-and-play** — long-tail candidate
