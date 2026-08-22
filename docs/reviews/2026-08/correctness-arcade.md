# Real-Time Arcade Games Review — Pong, Snake, Tron, Sumo, Space Duel, PAC MAC, Paint Turf, Mine Race

Scope: game logic + arenas + pages + demos only. Not the shell (home/nav/discovery — covered elsewhere).

## Ranked findings

| # | Game | Finding | Severity | Effort |
|---|------|---------|----------|--------|
| 1 | Mine Race | Live-game cells are unfocusable/unkeyboardable `div`s with invalid `role="gridcell"` (no `role="grid"` ancestor, no `tabIndex`) — completely unreachable by keyboard, worse than its own demo which uses real `<button>`s | broken | M |
| 2 | Pong / Snake | `!isCustom` gate excludes both from the 120s abandoned-opponent claim-win recovery every other game type has — opponent vanishes mid-round, only escape is FORFEIT which hands them the win | weak | M |
| 3 | Snake | Guest gets zero local prediction of its own snake (unlike Pong) — full round-trip (≤120ms tick + snapshot + RTT) before your own move renders, on a discrete grid where one tick is life-or-death | weak | M |
| 4 | Tron | Guest gets zero local prediction of its own cycle either — same class of bug as Snake, worse because Tron is also fatal-per-cell | weak | M |
| 5 | PAC MAC | Simultaneous pellet/ghost-eat contention always resolves to X (host) — `for (const side of ['X','O'])` fixed iteration order, structural host edge on every tied race | weak | M |
| 6 | PAC MAC | All 4 ghosts use identical "chase nearest muncher" targeting — no distinct personalities, they train behind each other instead of surrounding the player; less tactical depth than real Pac-Man | weak | M |
| 7 | PAC MAC | No persistent touch d-pad — swipe-only steering on a maze that needs frequent quick corner turns; likely missed turns on mobile | weak | M |
| 8 | Mine Race | `MineRaceDemo` isn't a bot demo at all — solo vs personal-best timer, zero opponent/ghost pressure, unlike every other `/demo` in the platform which shows real head-to-head | weak | M |
| 9 | Mine Race | No round timer/forfeit-on-idle — if one player abandons mid-race, the round hangs forever (only an offline banner, no claim path) | weak | M |
| 10 | Sumo | `computeAI`'s doc comment says it retreats toward center near the edge; code always pushes toward opponent's live position — if opponent is further from center, bot drives itself out. Comment/behavior mismatch is a real bot bug in that config | weak | S |
| 11 | Pong | Paddle-catch hitbox checks the whole inset strip, not the paddle's actual thickness — ball that's already sailed past a whiffed paddle can still get "caught" if paddle slides into alignment before x=0 | weak | S |
| 12 | Pong | Every round always serves toward O — host (X) gets opening-rally initiative every round, never alternates | weak | S |
| 13 | Pong | Grow/shrink/slow power-ups differ by background color only, no icon/shape — colorblind players can't tell beneficial from harmful before grabbing | weak | S |
| 14 | Space Duel | Host-authoritative latency asymmetry is more consequential than Pong's: guest shots round-trip before registering, in a twitch duel with 0.35s fire cooldown — persistent aim/reaction edge for host seat | weak | S |
| 15 | Space Duel | No opponent-disconnect win claim (same class as #2, shared infra gap) — round sits on "SIGNAL LOST" forever | weak | M |
| 16 | Mine Race | Redundant `PlayerCard` HUD not suppressed via `hidePlayerCards` (Mine Race renders its own RaceBar/GhostRow already) — wastes vertical space, unlike typing/math which correctly set the flag | polish | S |
| 17 | PAC MAC | Frightened-ghost mode ends abruptly with no flash/warning telegraph before reverting to dangerous | polish | S |
| 18 | PAC MAC | Muncher SVG hardcodes hex colors (`#FFCC00`, `#000`) instead of theme CSS vars — won't re-tint across the 5 themes, violates the project's own no-hardcoded-hex rule | polish/weak | S |
| 19 | Space Duel | ~4s of stacked dead time before first shot possible (2s connect countdown + 2s START_FIRE_DELAY) — ~7% of a 60s cap | weak | S |
| 20 | Space Duel | Countdown display is hardcoded to 0 in both host/guest view builders — the 2s no-fire window shows no visible countdown at all | polish | S |
| 21 | Tron | Head cell renders identical color for both cycles when alive — the single most important cell to track is visually indistinguishable except by trailing color | weak | S |
| 22 | Sumo | No player-controlled aim, push direction always auto-locks to opponent's position — skill reduces to tap-rhythm/positioning only, no aiming depth (design call, flag for a conscious decision) | weak | L |
| 23 | Tron | Dead code: `dir: dir || (body.length > 1 ? null : null)` always evaluates null on both branches — harmless now, misleading later | polish | S |
| 24 | Sumo | `moveAndBounceWalls` square-wall-bounce logic is unreachable dead code — ring-out death radius is always tighter than the square boundary, so it never fires | polish | S |
| 25 | Snake | Hardcoded match target `>= 3`, no configurable best-of-N like Pong's `matchLength` — parity gap | polish | S |
| 26 | Paint | Amber theme's p1/p2 colors (amber vs orange) are too close in hue for fast trail differentiation, worse than default cyan/pink pairing | polish | S |
| 27 | Paint | Possible redundant `PlayerCard` HUD (not confirmed duplicate without a screenshot) | polish | S |
| 28 | Snake / Tron | No round-length cap / sudden-death — two maximally cautious players could stall a round indefinitely (mitigated only by voluntary forfeit) | polish | S |

## Detail

### Mine Race (broken)
`src/pages/MineRaceGame.jsx:319-352` — cells are `<div role="gridcell" onClick=...>`, no `tabIndex`/`onKeyDown`, parent (`:463`) has no `role="grid"`. Invalid ARIA structure, unreachable by keyboard. Contrast `MineRaceDemo.jsx:159-181` which correctly uses `<button>`. Real regression in the actual multiplayer game vs. its own demo.

### Pong / Snake / Space Duel — disconnect gap (#2, #15)
`src/pages/Game.jsx:1417-1418` gates the abandoned-opponent 120s claim-win recovery behind `!isCustom`. Pong, Snake, Space Duel are all `custom: true` and excluded. `PongGame.jsx:175-179`, `SnakeGame.jsx:164-168` hold indefinitely on disconnect; only exit is self-forfeit, which awards the win to the vanished opponent. Worth lifting this gate to cover all custom real-time games, not re-solving it per-game.

### Snake / Tron — guest prediction (#3, #4)
`SnakeGame.jsx:223-257`, `TronGame.jsx:139-154` — guest renders purely off host snapshots, no local dead-reckoning of its own actor. Pong (`PongGame.jsx:238-270`) and Sumo (`SumoGame.jsx:155-183`, `predRef`) both solved this for zero-input-lag; Snake and Tron didn't, and both are tick-discrete/fatal-per-cell games where the lag is more punishing than Pong's continuous paddle.

### PAC MAC — host-order bias (#5)
`pacmacLogic.js:359,431` — `for (const side of ['X','O'])` fixed order on pellet-collect and ghost-eat resolution. X (always host) wins every tied contest. Untested by `pacmacLogic.test.js` (only checks score sum, not which side won a tie).

### PAC MAC — ghost AI (#6)
`pickGhostDir` (`pacmacLogic.js:413-415`) targets `nearestMuncher` for all 4 ghosts uniformly — no ambush/flank/shy variants. Bot BFS pellet-race logic for the muncher itself is solid though.

### Sumo AI bug (#10)
`sumoLogic.js:164-166` doc comment vs `applyInput` (`:51-64`) — impulse always toward opponent's live position, never center-directed. Real behavior bug when opponent is positioned further from center than the bot.

### Pong catch-zone (#11)
`pongLogic.js:211,222` — `x - BALL_R <= X_FACE && x > 0 && vx<0`, no check that the ball hasn't already crossed the face on the prior tick. Widens the real catch window past the paddle's physical thickness.

## Games found genuinely good, nothing to flag
- **Paint Turf** — bot is well-designed (greedy value/cost + late-game BFS steal heuristic), tick/write-volume model matches Pong's precedent correctly, paint-order collision resolution is deliberate and documented, touch swipe-direction controls are correctly modeled, test coverage thorough. Only minor theme-color and possible-HUD-duplication polish items.
- **Tron / Sumo core physics** — trail/wall/head-on collision, ring-out elastic collision with restitution, and simultaneous-double-out draw handling are all correct and well-tested. No stuck/no-legal-move state in either.
- **Mine Race pure logic** (`minesweeperLogic.js`) — flood-fill, chording, seeded determinism, first-open-region generation all correct and thoroughly tested; category placement (`simultaneous: true`, reflex) is genre-consistent with existing typing/math/reaction games, not miscategorized as the brief speculated.
- **Space Duel core sim** — physics/collision/win-condition well-tested for the paths covered; touch controls (persistent hold-buttons) correctly modeled for continuous input, no color-only state cues found.

## Test coverage gaps (by module)
- `pongLogic.test.js` — no regression test for the catch-zone bug (#11); no boundary test on custom `target` param; no same-tick dual-paddle contact test.
- `snakeLogic.test.js` — no test of surviving a move into the *opponent's* vacating tail (only self-tail tested); no test of dying by hitting an eating snake's tail cell (exclusion logic only exercised with a non-eating opponent).
- `tronLogic.test.js` — no test of crashing into a dead opponent's frozen trail; no wrap-around-adjacent collision test; no component tests for Arena/Game/Demo.
- `sumoLogic.test.js` — no test of the retreat-vs-ram AI branch (would've caught #10); no test asserting `moveAndBounceWalls` is actually unreachable (would document #24 as intentional).
- `spaceduelLogic.test.js` — no test of `computeAI`'s actual aim/lead/fire decisions (only return-shape checked); no boundary test at `t == ROUND_CAP_S - ε`; y-axis bullet wrap untested (only x); no exclusive-vs-inclusive hit-radius boundary test.
- `pacmacLogic.test.js` — no scatter/chase phase-cycle test; no ghost tie-break test (would've caught #5); no eaten-ghost-returns-home test; no combo-chain scoring test; no `MATCH_TARGET` series test (lives only in the page, not the pure module).
- `paintLogic.test.js` — thorough, no meaningful gaps found.
- `minesweeperLogic.test.js` — thorough, no meaningful gaps found.

## Could not assess by reading
- Real WebRTC/NAT traversal behavior and actual RTT-driven feel of guest lag across all 6 games — infra shared with Pong (`useRealtimePeer.js`/`useRealtimeHost.js`), structurally sound but needs live two-network testing.
- On-device touch/swipe feel (Tron's 16px re-anchor threshold, Snake's swipe controls, PAC MAC's swipe steering, Paint's swipe-direction model) — geometry read as reasonable but not felt.
- Visual smoothness of Tron's 10Hz update rate on the host's own unmediated screen (no interpolation) — plausible design call, needs eyes-on.
- Cross-theme rendering of Paint's fresh-vs-faded trail contrast across all 5 non-default themes — only default + amber hex values spot-checked.
- Whether Mine Race's `PlayerCard` duplication (#16) is visually significant — layout-only inspection, no screenshot.

## One-line shell note (out of scope, flagging only)
`CLAUDE.md` documents only Pong's real-time model in detail; Snake/Tron/Sumo/Space Duel/PAC MAC/Paint/Mine Race are undocumented there despite being fully built — worth a doc pass so the next agent doesn't have to reverse-engineer 7 sync models from scratch.
