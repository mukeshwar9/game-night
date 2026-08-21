---
name: add-a-game
description: Full end-to-end procedure for adding a new game to the games platform — logic module with tests, board component, icon, registry entry, and when to use the applyMove/boardProps hooks for non-standard games. Use when asked to add, build, or scaffold a new game.
user-invocable: true
---

# add-a-game

Adds a new game to the platform. The room/invite/Firebase/presence layer is entirely game-agnostic — `src/lib/games.js`'s `GAME_TYPES` registry is the single source of per-game config, and `Game.jsx` contains no per-game branches. Getting a game into the registry correctly is most of the work; see also `.claude/rules/adding-a-game-rules.md` for the compact version of this procedure and `.claude/rules/game-logic-rules.md` / `.claude/rules/firebase-rules.md` / `.claude/rules/theming-rules.md` for the conventions the new files must follow.

## Steps

1. **Logic module — `src/lib/<name>Logic.js`.**
   Pure functions only: no DOM, no Firebase, no React. At minimum export `getWinner(board)` and any move helpers the board needs (e.g. `getMoveIndex`). If the board isn't a flat `board` array — extra state arrays, non-standard shapes — see the hooks section below instead of forcing `getWinner`.
   **Ship `src/lib/<name>Logic.test.js` beside it, in the same commit.** This is not optional — it's the single most-repeated gap found across review passes (see `review-a-game`), and an untested logic module has shipped silently wrong more than once in this codebase (e.g. a bot reusing a differently-sized win-checker).
   If normalizing a Firebase-sourced array/object (sparse writes, numeric-keyed objects), follow `.claude/rules/firebase-rules.md` — map by explicit parsed key, never `Object.values`.

2. **Board component — `src/components/<Name>Board.jsx`.**
   Rendering only — no rules, no scoring, no win logic. Reads `board` (and any extra `boardProps`) and calls `onMove` with whatever payload the logic module's `getMoveIndex`/`applyMove` expects. Colors go through `--c-*` / `retro-*` tokens per `.claude/rules/theming-rules.md` — never a hardcoded hex, and remember SVG presentation attributes can't hold `var()` (use `style` or Tailwind `fill-*`/`stroke-*`).
   If pieces are distinguished only by color (no letter/glyph), consider a colorblind-safe alternative — several existing boards (Reversi, Hex, Connect Four, Gomoku) were flagged for exactly this in review; TTT/Ultimate TTT/SOS's letter glyphs are the reference pattern.

3. **Icon — `src/components/GameIcons.jsx`.**
   Add an icon component there; it's referenced from the registry entry's `Icon`.

4. **Registry entry — `src/lib/games.js`.**
   Add one entry to `GAME_TYPES` with `boardSize`, `getMoveIndex`, `getWinner` (or the hooks below), `BoardComponent`, `badge`, `maxWidth`, `desc`, `Icon`. `freshGameState()` derives the initial Firebase state automatically from this entry — you don't hand-write initial state anywhere else. The home-screen grid and the end-of-game "SWITCH GAME" picker both render from the registry via `GamePicker`; no UI file needs a per-game change.

## `applyMove` / `boardProps` hooks — when the standard shape doesn't fit

The default path is: place a symbol → flip `currentTurn` → check `getWinner`. Games that diverge (extra turn on a completed box/sequence, multiple state arrays, simultaneous/real-time state) supply these instead:

- **`applyMove({ board, game, index, move, symbol })`** → `{ updates, result }`. `updates` is the *complete* Firebase patch for the move (board, any extra arrays, `currentTurn`, etc.); `result` is `null` or `{ winner }`. When present, `Game.jsx` delegates the whole move to this hook — you own turn-flip logic entirely (e.g. Dots and Boxes and SOS both keep `currentTurn` on the mover when a box/sequence completes). `move` is whatever raw payload the board's `onMove` passes (SOS passes `{ index, letter }`); `index` is what `getMoveIndex` derived from it.
- **`boardProps(game)`** → extra props spread onto `<BoardComponent>` beyond `board` (e.g. `{ boxes }` for Dots and Boxes, `{ sosLines }` for SOS). Omit if the board only needs `board`.

For a game breaking the turn-based model entirely (continuous physics, real-time), see Pong (`AGENTS.md`'s "Real-time games" section) — it uses `custom: true`, WebRTC data-channel transport signaled through Firebase, and a host-authoritative sim. That is a much larger undertaking than the standard registry path above; don't reach for it unless the game genuinely needs sub-tick-rate state.

## What you get for free, once the game is registered

- **Room/invite/presence/reconnect** — lobby creation, invite links, seat claiming (`runTransaction`), online/offline presence, and seat-reclaim-by-uid on tab close/reopen.
- **Sounds** — move/win sound effects wired through the shared layer.
- **Scores** — `scores.X`/`scores.O` tracked and incremented automatically on win.
- **Game switching** — the end-of-game "SWITCH GAME" picker and `handleSwitchGame` remount the whole game tree via `key={game.gameType}`; `freshGameState()` nulls out the previous game's keys.
- **Win effect** — the shared win-celebration UI fires off `result.winner` from the standard path or your `applyMove` hook.
- **Theming** — any color token used in the board component automatically re-themes across all 5 themes with zero extra work.

## Testing

`npm test` runs the full Vitest suite — this only exercises `src/lib/*Logic.js` modules, so it will catch bugs in your logic module but nothing about the board component, registry wiring, or multiplayer behavior. Verify the room/invite/turn flow by hand, with the second player in a separate browser profile (see `AGENTS.md`'s Commands section — two tabs in the same browser share `playerId` and simulate one player, not two).
