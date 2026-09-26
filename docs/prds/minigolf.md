# PRD — Minigolf

**One-liner:** turn-based top-down mini golf for 1–4 players. You pull back anywhere on the course to putt, bank off walls, and dodge windmills and water. Fewest strokes wins. Online rooms store only each stroke's integer inputs, and every client replays them through a deterministic sim (the Artillery model), so no WebRTC is needed.

| | |
|---|---|
| `type` | `minigolf` |
| Label / badge | `MINIGOLF` / `MG` |
| Category | `reflex` (aim skill), turn-based |
| Integration | custom page, uid-keyed nPlayer room (2–4), plus a registry `LocalPage` for offline play |
| Network | RTDB only: deterministic replay of `golfShots` |
| Modes | solo PAR RUN, solo VS BOT (easy/med/hard), pass & play 2–4 on one phone, online 2–4 + spectators |
| Design review | Lavish board `http://100.97.248.126:4387/session/082ed355f9d2a9d8`, approved by the captain ("Looks good. Implement it."). All recommended options D1–D9 were accepted. |
| Status | **In progress** on branch `fm/games-minigolf-design-s1`. See [Implementation status](#implementation-status). |

Reference: the ask cites Minigolf in Moreno Maio's iOS app *2 Player Games: Offline Games*. That app was not inspected. The design follows genre norms and Game Night conventions.

## Decisions (accepted recommendations)

| # | Question | Decision |
|---|---|---|
| D1 | Turn order | **Finish the hole.** Each player plays the hole out before the next tees off. Hole 1 uses seat order. Later holes use honours: best score on the previous hole goes first, and ties keep the previous order. |
| D2 | Stroke cap | **6 strokes.** A ball not holed by then is picked up and scores **7**. |
| D3 | Online room model | **One nPlayer type for 2–4**, like Chain Reaction 4P: lobby, then host START. |
| D4 | Aim assist | **Dotted line to the first wall.** There is no full trajectory preview. |
| D5 | Match length | **FRONT 9** (par 26) by default. **QUICK 3** (holes 1, 5 and 9, par 8) is an option. |
| D6 | Solo at launch | **PAR RUN + VS BOT.** |
| D7 | Renderer | **SVG** themed through `--c-*` tokens, matching Artillery and Pac Mac. |
| D8 | Ties | **Shared place.** Online a tie is recorded as `winner: 'draw'`. |
| D9 | Leaderboard | **Unranked in v1.** Server-side replay credit is a possible follow-up. |

## Rules

- **Goal:** the lowest total strokes over the course wins.
- **Water:** costs +1 stroke, and the ball returns to where that shot started.
- **Escape:** a ball that somehow leaves every wall is reset for free. This is a sim edge case and 0 escapes were seen in a 5,000-shot stress test.
- **Balls don't collide:** each player finishes the hole before the next plays.
- **Score names** shown when the ball drops: HOLE IN ONE, EAGLE, BIRDIE, PAR, BOGEY, +n, PICKED UP.
- **Solo stars per hole:** ★★★ hole in one, ★★ under par, ★ par.

## Controls

- Touch down **anywhere** on the course and pull back. The shot goes the opposite way.
  - Power is drag length ÷ 137 world units (38% of course width).
  - This solves thumb reach: a ball at the top of the screen is aimed from the bottom.
- Cancel by any of:
  - dragging back inside the 12 px dead zone;
  - putting down a second finger;
  - releasing under 4% power.

  A cancelled shot is never a wasted stroke.
- Keyboard: ←/→ aim, ↑/↓ power, Space or Enter putts. Space/Enter on a focused button presses the button, not the putt.
- `touch-action: none` applies on the course only.

## Physics (fixed step 1/120 s)

| Param | Value |
|---|---|
| Max launch speed | 620 u/s |
| Friction | −55 u/s² linear plus 0.9/s drag |
| Sand | ×5 friction, ×3 drag |
| Wall / blade / slider restitution | 0.72 / 0.6 / 0.8. Movers reflect in their own moving frame. |
| Bumper | elastic plus a 120 u/s kick, capped at 700 u/s |
| Slope | constant acceleration per zone (the ramp is 240 u/s²) |
| Cup | captures when d < 7 u and speed < 330 u/s. Faster balls lip out: rotated 0.5 rad, 85% speed. Near the cup, slow balls feel a gentle 420 u/s² pull. |
| Stop | speed < 4 u/s off-slope, with a 12 s hard cap per stroke |
| Ball / cup radius | 6 / 10 u. The course is 360×600 u, portrait. |

Collision order within each step: movers first, then bumpers, then static walls **last**, so a slider can never squeeze the ball through a wall. The first stress test found exactly that bug, and it was fixed by this ordering.

## Holes (front nine, par 26)

| # | Hole | Par | Idea |
|---|---|---|---|
| 1 | STRAIGHT SHOT | 2 | Learn the pull |
| 2 | DOGLEG | 3 | Bank off the 45° corner |
| 3 | BUMPER ALLEY | 3 | Pinball bumpers |
| 4 | THE RAMP | 3 | Uphill slope; too soft rolls back |
| 5 | WINDMILL | 3 | Time the blades through the gap |
| 6 | SAND TRAP | 3 | Thread the lane |
| 7 | MOAT | 3 | Bridge or splash (+1) |
| 8 | SLIDERS | 3 | Two moving blocks |
| 9 | PORTALS | 3 | Warp to the upper chamber, speed kept |

MOAT was first drafted as par 4 with a 40-unit bridge. The HARD bot sank it in 1–2 strokes and EASY never did, so it became par 3 with a 60-unit bridge.

Back-nine ideas for later: ice rink, one-way gate, castle gate, split cup, bridge with rails, flippers, seesaw slope, mirror, combo finale.

## Determinism contract

The rules are the same as Artillery's (`docs/prds/artillery.md`):

- A fixed timestep and only + − × ÷ on doubles. `Math.sqrt` is allowed because it is IEEE correctly rounded.
- No `Math.sin/cos/atan2/hypot/pow`. Blade and slider motion uses `detSin/detCos`.
- Stroke inputs are integers:
  - `a` = angle in 1/65536 turns;
  - `p` = power per-mille, 1–1000;
  - `k` = the obstacle-clock tick (1/120 s) at release.
- The shooter simulates the quantized shot too, never its raw float aim.
- Moving obstacles animate on each client's local clock while aiming. The stroke records `k`, so every replay starts from exactly what the shooter saw.
- Tests enforce this: the sim source contains no transcendentals, and identical inputs give bit-identical rest points and paths.

## Online room data (`games/{id}`)

```
gameType:   'minigolf'                   // nPlayer, players keyed by uid
status:     'waiting' | 'playing' | 'finished'
golfOrder:  [uid, …]                     // seats at START (join order, online, max 4)  — FIELD_NULLS
golfShots:  { s0000: { by, h, a, p, k }, s0001: … }   // append-only, sorted by key  — FIELD_NULLS
golfSkip:   { [h]: { [uid]: 'timeout' | 'away' } }   // coordinator pick-ups  — FIELD_NULLS
golfAway:   { [uid]: true }              // picked up while offline; cleared by that player on return  — FIELD_NULLS
golfCourse: 'front9' | 'quick3'          // lobby house rule, survives NEW MATCH (kept out of FIELD_NULLS)
golfClock:  20 | 30 | 0                  // shot clock seconds, 0 = off; house rule
winner:     uid | 'draw'                 // set by the stroke/skip that completes the course
scores/{uid}: number                     // match tally, +1 per course won
```

- **No stored turn pointer.** `replayCourse({ course, order, shots, skips })` derives the turn, ball, strokes and every score. Players, spectators, reloads and late joiners all rebuild identical state.
- **Writing a stroke:** a whole-room `runTransaction` re-runs the replay on the server copy. It appends only if it is still the writer's turn, and the stroke that completes the course also sets `status: 'finished'`, `winner` and `scores` in the same write.
- **Out-of-turn strokes:** `replayCourse` ignores any stroke whose `by`/`h` doesn't match the expected turn, so a stale or malicious write can't change the result.
- **Idle and offline turns:** every seated client times the current turn locally. It uses durations only, so clock skew can't matter. The online-aware coordinator (`coordinator.js`) writes the pick-up:
  - the shot clock (20/30 s) runs out for an online player;
  - a player has been offline for 60 s → reason `away`, and `golfAway` is set;
  - an away player's later turns are picked up after 1.5 s until they come back.

## Files

| File | Contents |
|---|---|
| `src/lib/detMath.js` (+test) | `mulberry32`, `detSin`, `detCos`, `TWO_PI`, moved out of `artilleryLogic.js`, which re-exports them |
| `src/lib/minigolfCourses.js` (+test) | the 9 holes, `COURSES`, `getCourse`, `coursePar` |
| `src/lib/minigolfPhysics.js` (+test) | `quantizeShot`, `shotVelocity`, `simulateShot`, `moverGeometry`, `aimRayLength` |
| `src/lib/minigolfLogic.js` (+test) | `replayCourse`, `honoursOrder`, `standings`, `matchWinner`, `scoreName`, `holeStars`, `vsPar`; memoized sims |
| `src/lib/minigolfBot.js` (+test) | BFS distance field (routes around walls, avoids water, follows portals); `botSearch` generator (time-sliced), `botShot` |
| `src/lib/minigolfRoom.js` (+test) | `normalizeGolfOrder`, `normalizeGolfShots`, `shotKey`, `skipCount` |
| `src/lib/minigolfUi.js` | seat glyphs ● ▲ ■ ◆ and `--c-p1…p4` colours; players are never identified by colour alone |
| `src/lib/soloBest.js` | `readSoloLow` / `recordSoloLow` (lowest-is-best personal bests) |
| `src/lib/sounds.js` | `putt`, `boing`, `splash`, `warp`, `rattle`, `cup` |
| `src/components/MinigolfCourse.jsx` | SVG hole render: movers, aim line, trail, sink burst; landscape rotates the world group −90° |
| `src/components/MinigolfPlay.jsx` | shared play surface: HUD, stroke playback at 120 steps/s (tap to fast-forward), banners, between-holes scorecard, chips, `renderDone` |
| `src/components/MinigolfScorecard.jsx` | scorecard: under par circled, over par boxed, P = picked up |
| `src/hooks/useGolfAim.js` | pointer pull-back, dead zone, second-finger cancel, keyboard |
| `src/pages/MinigolfLocal.jsx` | `/solo/minigolf` (PAR RUN, VS BOT) and `/local/minigolf` (2–4 pass & play with HOLD TO START handoff), results |
| `src/pages/MinigolfGame.jsx` | online nPlayer page: lobby, course and clock picks, stroke transaction, shot clock and away pick-ups, results, play again |
| `src/lib/games.js` | registry entry (`nPlayer 2–4`, `custom`, `solo`, `Page`, `LocalPage`, `startRound`), `FIELD_NULLS`, `supportsLocalPlay` honours `LocalPage` |
| `src/pages/Demo.jsx` | DEMOS entry for solo, and `LocalPlayPage` renders a registry `LocalPage` when present |
| `src/components/GameIcons.jsx`, `src/lib/rules.js`, `src/index.css` | icon, HOW TO PLAY, burst/portal/wave animations (reduced motion hides the burst) |

## Findings from design and build

1. **Bundle:** `npm run build && node scripts/check-bundle-size.mjs` on origin/main `2c8f0bc` gave an entry of **254.3 KB gzip against a 320 KB budget**. Artillery's lazy chunks total about 6.3 KB gzip. Minigolf is lazy, estimated at 12–16 KB gzip; the entry grows only by the registry row and icon.
2. **Haptics are disabled platform-wide.** `sounds.js`'s `vibrate()` is a no-op ("Haptics disabled — keep audio, kill vibration"). Minigolf goes through `sounds`, so it respects that. iOS Safari has no Vibration API anyway.
3. **The immersive Fill toggle is not on origin/main.** It exists only as patch `424d837` for the captain's Dev checkout. The course sizes itself (aspect ratio plus `100dvh` max height), so it works with or without Fill.
4. **`supportsLocalPlay()` excluded every `custom` game.** A registry `LocalPage` now opts a game in, and `games.test.js` was updated to 34 local types.
5. **React Compiler lint rules** (`eslint-plugin-react-hooks` 7) forbid refs and impure calls during render and setState in effect bodies. Playback is therefore state-driven (adjust-state-on-props for new strokes, with rAF callbacks doing the side effects), and the turn clock uses `useServerClock` ticks.
6. **Finish-flash race:** a parent that decides "finished → results" on its own unmounts the play surface before the final stroke animates. Results are therefore rendered *by* `MinigolfPlay` through `renderDone`, once its own playback, banner and card are idle.
7. **Bot cost:** about 0.6–1.1 s per stroke on a laptop at full search, so `botSearch` is a generator the page pumps in 12 ms slices. Angle samples: easy 36, med 60, hard 96.
8. **Sim bug caught by a stress test:** with static walls resolved before movers, a slider could squeeze the ball through a wall. Walls now resolve last, and 5,000 random shots gave 0 escapes.
9. **`chrome-devtools-axi` was unusable in this session** (`pageId: Invalid input: expected number, received undefined`). Browser checks of the design page used the repo's Playwright instead.

## Deviations from the design (so far)

- There is no "vote to skip now" on disconnect; only the timed pick-ups exist.
- There is no fine-aim slow phase.
- In landscape the course rotates, but the HUD stays on top instead of moving to side rails.
- There is no LiveAnnouncer line per stroke; a polite `role="status"` region announces banners.
- There is no aim ghost for spectators, and no daily course (both were planned as phase 5 extras).

## Implementation status

Branch `fm/games-minigolf-design-s1`, based on origin/main `2c8f0bc`.

- **Committed (`77a4f06`):** detMath extraction plus the minigolf sim, courses, match replay, bot and their tests. All of these tests pass, and the hard bot solves every hole within par + 2.
- **Written, not committed:** the room normalizers (tests pass), UI constants, sounds, `soloBest` helpers, course/play/scorecard components, aim hook, local and online pages, registry, Demo and rules wiring, and CSS. Lint is clean on the new files and `npm run typecheck` passes.
- **Open:**
  1. The last full `npm test` run reported **5 failing tests in 7 files**. They were not yet triaged, so it is unknown whether any come from this change.
  2. `npm run build` and the bundle check have not been run on the branch.
  3. The app has not been run in a browser against the emulators.
  4. **`database.rules.json` has no `golf*` validation yet.** Planned: `golfShots/$s` key `^s\d{4}$`, new entries `by == auth.uid` with `h`, `a`, `p`, `k` in range and existing entries unchanged (whole-room transactions re-validate them), `golfSkip`, `golfAway`, `golfOrder`, and `golfCourse`/`golfClock` enums. A matching `tests/rules/minigolf.test.js` is also needed.
  5. **No e2e spec yet.** Planned: 2 players plus 1 spectator play hole 1, reload mid-hole, and all see identical scorecards.
  6. Commit, rebase onto `main`, and report the branch ready.

## Testing

- **Unit:** determinism (identical inputs give identical bits, and the sources contain no transcendentals), water, ramp rollback, sand, portals, lip-out, mover timing, the escape stress test, the aim ray, and the replay rules: turn order, honours, cap and pick-up, water, skips, out-of-turn strokes, finish, standings and ties. There is also bot solvability and the room normalizers.
- **Manual acceptance still to do:**
  - two devices play a full course and see identical balls after every stroke on two engines (Chromium and WebKit);
  - a spectator joins mid-hole;
  - a reload mid-roll;
  - a player drops and is picked up, then returns;
  - pass & play with 4 players;
  - VS BOT at all levels on a phone.
