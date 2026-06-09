# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server at http://localhost:5173
npm run build     # production build (outputs to dist/)
npm run preview   # serve the production build locally
npm run lint      # ESLint
```

There are no automated tests. Verification is done by opening two browser tabs, creating a game in one, and joining via the link in the other.

## Environment

Copy `.env.local.example` to `.env.local` and fill in Firebase config values (`VITE_FIREBASE_*`). The app will not connect to any database without this file.

## Architecture

This is a React + Vite PWA. All multiplayer state lives in **Firebase Realtime Database** — there is no backend server.

### Data model

Each game is a node at `games/{gameId}` in Firebase:

```
gameType:    "tictactoe" | "connectfour" | "hangman"
status:      "waiting" | "playing" | "finished"
board:       string[9] (TTT) | string[42] (Connect Four) — '' for empty, 'X' or 'O' for occupied
currentTurn: "X" | "O"
winner:      "X" | "O" | "draw"  (absent until game ends)
winningLine: number[3]            (absent until game ends)
createdAt:   timestamp
players:
  X: { name, joinedAt }
  O: { name, joinedAt }   (absent until second player joins)
scores:
  X: number
  O: number
presence:
  X: { online: boolean }
  O: { online: boolean }
```

Hangman also stores a `round` sub-node (`setter`, `phase`, `wrongCount`, and commit/reveal fields — see `src/pages/HangmanGame.jsx`).

**Firebase and null values:** Firebase deletes keys set to `null`. Empty board cells are stored as `''` (not `null`) so the array length stays stable. `winner` and `winningLine` are absent when not applicable — always read them as `game.winner ?? null`. `normalizeBoard()` in `src/lib/gameLogic.js` converts whatever Firebase returns (array or numeric-keyed object) to a guaranteed 9-element string array.

### Player identity

Identity is tracked in `sessionStorage` only — no auth:
- `playerName` — the display name entered on the home page
- `game-{gameId}` — `{ symbol: "X"|"O"|null }` for the current game slot

The creator is always X; the first person to join an open O slot becomes O; everyone else is a spectator (`symbol: null`). Slot claiming uses a Firebase `runTransaction` to prevent races.

### Adding a new game

The room/invite/Firebase/presence layer is game-agnostic. `Game.jsx` branches on `game.gameType` to render the right board and call the right win function. To add a new game:
1. Add a logic file in `src/lib/` exporting `getWinner(board)` and any move helpers
2. Add a board component in `src/components/`
3. Branch on the new `gameType` string in `Game.jsx` (board size, move handler, board component, win function)
4. Add a card to the `GAMES` array in `src/pages/Home.jsx`

Sounds, presence, score tracking, and the win effect work automatically for any game type. A future game-registry refactor would collapse the per-type branches in `Game.jsx` into a single lookup table.
