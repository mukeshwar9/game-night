# Adding a Game — Registry Procedure

The room/invite/Firebase/presence layer is game-agnostic. `src/lib/games.js` is the single registry — `Game.jsx` reads config from it and needs **no per-game branches**. To add a new board game:

1. Add a logic file in `src/lib/` exporting `getWinner(board)` and any move helpers (e.g. `getMoveIndex`).
2. Add a board component in `src/components/`.
3. Add an icon component to `src/components/GameIcons.jsx`.
4. Add one entry to `GAME_TYPES` in `src/lib/games.js` with `boardSize`, `getMoveIndex`, `getWinner`, `BoardComponent`, `badge`, `maxWidth`, `desc`, `Icon`. Boards are lazy: declare them as `const XBoard = lazyWithRetry(() => import('../components/XBoard'))`; a custom game adds `Page: lazyWithRetry(() => import('../pages/XGame'))`, which `Game.jsx` renders — never import a page or board eagerly into `games.js`. `freshGameState()` derives the initial Firebase state from the entry. The catalogue and the "SWITCH GAME" picker render from the registry via `GamePicker` — no UI changes needed.
5. HOW TO PLAY text in `src/lib/rules.js` (a test requires one per registry type).
6. New room keys: per-match keys go in `FIELD_NULLS` so switching clears them; room-level keys that must survive switches (like `seen`, `sealKeys`, `timerScale`) stay out of it. Every key the client writes needs a rule in `database.rules.json` and a case in `tests/rules/`. Multi-client flows get an e2e spec in `tests/e2e/`.
7. Party games add `nPlayer: true, minPlayers, maxPlayers` and use the online-aware coordinator (`src/lib/coordinator.js`) for host-only steps; simultaneous races add `race: true` and build on `RaceShell`; secrets use `commit.js` or `sealed.js`, never plaintext in the room.

For full step-by-step detail (tests, sounds/presence you get for free, when to reach for the hooks below) see the `add-a-game` skill.

## `applyMove` / `boardProps` hooks

For games that don't fit the standard place-symbol → flip-turn → check-winner shape (extra turn on completion, multiple state arrays, non-turn-based state), supply these instead of `getWinner`:

- **`applyMove({ board, game, index, move, symbol })`** → returns `{ updates, result }`, where `updates` is the full Firebase patch (board, boxes, currentTurn, etc.) and `result` is `null | { winner }`. When present, `Game.jsx` delegates the entire move to this hook instead of the standard path. `move` is the raw payload the board component's `onMove` passes (e.g. SOS passes `{ index, letter }`); `index` is the cell index derived by `getMoveIndex`.
- **`boardProps(game)`** → extra props spread onto `<BoardComponent>` (e.g. `{ boxes }` for Dots and Boxes, `{ sosLines }` for SOS). Omit for games that only need `board`.

Sounds, presence, score tracking, game switching, and the win effect work automatically for any game type through the shared layer — don't reimplement them per game.
