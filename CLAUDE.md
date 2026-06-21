# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server at http://localhost:5173
npm run build     # production build (outputs to dist/)
npm run preview   # serve the production build locally
npm run lint      # ESLint
npm test          # Vitest — suites for src/lib/hangmanLogic.js, src/lib/commit.js, src/lib/gameLogic.js, src/lib/connectFourLogic.js, src/lib/dotsAndBoxesLogic.js, src/lib/sosLogic.js
```

Unit tests cover only the pure game/commit logic. Multiplayer flows are verified manually. **Note:** same-browser tabs now share `playerId` (stored in localStorage), so manual two-player testing requires the second player in a private/incognito window (or another browser). Opening two regular tabs simulates one player in two windows, not two distinct players.

## Environment

Copy `.env.local.example` to `.env.local` and fill in Firebase config values (`VITE_FIREBASE_*`). The app will not connect to any database without this file.

## Architecture

This is a React + Vite PWA. All multiplayer state lives in **Firebase Realtime Database** — there is no backend server.

### Data model

Each game is a node at `games/{gameId}` in Firebase:

```
gameType:    "tictactoe" | "connectfour" | "hangwoman" | "dotsandboxes" | "sos"
status:      "waiting" | "playing" | "finished"
board:       string[9] (TTT) | string[42] (Connect Four) | string[40] (Dots & Boxes edges) — '' for empty, 'X'/'O' for occupied; absent for hangwoman
boxes:       string[16] (Dots & Boxes only) — box ownership, '' / 'X' / 'O'; null/absent for other game types
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

Hangwoman has no `board`/`currentTurn`; it stores a `round` sub-node instead (`setter`, `phase`, `wrongCount`, `wordLength`, `commitment`, `guesses`, `reveal`, `result` — see `src/pages/HangmanGame.jsx`). The word never touches Firebase until reveal: the setter keeps it in sessionStorage and publishes a salted SHA-256 commitment (`src/lib/commit.js`); the guesser's client verifies the reveal against the commitment and all recorded answers.

**Dots and Boxes** uses `board: string[40]` for edges (horizontal edges 0–19: `row*4+col`; vertical edges 20–39: `20+row*5+col`) and `boxes: string[16]` for box ownership. `currentTurn` does **not** flip when a move completes ≥1 box (extra turn). The round ends when one player owns 9 boxes (early clinch) or all 16 are claimed (8–8 = draw). There is no `winningLine`.

**SOS** uses `board: string[49]` — each cell holds `''` | `'S'` | `'O'` (board letters, not player symbols), row-major in a 7×7 grid. `sosLines: [{ cells: [a,b,c], by: 'X'|'O' }]` is an append-only record of completed S-O-S sequences (absent/null when none yet — Firebase deletes empty arrays; always normalize on read with `normalizeSosLines()`). Round scores are derived: X's count = lines where `by === 'X'`. When a move completes ≥1 SOS, `currentTurn` stays on the mover (extra turn); otherwise it flips. The round ends when all 49 cells are filled: most SOS sequences wins; equal → draw. There is no `winningLine`.

**`gameType` is mutable.** Any player can switch the room to a different game from an end-of-game screen (`handleSwitchGame` in `Game.jsx`). `freshGameState()` in `src/lib/games.js` is the single source of per-game initial state — used by game creation (`Home.jsx`) and switching; it relies on `null`s to delete the other game's keys. Clients follow automatically: `Game.jsx` remounts the whole game tree via `key={game.gameType}`. Per-game config (board size, move logic, win function, board component, layout width) lives in the `GAME_TYPES` registry in `src/lib/games.js` and is looked up via `getGameConfig(type)` — `Game.jsx` contains no per-game branches.

**Firebase and null values:** Firebase deletes keys set to `null`. Empty board cells are stored as `''` (not `null`) so the array length stays stable. `winner` and `winningLine` are absent when not applicable — always read them as `game.winner ?? null`. `normalizeBoard()` in `src/lib/gameLogic.js` converts whatever Firebase returns (array or numeric-keyed object) to a guaranteed 9-element string array.

### Player identity

Identity is the **Firebase Auth uid**. Every visitor is signed in **anonymously** on boot (a real uid, no login UI); they can optionally **upgrade** to a permanent Google account via `linkWithPopup`, which keeps the same uid so profile/avatar/friends carry over and become cross-device. The auth layer lives in `src/lib/auth.js` (`authReady`, `getUid`, `upgradeWithGoogle`, `signOutToGuest`) and `src/lib/AuthContext.jsx` (`useAuth()` → `{ uid, user, profile, isAnonymous, upgrade, signOutToGuest }`). `App` is gated behind `authReady()` (a "CONNECTING…" splash) so a uid is always available before any page renders.

