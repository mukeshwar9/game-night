# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # dev server at http://localhost:5173 (uses .env.local — a real project)
npm run dev:emu    # dev server against the local emulators (.env.emulator, demo- project)
npm run emulators  # Auth + Realtime Database emulators (Java 21)
npm run build      # production build (dist/)
npm run lint       # ESLint
npm run typecheck  # tsc over src/lib (files opt in with // @ts-check)
npm test           # Vitest — pure logic in src/**/*.test.js
npm run test:rules # database.rules.json tests on the Database emulator
npm run test:e2e   # Playwright on the emulators; `npm run test:e2e -- tests/e2e/<spec>.js`
npm --prefix functions test   # Cloud Functions tests
```

Coverage: pure logic (Vitest), security rules (`tests/rules/`) and real multiplayer flows (`tests/e2e/`, one browser context per player — same-browser tabs share the auth uid, so manual two-player testing needs a private window). Rules changes must come with a rules test; flows that touch several clients should get an e2e spec. Emulator ports 9000/9099/5190 are shared — if they are taken, run with a private copy of `firebase.json` on other ports.

## Environment

Copy `.env.local.example` to `.env.local` and fill in Firebase config values (`VITE_FIREBASE_*`) for a real project, or use `npm run dev:emu` with the committed `.env.emulator`. Optional: `VITE_APPCHECK_SITE_KEY` (App Check), `VITE_TURN_URLS` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` (TURN for WebRTC).

## Architecture

This is a React + Vite PWA. All multiplayer state lives in **Firebase Realtime Database**; `database.rules.json` is the trust boundary. Two Cloud Functions in `functions/` (Node 22) run server-side: daily room cleanup and `creditMatchResults`, which writes the leaderboard after re-checking board-game winners (`functions/README.md`).

### Layout

- `src/lib/*Logic.js` — pure game/commit logic, no DOM/Firebase/React, `.test.js` beside each. See `.claude/rules/game-logic-rules.md`.
- `src/components/` — board/arena components (rendering only, no rules).
- `src/pages/` — whole games (one page per game, wires board + logic + Firebase together), plus each game's `/demo` bot-play page.
- `src/lib/games.js` — the `GAME_TYPES` registry; the single source of per-game config. Custom pages (`Page`) and boards (`BoardComponent`) are lazy (`lazyWithRetry`). See `.claude/rules/adding-a-game-rules.md`.
- `src/pages/Game.jsx` + `src/hooks/room/` — the room shell: session/seat claims, per-connection presence, proposals, abandon recovery, floats. `src/lib/matchRules.js` is the match-end rule, shared with `functions/`.
- Shared primitives: `commit.js` (commit–reveal), `sealed.js` + `useSealKey` (per-player encryption), `coordinator.js` (online-aware host), `timerScale.js`, `seenHistory.js`, `normalize.js`, `useServerClock`, `RoundEndPanel`, `teams.js`, `raceLogic.js` + `RaceShell`.

### Data model

Each game is a node at `games/{gameId}` in Firebase:

```
gameType:    any GAME_TYPES type (src/lib/games.js)
status:      "waiting" | "playing" | "finished"
board:       string[9] (TTT) | string[42] (Connect Four) | string[84] (Dots & Boxes edges) — '' for empty, 'X'/'O' for occupied; absent for hangwoman
boxes:       string[36] (Dots & Boxes only) — box ownership, '' / 'X' / 'O'; null/absent for other game types
currentTurn: "X" | "O"                                     (absent for hangwoman)
winner:      "X" | "O" | "draw"  (absent until game ends)
winningLine: number[3]            (absent until game ends; absent for dotsandboxes — no line concept)
createdAt:   timestamp
players:
  X: { name, joinedAt, playerId }
  O: { name, joinedAt, playerId }   (absent until second player joins)
scores:
  X: number
  O: number
presence:
  X: { online: boolean }
  O: { online: boolean }
proposal: { action: 'playAgain'|'newMatch'|'switch', gameType, by, declined } — rematch/switch consent handshake; absent when none pending; cleared (null) by every apply/reset write
```

