# Cloud Functions

Two functions, both in `index.js`. Cloud Functions need the **Blaze (pay-as-you-go) plan**; at game-night traffic both stay well inside the free tier.

| Function | Trigger | What it does |
|---|---|---|
| `cleanupStaleGames` | Every 24 h | Deletes rooms idle for a day, stale public listings and old invites, the `results/` record of every deleted room, and error-report buckets (`errors/{UTC day}`) older than the last 14 days. It never deletes leaderboard rows. |
| `creditMatchResults` (`results.js`) | Every write to `games/{gameId}/status` | Credits finished 2-player matches to `leaderboard/{uid}`, once per match, after re-checking the result. This is the only writer of `leaderboard/`. |

## How a result is credited

The trigger reads the room each time its `status` changes, and all the decisions are made in the pure core, `src/core.mjs`:

1. **A match is an epoch.** A 2P round that starts at 0–0 opens a new epoch in `results/{gameId}`. This covers a new room, NEW MATCH, a game switch and a winner-stays reseat. PLAY AGAIN inside a match does not open one.
2. **Every finished round is judged once**, keyed by a signature of its board, winner and scores. Replaying a finish (flipping `status` back and forth) records nothing new.
   - Board games in `VERIFIERS` (Tic Tac Toe and 4×4, Connect Four and Connect 5, Gomoku and Gomoku Swap, Hex, Sim, Reversi, Order & Chaos) recompute the winner from the stored board. They use the same `src/lib/*Logic.js` functions the app plays with. The placement games also check stone counts, that `lastMove` is the finishing stone on the winning line, and gravity for Connect Four.
   - If the board contradicts the claimed winner, the round is **rejected** and the whole match is tainted.
   - If the board shows no result and the loser's seat is offline or has left, the round counts as a forfeit (the CLAIM WIN path). If the loser is online, the round is not counted.
3. **The finish that decides the match** closes the epoch. It uses `src/lib/matchRules.js`, the same module `Game.jsx` uses to decide when to record the match. For board games, the winner must also have enough verified rounds in the epoch to account for their score, so a score written straight to 3 does not count.
4. An accepted match is queued in `results/{gameId}/matches/{epoch}`. Then each seat's `leaderboard/{uid}` row is updated in a transaction, with wins, games, streak and bestStreak.
   - Each row keeps its last 16 match keys, so a retried or concurrent run never counts a match twice.
   - Each row also gets `verified: true` and `verifiedWins`, a copy of `wins` that the Leaderboard page sorts on (see *Legacy leaderboard rows*).
   - Both seats must have a profile (`profiles/{uid}` or `users/{uid}`). Otherwise the match is marked rejected and nobody is credited.
   - Name and avatar come from `profiles/{uid}`, then `users/{uid}`, then the seat.

### What the database rules add

`database.rules.json` backs the function up:

- Seats can only be claimed for your own uid.
- Scores move +1 only by a seated player, and any member can reset them to 0.
- `winner` can only be set while `status` is `playing`.
- For the `VERIFIERS` game types, a changed board cell must come from `players[currentTurn]` while the round is `playing`.

### Trust limits (documented, not solved)

- **Custom and real-time games** (Pong, Snake, the word games, Battleship, …) keep no board the server could replay. They are credited when both seats are distinct profiles and the finish came through the normal path (`status` → `finished` with scores that end the match). A modified client can still forge these.
- **Board games are checked at the finish, not move by move.** The turn-gated rules stop a player writing on the opponent's turn. The stone-count check at the finish catches extra stones, and cells blanked with `null` (RTDB rules can't validate deletes). What's left: on their own turn, a player can rearrange stones while keeping the counts consistent, for example moving one of their stones instead of placing a new one. Closing that needs per-move validation.
- **Sybil accounts.** Anyone can make a second anonymous account and farm wins against it. Profile-required crediting only stops made-up uids.
- **A very fast rematch.** If a new round starts before the function reads the finished room (a cold start plus an instant PLAY AGAIN), that round counts as "unknown" for either side. If the next match starts that fast, the previous match may not be credited. Neither case over-credits.
- **Rooms in play at deploy time.** Their current match started before the function saw it, so it is not credited. The next match is.

## Building (esbuild bundle)

The core imports app code from `../src/lib`, but `firebase deploy` uploads only `functions/`. So `build.js` bundles `src/core.mjs` and the logic modules it imports into `lib/core.cjs`, which is what `results.js` requires.

- `npm --prefix functions run build` builds the bundle. `firebase.json` runs it as the functions `predeploy` step, so every deploy ships fresh logic.
- `lib/` is git-ignored. We commit the bundler config, not the bundle.
- `"gcp-build": ""` stops Cloud Build from re-running `build` in the cloud, where `../src` does not exist.
- `firebase.json`'s `ignore` keeps `src/` and `test/` out of the upload.

## Deploy

```bash
firebase deploy --only functions,database
```

Deploy the functions together with `database.rules.json`, because the rules are what stop clients writing `leaderboard/`. Clients from before this change still try to write it; the rules reject those writes quietly, since the client swallows the error.

## Legacy leaderboard rows (kept, hidden, opt-in delete)

Rows written by the old client mirror (no `verified: true`) are **not deleted by anything automatic**. Instead they stay hidden:

- The Leaderboard page queries `orderByChild('verifiedWins')` (indexed in `database.rules.json`). Only server-written rows have `verifiedWins`, and a missing child sorts lowest, so legacy rows can't crowd the top 50.
- The page also filters out rows that lack `verified: true`.
- A legacy player's row is replaced by a verified one, starting from zero, the first time they are credited a match.

Deleting the leftovers is the project owner's call. `scripts/purge-legacy-leaderboard.js` does it on purpose. It is a dry run unless you pass `--yes`, and it uses Application Default Credentials (`gcloud auth application-default login`):

```bash
# list what would go
node functions/scripts/purge-legacy-leaderboard.js --database-url https://<project>-default-rtdb.firebaseio.com
# delete it
node functions/scripts/purge-legacy-leaderboard.js --database-url https://<project>-default-rtdb.firebaseio.com --yes
```

The emulator test runs the script too, both as a dry run and with `--yes`.

## Tests

```bash
npm --prefix functions test               # unit tests of the pure core, run on the built bundle (node --test)
npm --prefix functions run test:emulator  # Functions + RTDB emulators, demo project, free ports
```

The emulator test writes Tic Tac Toe rooms the way `Game.jsx` does. It checks that:

- a match is credited once;
- a replayed finish is not counted again;
- a second match in the same room is counted;
- a forged winner and a jumped score are refused;
- a seat without a profile gets nothing;
- a legacy client-written row restarts from zero;
- legacy rows stay out of the top-N query, and the opt-in purge script's dry run and `--yes` both work.

It needs the Firebase CLI and Java, and it never touches a real project.

## Keeping in sync with the app

- **When a match ends** comes from `src/lib/matchRules.js` (`matchTargetFor`, `isMatchFinish`), imported by both `Game.jsx` and `src/core.mjs`. Nothing needs mirroring, but a change there changes leaderboard crediting too, so rebuild and redeploy the functions along with the app.
- **`VERIFIERS`** lists games by type. A new board game is credited on trust until it is added there, together with the flags that describe it. The turn-gated board rule in `database.rules.json` lists the same types, so add it there too.