- `getPlayerId()` (`src/lib/playerId.js`) returns the auth uid (falling back to a legacy localStorage UUID only if Auth is unavailable). All seat-claim/reclaim logic keys off it unchanged.
- `playerName` / `playerAvatar` — display name + avatar key, mirrored to `localStorage` from the profile for synchronous reads in `Home`/`Game`; the source of truth is `users/{uid}`.
- `game-{gameId}` — `{ symbol: "X"|"O"|null }` for the current game slot (sessionStorage)
- `hangwoman-word-{gameId}` — `{ word, salt }`, the setter's secret; tab-local, so a setter who reloads in a new tab loses the word and must concede the round

The creator is always X; the first person to join an open O slot becomes O; everyone else is a spectator (`symbol: null`). Slot claiming uses a Firebase `runTransaction` to prevent races. Player slots now also store `avatar`. Closing a tab no longer kills the game — reopening the invite link reclaims your seat via the uid.

### Profiles, friends & invites (social layer)

A persistent social layer keyed by uid lives in `src/lib/social.js` (data) with pages `src/pages/Profile.jsx` and `src/pages/Friends.jsx`, the `src/components/Avatar.jsx` (themed pixel-art sprites; keys in `src/lib/avatars.js`) and `src/components/InviteFriendModal.jsx`. New Firebase nodes (rules in `database.rules.json`):

```
users/{uid}:        { displayName, nameLower, avatar, code, isAnonymous, online, lastSeen, createdAt, updatedAt }
codes/{CODE}:       uid                        // friend-code → uid index; claimed once via runTransaction
friends/{uid}/{friendUid}:        { since }    // accepted friendship, written both directions on accept
friendRequests/{uid}/{fromUid}:   { name, avatar, code, at }   // incoming pending requests
invites/{uid}/{inviteId}:         { gameId, gameType, fromUid, fromName, fromAvatar, at }  // game invites
```

`ensureProfile()` (run from `AuthContext` on boot) creates `users/{uid}` if missing and allocates a unique 6-char friend code (unambiguous alphabet, no 0/O/1/I/L). Friends are added by code (`sendFriendRequestByCode` → `acceptRequest`); presence is published to `users/{uid}/online` via the same `onDisconnect` pattern as game presence. Pure helpers (friend-code gen/validation, avatar keys) are unit-tested in `src/lib/social.test.js` and `src/lib/avatars.test.js`.

**Setup prerequisites:** enable **Anonymous** + **Google** sign-in providers in the Firebase console, and deploy rules (`firebase deploy --only database`). Until then the app degrades gracefully to local-guest mode. A global/per-game **leaderboard** is a planned follow-up that builds on `users/{uid}` stats.

### Real-time games (Pong)

**Pong** (`gameType: 'pong'`, `category: 'reflex'`, `custom: true`) is the first and only real-time game and breaks the turn-based assumption: physics changes ~60×/second, so the gameplay stream does **not** go through RTDB. Firebase keeps the room (lobby, invites, presence, score, game-over) and additionally acts as the **WebRTC signaling channel**; once the peer connection is up, gameplay frames travel peer-to-peer and never touch Firebase, preserving the "no backend server" property.

- **Pure sim:** `src/lib/pongLogic.js` — `createState()`, `step(state, inputs, dt)` (fixed timestep, returns `{state, events}`), `computeAI()`, `getWinner()`. No DOM, no network; unit-tested in `src/lib/pongLogic.test.js`. The court is a normalized 1×1 box (x left→right, y top→down); X's paddle is left, O's right.
- **Transport:** `src/lib/realtime/rtc.js` — native `RTCPeerConnection` + an unreliable/unordered `RTCDataChannel`, signaled through `games/$id/signaling` (`offer`/`answer`/`ice/{X|O}`). X is the **host** (offerer), O the **guest** (answerer); the host removes the signaling node on close. Public STUN only — no TURN, so ~5–10% of peers behind symmetric NATs fail to connect and surface as a "CONNECTION FAILED" state with a RETRY button.
- **Sync model (host-authoritative):** the host (X) runs the one true sim in a `requestAnimationFrame` loop, applies its own input + the guest's input (received over the channel), and streams ~30 Hz snapshots `{ball, paddles, score}`. The guest (O) renders its own paddle with local prediction (zero input lag) and dead-reckons the ball/host-paddle from the latest snapshot's velocity. The host writes `pongScoreX`/`pongScoreO` to Firebase per point (human-speed) so spectators see the score, and calls `runTransaction` to set `winner` + increment `scores` when a side reaches `WIN_SCORE` — reusing the standard finish/win-effect/`recordMatch` machinery.
- **Firebase keys:** `pongScoreX`, `pongScoreO` (per-round points; reset by `freshGameState('pong')`), `signaling` (transient). **No `currentTurn`** (omitted/null) so `Game.jsx`'s turn-flip move-sound detection stays silent — Pong drives its own audio. All keys are in `FIELD_NULLS` so switching games clears them.
- **Rendering:** `src/components/PongCourt.jsx` is DOM/CSS (themed via the same `--c-*` vars as every board — **not** canvas), driven by `src/hooks/usePongControls.js` (↑/↓, W/S, pointer drag). The page is `src/pages/PongGame.jsx`, dispatched from `Game.jsx`'s custom ladder like the other reflex pages.
- **Local play:** `/demo` runs `PongDemo` (human vs a reaction-handicapped AI) directly off `pongLogic` with no networking — the way to iterate on physics/feel. Live two-player P2P requires real two-device/two-network testing (a second browser profile on the same NAT may not exercise NAT traversal).

