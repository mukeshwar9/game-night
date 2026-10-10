# LAZY SUSAN

Two to four players around one turning plate. Tap when a piece is inside your gate to take it; a tap on
nothing costs a point. First to 15 (two players), 12 (three) or 10 (four) wins. A match is about a minute.

The design board, with the source-game study, the playable prototype and the three twists, is in
`.lavish/last-sashimi/`. The source is JindoBlu's "2 3 4 Player Mini Games"; this is Game Night's own
version of the mechanic (own name, art and rules).

## Where it lives

| Piece | File |
|---|---|
| Pure rules: plate chain, claims, scores, locks, bot | `src/lib/lazySusanLogic.js` (+ `.test.js`) |
| Seat limits, targets and the fresh round (kept apart so the registry stays small) | `src/lib/lazySusanRound.js` |
| Palette derived from the `--c-*` theme tokens | `src/lib/lazySusanTheme.js` (+ `.test.js`) |
| Canvas drawing and effects | `src/components/lazySusanDraw.js` |
| Table component: pointers, keys, locks, bots, sounds | `src/components/LazySusanArena.jsx` |
| Online room | `src/pages/LazySusanGame.jsx` |
| Solo vs bot (`/solo/lazysusan`) and one phone (`/local/lazysusan`) | `src/pages/LazySusanDemo.jsx` |
| Rules for the new keys | `database.rules.json` (`round/lsClaims`, `round/lsMiss`), `tests/rules/lazysusan.test.js` |
| Two-client flow | `tests/e2e/lazysusan.spec.js` |

## Twists (all on by default; switchable offline)

- **THE TURN**: each new plate turns the other way, so no seat is permanently upstream.
- **HOT CHILI**: one chili per plate, two from plate 4. Taking it costs 2 points and freezes your chopsticks
  for 0.9 s.
- **LAST BITE**: the last edible piece on a plate is gold, worth double, and the plate speeds up by 45 %.

## How the round works

The whole match is one `round` object (`lsSeats`, `lsSeed`, `lsStart`, `lsTarget`, `lsTwists`, `lsClaims`,
`lsMiss`). It holds no positions. `derive(round)` builds the chain of plates from the seed and the claims:
plate 1 appears at `lsStart`, and each next plate appears 0.75 s after the last edible piece of the previous
one was claimed, continuing that plate's momentum. `viewAt(derived, now)` then gives the angle and pieces at
any moment. The plate's speed eases toward its target with a closed form, so any client can ask for any
moment without stepping a simulation.

Scores are never stored. Every claim and miss is replayed in time order (`at`, then key): a dumpling is 1,
the bun 3, the last edible of a plate doubles, a chili costs 2 and a miss costs 1, never below zero. The
first score at or over the target wins.

## Online

- START (host, in the lobby) builds the round inside the room transaction, with the server time as `lsStart`
  (`startRound(players, room, { now })`, passed by `Game.jsx`).
- A taken piece is written once at `round/lsClaims/p{plate}_{piece}` as `{ by, at: serverTimestamp }`. The
  rules require `by` to be the writer and refuse to change an existing claim, so the first write in server
  order owns the piece. A client whose write is refused sees TAKEN and loses nothing.
- A tap on nothing is appended to `round/lsMiss/{pushId}`.
- Any client that derives a winner finishes the room with a transaction that re-derives the winner from the
  room's own round. If every other seat is offline the last client left may CLAIM WIN.
- Honest-client trust: the rules cannot check that a piece was in a gate. That is acceptable for a party game;
  results are not credited to the verified leaderboard.

## Tuning (starting values, `TUNING` in the logic module)

| Value | Start | Where it matters |
|---|---|---|
| Gate half-width | 0.2 rad | How forgiving the hit window is |
| Plate speed | 1.45 rad/s, +0.14 per plate, cap 2.5 | Match length and difficulty |
| LAST BITE speed-up | ×1.45 | The climax of a plate |
| Miss lock / hit lock | 0.45 s / 0.22 s | Whether mashing can beat timing |
| Chili freeze / cost | 0.9 s / 2 points | How often a chili is worth risking |
| Born lock | 0.3 s | A piece cannot be taken the moment it appears |
| Input buffer | 0.12 s | A tap this close to the end of a lock still fires |
| Bot (easy / normal / hard) | 85 / 55 / 30 ms spread, 45 / 20 / 5 % skipped | Win rate against a regular player |

None of these have been playtested with people yet. The plan is to time ten matches per player count and
adjust the targets and speeds before shipping widely.

## Not done

- Online twist switches (the room always plays with all three twists).
- The TWO RINGS and BANQUET (co-op) variants from the design board.
- A real two-phone and four-thumb test; audio on iOS.
