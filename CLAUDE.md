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
status:      "waiting" | "playing" | "finished"
board:       string[9]  — '' for empty, 'X' or 'O' for occupied
currentTurn: "X" | "O"
winner:      "X" | "O" | "draw"  (absent until game ends)
winningLine: number[3]            (absent until game ends)
createdAt:   timestamp
players:
  X: { name, joinedAt }
  O: { name, joinedAt }   (absent until second player joins)
```

**Firebase and null values:** Firebase deletes keys set to `null`. Empty board cells are stored as `''` (not `null`) so the array length stays stable. `winner` and `winningLine` are absent when not applicable — always read them as `game.winner ?? null`. `normalizeBoard()` in `src/lib/gameLogic.js` converts whatever Firebase returns (array or numeric-keyed object) to a guaranteed 9-element string array.

### Player identity

Identity is tracked in `sessionStorage` only — no auth:
- `playerName` — the display name entered on the home page
- `game-{gameId}` — `{ symbol: "X"|"O"|null }` for the current game slot

The creator is always X; the first person to join an open O slot becomes O; everyone else is a spectator (`symbol: null`). Slot claiming uses a Firebase `runTransaction` to prevent races.

### Adding a new game

The room/invite/Firebase layer is game-agnostic. To add a second game:
1. Add a route and game component in `src/pages/`
2. Implement the game's win detection in `src/lib/gameLogic.js` (or a new file)
3. Reuse `WaitingRoom`, `PlayerCard`, and the Firebase session pattern from `Game.jsx`

The planned shape for extracting game logic is `{ initialState, getWinner }` per game type, consumed by a shared room wrapper.