Party games key `players` by uid instead of X/O. Presence is per connection (`presence/{seat}/conns/{pushId}`, `players/{uid}/conns`); a seat is online if any connection exists (`presenceLogic.js`). Spectators write `spectators/{uid}`. Room-level keys that must **survive switches and NEW MATCH** stay out of `FIELD_NULLS`: `night`, `queue`, `partyRoom`, `hostUid`, `locked`, `timerScale`, `seen/{deck}`, `sealKeys/{uid}`. Per-match keys that reset are in `FIELD_NULLS` (e.g. `nightMark`, `kicked`, `raceResult`, `pieSwap`).

Hangwoman has no `board`/`currentTurn`; it stores a `round` sub-node instead (`setter`, `phase`, `wrongCount`, `wordLength`, `commitment`, `guesses`, `reveal`, `result`, `turns`, `wordRule`, `verified` — see `src/pages/HangmanGame.jsx` and `docs/HANGMAN.md`). The room-level `hangwomanAnyWord` house rule is deliberately kept out of `FIELD_NULLS`. The word never touches Firebase until reveal: the setter keeps it in sessionStorage and publishes a salted SHA-256 commitment (`src/lib/commit.js`); the guesser's client verifies the reveal against the commitment and all recorded answers.

**Dots and Boxes** default is `dotsandboxes` (`board: string[84]`, `boxes: string[36]`, clinch 19). Compact mode `dotsandboxes4` is 4×4 (`board: string[40]`, `boxes: string[16]`, clinch 9). Horizontal edges on 6×6: 0–41 `row*6+col`; vertical 42–83 `42+row*7+col`. `currentTurn` does **not** flip when a move completes ≥1 box (extra turn). The round ends on majority or a full-board draw (18–18 / 8–8). There is no `winningLine`.

**SOS** uses `board: string[49]` — each cell holds `''` | `'S'` | `'O'` (board letters, not player symbols), row-major in a 7×7 grid. `sosLines: [{ cells: [a,b,c], by: 'X'|'O' }]` is an append-only record of completed S-O-S sequences (absent/null when none yet — Firebase deletes empty arrays; always normalize on read with `normalizeSosLines()`). Round scores are derived: X's count = lines where `by === 'X'`. When a move completes ≥1 SOS, `currentTurn` stays on the mover (extra turn); otherwise it flips. The round ends when all 49 cells are filled: most SOS sequences wins; equal → draw. There is no `winningLine`.

**`gameType` is mutable.** Any player can switch the room to a different game from an end-of-game screen (propose-and-accept in 2P rooms; party rooms can also switch into 2P games with winner-stays seating, see `nightLogic.js`). `freshGameState()` in `src/lib/games.js` is the single source of per-game initial state — used by game creation (`Home.jsx`) and switching; it relies on `null`s to delete the other game's keys. Clients follow automatically: `Game.jsx` remounts the whole game tree via `key={game.gameType}`. Per-game config (board size, move logic, win function, board component, layout width) lives in the `GAME_TYPES` registry in `src/lib/games.js` and is looked up via `getGameConfig(type)` — `Game.jsx` should contain no per-game branches; the few left (Pong, word games, Arrows) are pending registry hooks.

**Firebase read/write conventions** (null-deletes-keys, `''` vs `null`, normalizing sparse reads, transactional seat claims): see `.claude/rules/firebase-rules.md`.

### Player identity

Identity is the **Firebase Auth uid**. Every visitor is signed in **anonymously** on boot (a real uid, no login UI); they can optionally **upgrade** to a permanent Google account via `linkWithPopup`, which keeps the same uid so profile/avatar/friends carry over and become cross-device. The auth layer lives in `src/lib/auth.js` (`authReady`, `getUid`, `upgradeWithGoogle`, `signOutToGuest`) and `src/lib/AuthContext.jsx` (`useAuth()` → `{ uid, user, profile, isAnonymous, upgrade, signOutToGuest }`). `App` is gated behind `authReady()` (a "CONNECTING…" splash) so a uid is always available before any page renders.

