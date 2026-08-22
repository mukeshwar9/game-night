# Adding a Game — Registry Procedure

The room/invite/Firebase/presence layer is game-agnostic. `src/lib/games.js` is the single registry — `Game.jsx` reads config from it and needs **no per-game branches**. To add a new board game:

1. Add a logic file in `src/lib/` exporting `getWinner(board)` and any move helpers (e.g. `getMoveIndex`).
2. Add a board component in `src/components/`.
3. Add an icon component to `src/components/GameIcons.jsx`.
4. Add one entry to `GAME_TYPES` in `src/lib/games.js` with `boardSize`, `getMoveIndex`, `getWinner`, `BoardComponent`, `badge`, `maxWidth`, `desc`, `Icon`. `freshGameState()` derives the initial Firebase state automatically from this entry. The home-screen grid and the end-of-game "SWITCH GAME" picker both render from the registry via `GamePicker` — no UI changes needed.

For full step-by-step detail (tests, sounds/presence you get for free, when to reach for the hooks below) see the `add-a-game` skill.

## `applyMove` / `boardProps` hooks

For games that don't fit the standard place-symbol → flip-turn → check-winner shape (extra turn on completion, multiple state arrays, non-turn-based state), supply these instead of `getWinner`:

- **`applyMove({ board, game, index, move, symbol })`** → returns `{ updates, result }`, where `updates` is the full Firebase patch (board, boxes, currentTurn, etc.) and `result` is `null | { winner }`. When present, `Game.jsx` delegates the entire move to this hook instead of the standard path. `move` is the raw payload the board component's `onMove` passes (e.g. SOS passes `{ index, letter }`); `index` is the cell index derived by `getMoveIndex`.
- **`boardProps(game)`** → extra props spread onto `<BoardComponent>` (e.g. `{ boxes }` for Dots and Boxes, `{ sosLines }` for SOS). Omit for games that only need `board`.

Sounds, presence, score tracking, game switching, and the win effect work automatically for any game type through the shared layer — don't reimplement them per game.
