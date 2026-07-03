# Game PRDs

Product requirement docs for the next wave of games. Each PRD is self-contained and can be
handed to an implementation session on its own, but all of them assume the **shared platform
conventions** below — read this file first.

## Index

| PRD | Game | Category | Players | Integration | Network | Effort | Priority |
|---|---|---|---|---|---|---|---|
| [sketch.md](sketch.md) | Sketch (draw & guess) | party | 3–8 | custom party page | RTDB (strokes) | L | **P1** |
| [battleship.md](battleship.md) | Battleship | board | 2 | custom page | RTDB + commit-reveal | L | **P1** |
| [hex.md](hex.md) | Hex | board | 2 | standard registry | RTDB | S | **P1** |
| [word-hunt.md](word-hunt.md) | Word Hunt (Boggle duel) | word | 2 | custom race page | RTDB (seeded race) | M | P2 |
| [herd-mind.md](herd-mind.md) | Herd Mind (majority game) | party | 3–8 | custom party page | RTDB | S | P2 |
| [mancala.md](mancala.md) | Mancala (Kalah) | board | 2 | registry + `applyMove` | RTDB | S/M | P2 |
| [word-duel.md](word-duel.md) | Word Duel (Wordle-style) | word | 2 | custom page | RTDB + commit-reveal | M | P2 |
| [mine-race.md](mine-race.md) | Mine Race (minesweeper duel) | reflex | 2 | custom race page | RTDB (seeded race) | S/M | P3 |
| [checkers.md](checkers.md) | Checkers | board | 2 | registry + `applyMove` | RTDB | M | P3 |
| [trivia-blitz.md](trivia-blitz.md) | Trivia Blitz | party | 2–8 | custom party page | RTDB | S/M | P3 |
| [air-hockey.md](air-hockey.md) | Air Hockey | reflex | 2 | custom realtime page | WebRTC (pong stack) | M | P3 |
| [artillery.md](artillery.md) | Artillery | reflex | 2 | custom page | RTDB (deterministic replay) | L | P3 |

**Effort legend:** S ≈ one focused session · M ≈ 2–3 sessions · L ≈ a week of sessions.

**Priority rationale:** P1 fills genre gaps (drawing = party killer app, battleship = first
hidden-information game, hex = cheapest strategy-depth-per-line add). P2 leverages existing
infra with high replay value. P3 is expansion once P1/P2 land.

**Shared prerequisite:** Word Hunt and Word Duel both need the lazy-loaded dictionary module
(`src/lib/dictionary.js`, see word-hunt.md §Dictionary). Build it once with whichever ships
first.

---

## Shared platform conventions (all PRDs assume these)

### Integration types

- **A — standard registry board game:** one entry in `GAME_TYPES` (`src/lib/games.js`) with
  `boardSize`, `getMoveIndex`, `getWinner`, `BoardComponent`; `Game.jsx` needs no changes.
- **B — registry + `applyMove`:** for games with extra turns / multiple state arrays.
  `applyMove({ board, game, index, move, symbol })` → `{ updates, result }`; `boardProps(game)`
  spreads extra props onto the board. Precedents: dots & boxes, SOS, reversi, PIG (`boardSize: 0`,
  all state in custom keys).
- **C — custom 1v1 page:** registry entry is `{ custom: true }`; page lives in `src/pages/`,
  dispatched from the custom ladder in `Game.jsx` (~line 700–1000). Precedents: HangmanGame,
  TypingGame, ChimpGame, BluffBattleGame.
- **D — custom party page:** `{ custom: true, nPlayer: true, minPlayers, maxPlayers }`, optional
  `startRound(players)` hook. State lives in the `round` sub-node; per-player scores live in
  top-level `scores` **keyed by uid**; the host applies score deltas **once, idempotently, via a
  `round.scored` flag** (see `FibbageGame.jsx` ~line 178). Precedents: fibbage, wavelength, spyfair.
- **E — custom realtime page:** `{ custom: true, realtime: true }`. Firebase holds room/score/
  game-over + WebRTC signaling (`games/$id/signaling`); gameplay frames go over an unreliable
  `RTCDataChannel` (`src/lib/realtime/rtc.js`). Host (X) is authoritative, streams ~30 Hz
  snapshots; guest predicts own input. Precedents: pong, snake, tron, sumo, spaceduel.

### Non-negotiable checklists

Every new game, regardless of type:

1. Registry entry in `GAME_TYPES` (label ≤ ~13 chars, `badge`, `desc`, `category`, `maxWidth`).
2. Icon component in `src/components/GameIcons.jsx`.
3. `freshGameState()` branch in `src/lib/games.js` returning the game's initial state.
4. **Every new top-level Firebase key added to `FIELD_NULLS`** so switching games clears it.
   Keys inside `round` need nothing — `round: null` clears them.
5. Pure logic in `src/lib/<game>Logic.js` with a Vitest suite (`src/lib/<game>Logic.test.js`).
   Multiplayer flows are verified manually (second player in an **incognito window** — same-browser
   tabs share `playerId`).
6. `database.rules.json` needs **no changes** for new game keys — the `games/$gameId` node is
   permissive except for `players` (verified 2026-07).
7. Custom pages use **`onPlayAgain` (keeps score) for the round-continue button, never
   `onNewMatch` (resets)**.
8. Round winners go through the standard machinery: `runTransaction` sets `winner` and increments
   `scores`; the win effect, sounds, `recordMatch`, and the rematch/switch `proposal` handshake
   then work for free.

### Theming rules

All colors via `--c-*` CSS vars / semantic Tailwind tokens (`retro-p1/p2/cta/win`, tints, glows).
**Never hardcode hex.** Boards are DOM/CSS/SVG, not canvas. SVG presentation attributes can't hold
`var()` — use `style={{ fill: 'rgb(var(--c-…))' }}`. Exception precedent: content that must look
identical across themes (cursor sprites) may be theme-independent; the Sketch palette invokes this.

### Trust models (three tiers)

1. **Honest-client** (all board games): any client could write a bad move; accepted — same trust
   level as the existing 28 games.
2. **Commit-reveal** (`src/lib/commit.js`): `commit(secret)` → publish `hash` (salt secret) or
   `hash + salt` (enables self-grading); reveal at end; opponent's client runs `verifyReveal` and
   recomputes the full transcript. Precedent: hangwoman. Secrets in web storage keyed by gameId.
3. **Bundle-leak caveat** (all deck games): decks ship in the client JS bundle, so a player who
   inspects the bundle can always derive answers. This is a documented, accepted residual leak —
   copy the caveat comment from the top of `src/lib/decks/fibbage.js` into every new deck file.

### Seeded-race pattern (Word Hunt, Mine Race — precedents: math, typing)

Creator's client generates the seed/shared content inside `freshGameState()`. Both players play
the identical puzzle simultaneously; per-player progress mirrors are `<game><Stat>X` / `…O`
top-level keys; opponent progress renders as a "ghost" (bar/score only). Round ends when both
`done` flags set (or timer) → first client to observe completion runs the winner transaction.
**Never mirror information that would help the opponent** (e.g. revealed minesweeper cell
positions) — mirror counts/scores only.