### Theming

All colors flow through CSS custom properties (`--c-*`, space-separated RGB channel triplets) defined in `src/index.css`. `:root` holds the default "midnight" theme; `[data-theme="…"]` blocks override per theme (phosphor, amber, synthwave, grid, mono).

Tailwind tokens are semantic roles, not hues: `retro-p1` (X accent), `retro-p2` (O accent), `retro-cta` (primary action), `retro-win` (success), plus `retro-tint-p1`/`tint-p2`/`tint-cta` (dark accent-tinted backgrounds), `retro-structure`, `retro-deep`, and the existing `bg`/`surface`/`card`/`border`/`text`/`dim`. Shadows: `shadow-neon-p1/p2/cta/win`, `shadow-glow-dot`. Text glows: `text-glow-p1/p2/cta/win`.

Theme registry + switching live in `src/lib/theme.js` (`THEMES`, `applyTheme`, `getStoredTheme`; localStorage key `retro-theme`). The `ThemeSwitcher` component sits next to every mute button (Home, Game header, Demo). An inline boot script in `index.html` sets `data-theme` before paint to avoid a theme flash; `applyTheme` also updates `<meta name="theme-color">` to the active cta color.

To add a theme: one `[data-theme="id"]` block in `src/index.css` + one `THEMES` entry. Never hardcode hex colors in `src/` — SVG presentation attributes can't hold `var()`, so use `style` props (`style={{ fill: 'rgb(var(--c-…))' }}`) or Tailwind `fill-*`/`stroke-*` classes instead.

Mouse cursors are static white pixel-art SVG data URIs (cursors can't read CSS vars, so they don't theme); the four cursor vars (`--cursor-arrow/hand/text/no`) live in `:root` in `src/index.css`, which also re-routes the Tailwind `cursor-*` utilities through them.

**Note:** `npm run dev` must be restarted after `tailwind.config.js` changes — the ESM config is cached for the process lifetime.

### Adding a new game

The room/invite/Firebase/presence layer is game-agnostic. `src/lib/games.js` is the single registry — `Game.jsx` reads config from it and needs no per-game changes. To add a new board game:
1. Add a logic file in `src/lib/` exporting `getWinner(board)` and any move helpers (e.g. `getMoveIndex`)
2. Add a board component in `src/components/`
3. Add an icon component to `src/components/GameIcons.jsx`
4. Add a single entry to `GAME_TYPES` in `src/lib/games.js` with `boardSize`, `getMoveIndex`, `getWinner`, `BoardComponent`, `badge`, `maxWidth`, `desc`, and `Icon`; `freshGameState()` derives the initial state automatically from the registry entry. The home-screen grid and the end-of-game "SWITCH GAME" picker both render from the registry via `GamePicker` — no per-game UI changes needed.

**For games that don't fit the standard place-symbol → flip-turn → check-winner shape** (e.g. extra turn on box completion, multiple state arrays), supply two optional registry hooks instead of `getWinner`:
- `applyMove({ board, game, index, move, symbol })` → returns `{ updates, result }` where `updates` is the full Firebase patch (board, boxes, currentTurn etc.) and `result` is `null | { winner }`. When this hook is present, `Game.jsx` delegates the entire move to it rather than the standard path. `move` is the raw payload passed by the board component's `onMove` (e.g. SOS passes `{ index, letter }`); `index` is the cell index derived by `getMoveIndex`.
- `boardProps(game)` → extra props spread onto `<BoardComponent>` (e.g. `{ boxes }` for dots and boxes, `{ sosLines }` for SOS). Omit for games that only need `board`.

Sounds, presence, score tracking, game switching, and the win effect work automatically for any game type.
