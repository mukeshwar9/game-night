# Arrows Party

A shared-board race mode for 2–4 phones, next to the original two-player Arrows race (`ArrowsGame.jsx`, which is unchanged). It is a separate registry type, `arrowsparty` (a variant of `arrows`, reached through MORE MODES), built on the party-race shell (`RaceShell` + `raceLogic.js`).

Design source: the scout report for task `games-arrows-party-design-s1` (layouts, fairness, the decisions D1–D7). The captain's answers: bigger boards that zoom are fine, keep easy / medium / hard, and let the host pick 3 / 5 / 7 rounds before the game starts.

## What a round is

Every racer clears the same puzzle at the same time. The puzzle is one seeded zone board (`partyLevel(seed, racers, tier)`). The room draws one copy per racer on a shared picture, each copy turned or mirrored with `transformLevel`, and every phone draws it from its own seat so your zone is at the bottom and the rivals sit above as dim silhouettes that empty as they clear.

| Racers | Layout | Zone copies (as seen by you) |
| --- | --- | --- |
| 2 | FACE-OFF: zones stacked | you `id`, rival `rot180` |
| 3 | LANES: three bands | all `id` |
| 4 | TALL QUADS: a 2 × 2 cross | you `id`, then `flipX`, `rot180`, `flipY` |

- `transformLevel(level, 'id' | 'flipX' | 'flipY' | 'rot180')` moves cells, maps each heading through the transform and swaps a hook's turn under a mirror. Arrows keep their index, so a cleared set made on one copy is valid on all of them. `arrowsPartyLogic.test.js` proves, on generated boards of every tier and size, that every copy has the same depth and the same number of free arrows at the start.
- Zones are separated by a one-cell void gutter, so the picture is one shaped board (`mask`) where an arrow that reaches its zone's border has left. No rival can ever block your route: your puzzle depends on nothing but the seed.
- Zone size grows with the tier and shrinks with the racer count (`PARTY_ZONE_SIZES`). The picture is often bigger than the phone: `ArrowsBoard` opens its camera (drag, pinch, wheel, − FIT +) zoomed on your own zone (`home`).
- Arrow indexes are listed seat by seat (`seat * perZone + i`), whichever way the picture is turned. Seats are the sorted racer uids of the round.

## Rules

- 2 racers: 3 lives, like the original race; out of lives is a DNF. 3–4 racers: a blocked tap freezes your board for 2 s (`PARTY_FREEZE_MS`), no knock-out.
- A racer finishes when their zone is clear (`fin` = ms from the go signal). The round ends when everyone has finished, the clock runs out (`PARTY_ROUND_MS`, a DNF for the rest) or only long-offline racers are left (`OFFLINE_GRACE_MS`).
- The cup is the host's pick of 3 / 5 / 7 rounds (`arrowsPartyConfig.rounds`; `cupRacesFor('arrowsparty', room)`), scored by finish order with `placementPoints` (4 racers: 3 / 2 / 1 / 0, fewer racers scale down). Ties go to the fewer blocked taps. Difficulty and rounds freeze once the cup is under way (`configLocked`).
- SABOTAGE (host toggle, off by default): clear 3 arrows in a row without a blocked tap and a crate drops on the racer in the lead, only while you are behind them. The drop is one write-once record, `round/drops/{victim}/{n}` = `"{victim cleared}|{round id}|{sender}"`. Every phone turns it into the same crate with `placeCrate` (a seeded pick among safe cells). A crate blocks the routes through its square until the victim's zone has cleared `at + 2` arrows (`level.crates` entries carry `from` / `to` so only that zone's clears count). `placeCrate` only picks a cell where the arrows it blocks are ones nothing else waits on, so a crate delays a racer but can never trap them, in any order of play (checked by randomised play in the tests); `solveArrows` re-checks every board with its crates.

## Sync

`round/stats/{round}/{uid}`: `g/{index}` (a cleared arrow, write-once), `m` (blocked taps, only up), `fin` (write-once), `x` (knocked out, 2 racers). Rules in `database.rules.json`, cases in `tests/rules/arrowsparty.test.js`. The room config `arrowsPartyConfig` (`version`, `tier`, `rounds`, `sabotage`) is validated at the room level; the round copies `tier` and `sab` so a later edit never reshapes a live round. A two-browser-context flow is covered by `tests/e2e/arrowsparty.spec.js`.

## Pieces

- `src/lib/arrowsPartyLogic.js` (+ test): transforms, zone sizes and specs, the shared picture, stats / ranking / config, sabotage.
- `src/pages/ArrowsPartyGame.jsx`: the racer, the spectator view and the RaceShell config.
- `src/components/ArrowsPartySettings.jsx`: the host's difficulty / rounds / sabotage picker.
- `ArrowsBoard.jsx`: `zones` (owner tint and % watermark), `rivals` (dim, not tappable), `home` (camera start); crates may be scoped to a zone (`crateCleared` in `arrowsLogic.js`).