- `getPlayerId()` (`src/lib/playerId.js`) returns the auth uid (falling back to a legacy localStorage UUID only if Auth is unavailable). All seat-claim/reclaim logic keys off it unchanged.
- `playerName` / `playerAvatar` — display name + avatar key, mirrored to `localStorage` from the profile for synchronous reads in `Home`/`Game`; the source of truth is `users/{uid}` (public copy in `profiles/{uid}`).
- `game-{gameId}` — `{ symbol: "X"|"O"|null }` for the current game slot (sessionStorage)
- `hangwoman-word-{gameId}` — `{ word, salt }`, the setter's secret; tab-local, so a setter who reloads in a new tab loses the word and must concede the round

The creator is always X; the first person to join an open O slot becomes O; everyone else is a spectator (`symbol: null`). Slot claiming uses a Firebase `runTransaction` to prevent races. Player slots also store `avatar`. Reopening the invite link reclaims your seat via the uid. Only room members may write a room; see `database.rules.json` for what non-members (joiners, spectators) may write.

### Profiles, friends & invites (social layer)

A persistent social layer keyed by uid lives in `src/lib/social.js` (data) with pages `src/pages/Profile.jsx` and `src/pages/Friends.jsx`, `src/components/Avatar.jsx` (sprites; keys in `src/lib/avatars.js`) and `src/components/InviteFriendModal.jsx`. Nodes (rules in `database.rules.json`, tests in `tests/rules/`):

```
users/{uid}:        { displayName, nameLower, avatar, code, isAnonymous, stats, matches, admin, lastFeedbackAt, … }  // owner-only
profiles/{uid}:     { displayName, nameLower, avatar }        // public to signed-in users; mirrored from users/{uid}
presence/{uid}:     { online, lastSeen }                      // owner + friends
codes/{CODE}:       uid                        // friend-code → uid index; claimed once via runTransaction
friends/{uid}/{friendUid}:        { since }    // written both directions on accept; needs a pending request
friendRequests/{uid}/{fromUid}:   { name, avatar, code, at }
invites/{uid}/{inviteId}:         { gameId, gameType, fromUid, fromName, fromAvatar, at }  // hidden after 24 h
leaderboard/{uid}:  written only by the creditMatchResults function (verified: true, verifiedWins)
```

`ensureProfile()` (run from `AuthContext` on boot) creates `users/{uid}` if missing (a transaction that never overwrites a chosen name), allocates a 6-char friend code, and mirrors `profiles/{uid}` and `presence/{uid}` — so accounts migrate the first time they open a new build. Read other players through `getProfile` / `subscribeProfile` (public profile + presence); only your own uid reads `users/{uid}`. Names go through `sanitizeDisplayName` (`moderationLogic.js`).

**Setup prerequisites:** enable **Anonymous** + **Google** sign-in providers in the Firebase console, and deploy rules, functions and hosting together — the rules deny the old client's leaderboard writes and `profiles/` is filled by the new client.

### Real-time games

Pong, Snake, Tron, Sumo, Space Duel, Air Hockey, Paint and Pac Mac change state ~60×/s, so gameplay does **not** go through RTDB. Firebase keeps the room (lobby, presence, score, game-over) and is the **WebRTC signaling channel**; frames travel peer-to-peer over an unreliable/unordered `RTCDataChannel`.

- **Pure sims:** `src/lib/*Logic.js` (`createState`, fixed-timestep `step(state, inputs, dt)`, `computeAI`, `getWinner`), unit-tested, no DOM/network.
- **Transport:** `src/lib/realtime/rtc.js`. Each connection attempt has an id (`signaling/attempt`, with offer/answer/ICE under `signaling/runs/{id}`); whoever starts an attempt (mount, reload, RETRY from either side) replaces the node and peers rebuild their `RTCPeerConnection` without remounting. A 500 ms ping doubles as a heartbeat: play pauses (`reconnecting`) when the peer is silent for 1.5 s, and WAIT / CLAIM WIN appears when their presence is offline. Pure state in `connectionLogic.js`, RTT/delay in `netLogic.js`, ICE config in `iceConfig.js` (public STUN; TURN from `VITE_TURN_*`; public rooms relay-only when TURN is set).
- **Sync model (host-authoritative):** X hosts the sim and streams ~30 Hz snapshots; O predicts its own input. Pages may opt in to `equalizeHostInput` (host input delayed by RTT/2, capped at 60 ms). The host writes per-point scores to Firebase and finishes the round with a `runTransaction`, reusing the standard finish/win-effect machinery. No `currentTurn`, so turn-flip sounds stay silent.
- **Rendering:** DOM/CSS arenas themed with the `--c-*` vars (not canvas); controls in `src/hooks/use*Controls.js`. `/demo` runs each sim against a local AI with no networking. Live P2P needs real two-device/two-network testing for NAT traversal.

