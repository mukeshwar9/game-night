# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server at http://localhost:5173
npm run build     # production build (outputs to dist/)
npm run preview   # serve the production build locally
npm run lint      # ESLint
npm test          # Vitest — suites for src/lib/hangmanLogic.js and src/lib/commit.js
```

Unit tests cover only the pure hangwoman/commit logic. Multiplayer flows are verified manually by opening two browser tabs, creating a game in one, and joining via the link in the other (sessionStorage is per-tab, so two tabs act as two players).

## Environment

Copy `.env.local.example` to `.env.local` and fill in Firebase config values (`VITE_FIREBASE_*`). The app will not connect to any database without this file.

## Architecture

This is a React + Vite PWA. All multiplayer state lives in **Firebase Realtime Database** — there is no backend server.

### Data model

Each game is a node at `games/{gameId}` in Firebase:

```
gameType:    "tictactoe" | "connectfour" | "hangwoman"
status:      "waiting" | "playing" | "finished"
board:       string[9] (TTT) | string[42] (Connect Four) — '' for empty, 'X' or 'O' for occupied; absent for hangwoman
currentTurn: "X" | "O"                                     (absent for hangwoman)
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

Hangwoman has no `board`/`currentTurn`; it stores a `round` sub-node instead (`setter`, `phase`, `wrongCount`, `wordLength`, `commitment`, `guesses`, `reveal`, `result` — see `src/pages/HangmanGame.jsx`). The word never touches Firebase until reveal: the setter keeps it in sessionStorage and publishes a salted SHA-256 commitment (`src/lib/commit.js`); the guesser's client verifies the reveal against the commitment and all recorded answers.

**`gameType` is mutable.** Any player can switch the room to a different game from an end-of-game screen (`handleSwitchGame` in `Game.jsx`). `freshGameState()` in `src/lib/games.js` is the single source of per-game initial state — used by game creation (`Home.jsx`) and switching; it relies on `null`s to delete the other game's keys. Clients follow automatically: `Game.jsx` remounts the whole game tree via `key={game.gameType}`.

**Firebase and null values:** Firebase deletes keys set to `null`. Empty board cells are stored as `''` (not `null`) so the array length stays stable. `winner` and `winningLine` are absent when not applicable — always read them as `game.winner ?? null`. `normalizeBoard()` in `src/lib/gameLogic.js` converts whatever Firebase returns (array or numeric-keyed object) to a guaranteed 9-element string array.

### Player identity

Identity is tracked in `sessionStorage` only — no auth:
- `playerName` — the display name entered on the home page
- `game-{gameId}` — `{ symbol: "X"|"O"|null }` for the current game slot
- `hangwoman-word-{gameId}` — `{ word, salt }`, the setter's secret; tab-local, so a setter who reloads in a new tab loses the word and must concede the round

The creator is always X; the first person to join an open O slot becomes O; everyone else is a spectator (`symbol: null`). Slot claiming uses a Firebase `runTransaction` to prevent races.

### Adding a new game

The room/invite/Firebase/presence layer is game-agnostic. `Game.jsx` branches on `game.gameType` to render the right board and call the right win function. To add a new game:
1. Add a logic file in `src/lib/` exporting `getWinner(board)` and any move helpers
2. Add a board component in `src/components/`
3. Add an entry to `GAME_TYPES` and a branch to `freshGameState()` in `src/lib/games.js` (in-room switcher + initial state)
4. Branch on the new `gameType` string in `Game.jsx` (board size, move handler, board component, win function)
5. Add a card to the `GAMES` array in `src/pages/Home.jsx`

Sounds, presence, score tracking, game switching, and the win effect work automatically for any game type. A future game-registry refactor would collapse the remaining per-type branches in `Game.jsx` into `src/lib/games.js`.
