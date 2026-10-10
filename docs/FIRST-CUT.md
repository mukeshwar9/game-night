# First Cut

A katana reflex duel. One item sits on a plate; some are fruit and the rest are
round lookalikes. Tap your pad while a fruit shows and your katana swings
through it. Tap a lookalike and the blade stops dead at its edge without
cutting, then lifts back slowly, so you also miss the next item. First to 10
wins (one phone, solo) or first to 5 takes a round (online).

The mechanic is a study of a go/no-go minigame in a popular multi-minigame
phone app; the name, art, sound and code are Game Night's own. The design board
with the playable prototype is `.lavish/first-cut/index.html`.

## Where it plays

| Mode | Route | Players | Notes |
|---|---|---|---|
| One phone | `/local/firstcut` | 2–4 humans, one pad each | Pads on the screen edges, keys A · L · Q · P |
| Solo | `/solo/firstcut` | you + 1–3 bots | EASY / NORMAL / HARD, win/loss record per level |
| Online | room, `race: true` | 2–8 | `RaceShell`: ready-up, 3 s countdown, first to 3 round wins takes the match |

## How it is built

- `src/lib/firstCutLogic.js` is pure. The game is a function of three things:
  the seed and table options (`entryAt`: what shows when, for how long), each
  player's *reports* (`t[k]` = ms from item `k` appearing to a cut attempt,
  `j[k]` = a wrong swing), and the clock. `resolveRound` scores them: fastest
  legal cut owns a fruit, a dead heat is void, a wrong swing blocks the player
  for the rest of that item and the whole next real item, a rotten fruit also
  costs a point. One phone, bots and online all use it.
- `src/hooks/useFirstCutPlay.js` keeps the current item, scores the reports and
  turns changes in the score into what you see and hear, so a bot, a rival and
  your own tap play through one path.
- `src/components/FirstCutTable.jsx` (+ `.css`, `FirstCutSprites.jsx`) renders
  the table; `src/lib/firstCutFx.js` is the particle canvas; layout data is in
  `firstCutLayout.js`.
- Pages: `FirstCutDemo.jsx` (solo and one phone), `FirstCutGame.jsx` (online).

## Online fairness

Message arrival order cannot decide who was first, because that rewards the
best connection. Every client plays the same seeded timetable on the server
clock and times its own tap from the moment the item appeared on its device,
then writes only its own reports. The owner of a fruit is the smallest
reported time. A round is decided once the fifth cut is *final*: a faster
report can no longer arrive (`FC_SETTLE_MS` after the first report's time).

Trade-off: the times are client-reported, so a modified client could send a
false fast time. Reaction Time has the same property. Keep this game off the
verified leaderboard (it is: results are race results, not board-game wins).

Database: `firstcutConfig` (host's table options, validated shape) and the
owner-only stats rule extended to `firstcut`. No Cloud Functions change.

## Table options (the first twists)

- **RULE FLIP**: a card by the plate says what counts (any fruit, citrus only,
  no citrus, red or green) and changes every 6 items, announced by a short
  pause. Stops the game collapsing into pure speed.
- **GOLD & ROTTEN**: gold fruit is worth 3 and leaves in 0.8 s; rotten fruit
  looks like fruit, costs a point and blocks; a player 3 or more behind is
  freed as soon as the current item leaves.

Pace: SLOW (1.2–1.9 s per item, the default after the captain's first review)
or MEDIUM (0.95–1.5 s).

## Not built, and open

- Co-op (ORDER UP), THE FEINT and THE DEALER from the design board.
- Every timing and bot value is a starting guess; none has been played on a
  real phone. Check that cuts do not feel late (`IMPACT_MS` in the play hook,
  150 ms), that blocks read clearly, and that NORMAL is beatable about half the
  time.
- Frame rate on a low-end Android phone is unmeasured. The first things to cut
  are the cast-shadow filters on the katana and the halves.
- The table's fruit and blade steel are fixed colours (gameplay information,
  like avatars). Everything else reads the theme's `--c-*` tokens.