### Theming

All colors flow through CSS custom properties (`--c-*`) defined in `src/index.css`, with a `[data-theme="…"]` block per `THEMES` entry (`:root` holds MIDNIGHT's tokens as the cascade fallback; the app defaults to `matcha`). Registry + switching live in `src/lib/theme.js` (`THEMES`, `applyTheme`, `getStoredTheme`); `ThemeSwitcher` sits next to every mute button. Full conventions (hex-hardcoding ban, Tailwind semantic tokens, adding a theme, cursor exception): `.claude/rules/theming-rules.md`.

### Word games: shared building blocks

Word and party-word pages share these — use them instead of re-implementing:
- `useGameKeys` (`src/hooks/useGameKeys.js`) for physical keys — never a raw `window` keydown listener (the room chat shares the page; see `src/lib/keyGuard.js`).
- `src/lib/wordDenylist.js` for every word list: `isBannedWord` (never accept/serve/show) and `isFamilySafe` (required for anything a game serves or displays on its own).
- `src/lib/textMatchLogic.js` (`matchKey`, `isCloseMatch`) for free-text answers — plurals, spacing, articles and typos.
- `useServerClock` + `RoundTimer`, `WordFeedback`, `MatchScoreRail` (with registry `matchTarget`; set `hidePlayerCards` when the page renders the rail). Registry `coop: true` exempts a game from the CLAIM WIN banner and win/loss stats.
- Firebase `update()` rejects a patch holding both a path and its ancestor (`round` + `round/setter`); fold nested first-mover keys with `withFirstMover()` (`src/lib/games.js`).

### Async-action busy convention

Every button firing an async action follows the `useBusy()` pattern: synchronous busy flag, disabled state, "…ING" label, `toast.error` on failure. Full rule: `.claude/rules/async-busy-rules.md`.

### Adding a new game

The room/invite/Firebase/presence layer is game-agnostic; `src/lib/games.js`'s `GAME_TYPES` registry is the single source of per-game config, and `Game.jsx` needs no per-game changes. Full procedure and the `applyMove`/`boardProps` hooks for non-standard games: `.claude/rules/adding-a-game-rules.md`, or the `add-a-game` skill for a worked end-to-end walkthrough.

## Rules (`.claude/rules/`)

Enforceable conventions live here — always follow them:
- `theming-rules.md` — CSS custom properties, hex-hardcoding ban, Tailwind semantic tokens, adding a theme
- `firebase-rules.md` — null-deletes-keys, `''` vs `null`, normalizing sparse reads, transactional claims
- `async-busy-rules.md` — the busy-flag convention for async actions
- `adding-a-game-rules.md` — the registry procedure, `applyMove`/`boardProps` hooks
- `game-logic-rules.md` — pure logic module placement and test-coverage requirement

## Prior reviews (`docs/reviews/2026-08/`)

Dated source reports behind `docs/REVIEW-2026-08.md`. Before reading any of them, see [`docs/reviews/2026-08/HOW-TO-READ.md`](docs/reviews/2026-08/HOW-TO-READ.md) for reading order — findings are a snapshot, not a live issue tracker.

## Skills (`.claude/skills/`)

- `add-a-game` — full end-to-end procedure for adding a new game, including what you get for free
- `review-a-game` — checklist for reviewing any game in this repo, distilled from past review passes

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
