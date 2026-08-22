# Real-time arena games — engine implementation review

Scope: Pong, Snake, Tron, Sumo, Space Duel, PAC MAC, Paint, Mine Race — logic files, arenas, controls hooks, pages, demos. Read-only, no build/dev-server/browser used. Correctness bugs (`games-review-arcade-s1/report.md`) and design verdicts (`gd-arcade-s1/report.md`) are referenced once each where they bear on an engine question, not re-reported.

## Ranked findings

| # | Game | Finding | Severity | Effort |
|---|------|---------|----------|--------|
| 1 | Snake | Guest has zero local prediction of its own snake — pure snapshot render on a 120ms-tick, instant-death grid | weak | M |
| 2 | Tron | Same class of gap as #1 — guest renders host snapshots verbatim, no prediction of its own cycle | weak | M |
| 3 | Space Duel | Guest's own fired shots are not locally predicted at all — bullets only appear once the host's next ~33Hz snapshot arrives, against a 0.35s fire cooldown | weak | M |
| 4 | Tron | Host broadcasts full, ever-growing trail arrays every tick (not deltas) at 10Hz — payload is unbounded across a round, up to ~961 cells/side by round end | weak | S |
| 5 | Snake / Tron | Full-grid DOM rebuild every tick via React reconciliation (441 / 961 nodes) instead of the build-once-then-mutate-refs pattern Paint already proved out | weak | M |
| 6 | Pong | Guest's ball dead-reckoning treats spin as constant over the extrapolation window; host's real sim decays spin exponentially (`spin *= exp(-SPIN_DECAY_RATE*dt)`) — guest over-curves the predicted path, worse as snapshot age approaches the 0.2s cap | polish | S |
| 7 | Pong | Guest never predicts the opponent (host) paddle at all — it's rendered as the raw last-snapshot value, so it visibly steps at 30Hz instead of moving smoothly | polish | S |
| 8 | Sumo / Space Duel / Paint / PAC MAC | Guest-side prediction reconciles by hard-resetting to each new snapshot, not blending/smoothing — a misprediction can produce a visible pop every ~33ms instead of a corrected glide | polish | S |
| 9 | Snake | Host loop is `setTimeout` self-reschedule with the reschedule as the *first* line of the callback — real interval drifts by however long the tick's work takes; no fixed-step accumulator/catch-up (contrast every rAF-driven game) | polish | S |
| 10 | * (sounds.js) | `noise()` rebuilds its `AudioBuffer` from scratch (per-sample `Math.random()` fill loop) on every call instead of caching one buffer — real per-play allocation in a hot path, used for crash/hit/die sfx across Tron/Sumo/Space Duel/PAC MAC | polish | S |
| 11 | Mine Race | `syncTimerRef`'s pending debounced Firebase write (≤150ms) is not cleared on unmount — a stale write can fire once after the player has already switched games | polish | S |
| 12 | PAC MAC | Muncher/ghost collision is a post-movement distance check at each 1/120s step, not swept — two actors can structurally pass through each other within one tick; at `HIT_DIST=0.5` tiles vs a max closing speed far below the ~30 tiles/s needed in 1/120s, this is not reachable in practice given current constants | polish | S |

Findings already logged elsewhere and not re-ranked here: Mine Race's unfocusable `<div>` cells (correctness #1) — noted below for its engine-adjacent angle only; Pong/Snake/Space Duel's missing disconnect-claim gate (correctness #2/#15); PAC MAC's host-order tie bias and flat ghost AI (correctness #5/#6, design).

## Detail

### #1/#2 — Snake and Tron: no guest-side prediction
`SnakeGame.jsx:228-244` builds the guest's rendered view directly from the raw snapshot array (`toSnake(body,...)`) every rAF frame — no interpolation or extrapolation. `TronGame.jsx:139-154`'s `guestTick` does the same via `toCycle`. Contrast Sumo (`SumoGame.jsx` `predRef`, seeded from each snapshot at :156-160, then locally re-simulated every guest frame using the same friction/impulse/integrate math as `sumoLogic.js`) and Paint (`advanceGuestOwn()`, `PaintGame.jsx:34-49`, mirroring `paintLogic.step()` including slow-zone lookup) — **this is the copyable fix template**: reseed a local predicted-state ref from each snapshot, then re-run the same per-actor step function client-side every guest frame with real dt, capped extrapolation age (Sumo/Space Duel/Paint/PAC MAC all cap at 0.12–0.15s). For Snake/Tron the "step function" is the tick-advance, not a continuous integrator, so the guest would predict its own next 1-2 discrete moves from its own buffered input rather than dead-reckoning a velocity — a different shape of fix than Sumo's, closer to what a rollback-netcode client does for a discrete grid.

### #3 — Space Duel: guest fire has no local prediction
`useSpaceduelControls.js:26,42-44,63-64` captures `fire` as an edge-triggered local flag and ships it upstream in `res.input` (`SpaceduelGame.jsx:252`), but bullets shown to the guest come only from `snap.b` in the host's next snapshot (`SpaceduelGame.jsx:231-234`) — there is no local bullet spawn. Space Duel *does* predict the guest's own ship (`predRef`, `SpaceduelGame.jsx:81`, reseeded and re-integrated every frame with the same rotate/thrust/friction/bounce math as `spaceduelLogic.js`) — so the ship-movement half of Response is already solved the same way as Sumo/Paint; only the fire path is unsolved. Fix is narrower than #1/#2: spawn a provisional local bullet on fire (respecting the client's last-known cooldown state), render it immediately, then reconcile/cull against the host's next snapshot rather than waiting for it to originate one.

### #4 — Tron: unbounded per-tick payload
`TronGame.jsx:111-112` sends `X: sim.cycles.X.body.map(...)` — the full trail array, not a delta — inside every 10Hz snapshot (`useRealtimeHost.js:188-193`, `driver:'tick'`). Early round this is trivial; by round end a trail can approach half of `GRID²=961` cells per side, so the per-message payload grows monotonically across the whole round while still going out 10×/second. The code comment cited by the reviewing agent asserts "P2P bandwidth is tiny," which is only true in the opening seconds. Cheap fix: send only the newly-appended head cell(s) each tick plus a periodic full-state re-sync (e.g. every N ticks) for the guest to resolve packet loss on the unordered/unreliable channel.

### #5 — Snake/Tron full-grid rebuild vs. Paint's pattern
`SnakeArena.jsx:54-69` and `TronArena.jsx:60-77` both regenerate the entire cell-`<div>` array every tick and hand it to React to reconcile (441 and 961 nodes respectively; Tron's cells also carry `scale-*`/`box-shadow` glow classes, more expensive per-node than Snake's flat background color). `PaintArena.jsx:33-37` builds its 400 cells exactly once, then subsequent updates mutate only the changed cells' `className` imperatively through refs (`:39-61`), bypassing React diffing for the entire hot path — Paint is the reference-quality DOM-rendering implementation in this set, not just its prediction. At Snake's 8.3Hz/441 nodes and Tron's 10Hz/961 nodes this is not yet a proven problem (needs a profiler to confirm jank), but Tron in particular — highest node count, highest per-node paint cost, longest potential rounds — is the one most likely to show it on a low-end device.

### #6/#7 — Pong guest-render gaps
`PongGame.jsx:259` extrapolates the ball's vy as `snap.b[3] + spin*age` — linear in spin, while the host's actual integration decays spin exponentially each tick (`pongLogic.js:203`, `spin *= exp(-SPIN_DECAY_RATE*dt)`). The guest's predicted curve doesn't decay, so it over-curves relative to the host, growing worse as `age` approaches the 0.2s extrapolation cap — a real but likely minor effect given the actual ~33ms snapshot cadence rarely reaches that cap. Separately, `PongGame.jsx:261` renders the opponent's paddle as the raw last-snapshot value with no dead-reckoning at all (`paddleX = snap.p[0]`) — every other predicted quantity in this set (ball, own paddle, Sumo/Space Duel/Paint's opponent actor) gets at least last-known-velocity extrapolation; Pong's opponent paddle is the one exception, and will visibly step at 30Hz rather than glide.

### #8 — Hard-reset reconciliation, cross-cutting
Sumo, Space Duel, Paint, and PAC MAC's guest-side prediction (`predRef`/`predORef`/`predGridRef`, per-game) all reconcile by overwriting the predicted state wholesale on each new snapshot arrival, rather than blending the predicted and authoritative positions over a few frames. If the local prediction and the host's authoritative tick have diverged (packet loss on the unordered/unreliable data channel, a missed input edge), the correction is a discrete jump instead of a smoothed glide. Not confirmed as visually significant without a live test — this is the standard behavior of an "optimistic prediction, no interpolation buffer" client, common in early-stage netcode, and the actual visibility of the pop scales with how often prediction error accumulates in practice.

### #9 — Snake host loop drift
`SnakeGame.jsx:162-163` reschedules `timer = setTimeout(loop, TICK_MS)` as the first statement inside `loop()`, before doing any sim work for that tick — so the real inter-tick interval is `TICK_MS` plus however long that tick's `step`/broadcast/audio work took, with no compensation. Tron uses the shared `useRealtimeHost`'s `'tick'` driver (`useRealtimeHost.js:166-201`), which has the identical pattern and the identical lack of a catch-up accumulator in that driver branch — contrast the `'rAF'` driver branch used by Pong/Sumo/Space Duel/PAC MAC/Paint, which does accumulate real dt against a fixed DT and drain it in a `while` loop. Because Snake/Tron are tick-count-based (see delta-time section below), drift doesn't corrupt game state, only wall-clock pacing — a slow tab makes the round take subjectively longer, it doesn't desync the two clients' shared tick count.

### #10 — `noise()` per-call buffer rebuild
`src/lib/sounds.js` `noise()` (cited at ~L47-69 by the reviewing agent) constructs a fresh `AudioBuffer` and fills it sample-by-sample with `Math.random()` on every invocation, rather than building one noise buffer once and reusing it via a fresh `AudioBufferSourceNode` per play (the standard Web Audio pooling pattern — buffers are reusable, sources are not). This is real allocation + CPU work in a hot path (explosion/crash/miss sfx fire on tab loss, ghost-eat, ship kill, etc. — moderate frequency, not per-frame). `note()`'s oscillator/gain nodes are correctly one-shot per Web Audio's own API contract, not a pooling gap; only the noise buffer is avoidably rebuilt.

### #12 — PAC MAC tile collision, theoretical only
`pacmacLogic.js:434-437` checks squared-distance against `HIT_DIST=0.5` tiles once per fixed 1/120s step, after both actors have moved for that step — not swept along the substep path. At `SPEED≈5.2` tiles/s (`pacmacLogic.js:8`) each actor moves ≈0.043 tiles per 1/120s tick; two actors would need a combined closing speed above roughly 30 tiles/s within one tick to skip across a 0.5-tile hit radius, far beyond what the movement constants allow — flagged for completeness, not a live risk at current constants.

### Mine Race — engine-adjacent note on the correctness finding
The correctness review flagged `MineRaceGame.jsx`'s live cells as unfocusable `<div>`s versus the demo's real `<button>`s (correctness #1). From a pure engine-input-handling angle: using `<div onClick>` instead of `<button>` also forfeits native focus management, default Enter/Space activation, and browser-optimized hit-testing — the fix is not just an ARIA add-on, it's a strictly better base element for a per-cell click target.

## Delta time — explicit answer, all eight

| Game | dt source | Fixed-step accumulator? | Verdict |
|---|---|---|---|
| Pong | `performance.now()` diff, clamped to 0.1s | Yes — `DT=1/120`, `while(acc>=DT)` | Correct, frame-rate independent |
| Snake | N/A — pure tick-count state via `setTimeout(TICK_MS=120)` | No (not needed — no continuous position) | Immune to variable render fps by construction; timer pacing itself can drift under load (#9) |
| Tron | N/A — same as Snake, `TICK_MS=100`, shared `'tick'` driver | No | Same as Snake |
| Sumo | `performance.now()` diff, clamped to 0.1s | Yes — `DT=1/120` | Correct |
| Space Duel | `performance.now()` diff, clamped to 0.1s | Yes — `DT=1/120` | Correct |
| PAC MAC | `performance.now()` diff, clamped to 0.1s | Yes — `DT=1/120` (continuous position despite maze layout) | Correct |
| Paint | `performance.now()` diff, clamped to 0.1s | Yes — `DT=1/120` | Correct |
| Mine Race | No simulation dt at all — event-driven clicks; only real-time element is a 100ms display poll that *recomputes* `Date.now() - startedAt` rather than incrementing | N/A | Structurally immune to drift — worst case is a visible catch-up jump in the displayed timer after backgrounding, never a wrong value |

**No game in this set assumes a fixed frame interval for its physics.** The five continuous-position games (Pong, Sumo, Space Duel, PAC MAC, Paint) all share the same correct pattern: real dt from `performance.now()`, clamped to 0.1s, fed into a fixed `DT=1/120` accumulator. This is genuinely well-built and consistent across five independently-authored game files — worth calling out as a platform-level strength, not luck. Snake and Tron sidestep the question entirely by being tick-count state machines; the risk there is timer-pacing drift (#9), not physics-speed distortion.

## Tick rate and write volume, by game

| Game | P2P snapshot rate | Firebase RTDB writes during live play |
|---|---|---|
| Pong | ~30Hz (`SNAPSHOT_MS=33`) | Score events only + one `runTransaction` at round finish |
| Snake | ~8.3Hz (one snapshot per `TICK_MS=120`) | `eat` events only + round-finish transaction |
| Tron | 10Hz (one snapshot per `TICK_MS=100`), **payload grows unbounded across the round** (#4) | Round-finish transaction only |
| Sumo | ~30Hz (`snapshotMs=33`) | None during play — round-finish transaction only |
| Space Duel | ~30Hz both directions (`snapshotMs=33` down, `INPUT_MS=33` up) | **Per-hit/kill event** (`update()` on every hit, not throttled) + round-finish transaction — heaviest per-play RTDB writer in the set |
| PAC MAC | ~30Hz (`snapshotMs=33`) | Score events throttled ≥800ms |
| Paint | ~30Hz (`snapshotMs=33`) | Score/paint-count events throttled ≥2000ms |
| Mine Race | N/A — no host/guest split, fully symmetric P2P via Firebase | Debounced reveal-count sync, trailing-edge, `SYNC_DEBOUNCE_MS=150` → ≤6.7 writes/sec/client worst case, typically far less |

**Heaviest live-play RTDB writer: Space Duel**, via untamed per-hit-event `update()` calls — every other real-time game either writes zero-to-rare during play or explicitly throttles. Worth a debounce pass matching Paint's/PAC MAC's pattern, though hit events are naturally bursty rather than continuous so the actual rate ceiling is bounded by `FIRE_COOLDOWN=0.35s` per shooter, not unbounded.

**Gameplay itself never touches Firebase for any of the seven host-authoritative games** — RTDB is signaling-only for the WebRTC handshake (offer/answer/ICE) plus sparse event/score writes; the full `~30Hz` state stream rides the P2P data channel, correctly preserving the project's "no backend server" property documented in `CLAUDE.md`. Mine Race is the one game that's genuinely peer-symmetric rather than host-authoritative — no host at all, both clients compute independently from a shared seed and only sync aggregate counts.

## Collision, by game

- **Pong** — discrete per-fixed-tick AABB/offset check (`pongLogic.js:211-231`). At `BALL_MAX_SPEED=1.7`/`DT=1/120`, max travel per tick ≈0.0142 units, vs. a combined paddle+ball collision depth ≈0.035 units — **cannot tunnel** at these constants; structural certainty from the numbers, not simulation-tested.
- **Sumo** — discrete circle-overlap at tick boundaries (`sumoLogic.js:79-100`). Max travel/tick ≈0.0125 vs. blob diameter 0.12 (~10× smaller) — **cannot tunnel** at these constants.
- **Space Duel** — discrete per-tick distance check (`spaceduelLogic.js:143-159`). Bullet travel/tick ≈0.0075 vs. hit radius 0.037 (~5× smaller) — **cannot tunnel** at these constants.
- **Snake / Tron** — exact array/set lookup against integer grid coordinates; movement is direct cell assignment, not integration, so **tunnelling is not a meaningful category here** — a "skip" is impossible by construction, the only discrete-grid risk is a same-tick head-on/reversal edge case (already covered by correctness review's test-gap notes).
- **PAC MAC** — post-movement distance check per 1/120s step (#12) — theoretically not swept, practically unreachable given `SPEED=5.2` tiles/s.
- **Paint** — no player-vs-player collision by design (players can share a cell); the paint-on-exit rule is a same-tick cell-index-change check, not a physical collision.
- **Mine Race** — not applicable; no continuous motion.

All five "cannot tunnel" verdicts above are **structural certainties derived from the shipped constants** (max speed × fixed DT vs. collision-shape dimensions), not simulation-tested — they hold only as long as those constants aren't changed independently of each other (e.g. raising `BALL_MAX_SPEED` without shrinking `DT` would erode Pong's margin).

## Continuous input, by game

- **Pong** — keyboard (arrows/WS) and pointer drag are mutually exclusive with drag taking priority; no buffering, ref-sampled once per tick, standard for a per-frame-sampled continuous axis.
- **Snake/Tron** — single-slot edge-triggered `pendingRef` (not a queue) plus a `heldRef` fallback (PAC MAC only); a second keypress before the next tick overwrites the first, but same-tick reversal-into-self is double-guarded (input capture + `tick()` itself).
- **Sumo** — edge-triggered tap, no directional input at all (auto-lock design, covered in the design review).
- **Space Duel** — turn/thrust are true held-state refs, read continuously every frame; fire is edge-triggered and cooldown-enforced host-side only (client can spam the fire input, host silently drops excess — correct authority placement).
- **PAC MAC** — the strongest input model in the set: buffered `want` direction is stored continuously regardless of tile position and applied only at the next tile-center crossing (`nearCenter` check) — an input arriving between tile centers is **queued, never dropped**, with instant reversal as the sole exception. This is textbook input buffering for a maze game and should be the reference pattern if any other tick-based game (Snake/Tron) is reworked.
- **Paint** — release-based swipe (compute delta on pointer-up, not live re-anchoring), deliberately no reversal guard since Paint has no self-collision.
- **Mine Race** — click/right-click/long-press only, no continuous axis; keyboard entirely unwired (correctness-review finding, engine angle noted above).

## Tab visibility and background behavior

**Zero games register a `visibilitychange` listener anywhere in the repo** (confirmed by direct grep across all reviewed files). This is a real, repo-wide gap, but its consequences differ sharply by loop type:

- **rAF-driven games (Pong, Sumo, Space Duel, PAC MAC, Paint):** the browser itself throttles/suspends `requestAnimationFrame` while hidden. On return, the large real-world gap is caught by each game's own `dt > 0.1 → 0.1` clamp before entering the fixed-step accumulator — so there is no position teleport, but the accumulator then has to drain via up to ~12 consecutive `DT=1/120` sub-steps synchronously in one JS turn (a bounded "spiral of death" burst, not runaway). This is engineered-around by construction, not by an explicit visibility handler — worth noting as a real strength, but the burst itself (a possible frame hitch on resume) has not been measured and would need a profiler/live test to confirm its cost.
- **setTimeout-driven games (Snake, Tron):** browsers throttle background-tab timers to ≥1/sec or suspend them entirely; there's no accumulator to catch up with, so on foreground return the game simply resumes ticking from wherever `Date.now()`-driven scheduling puts it — no burst, but also no compensation for skipped ticks (silently fewer, later ticks; game state itself can't corrupt since it's tick-discrete).
- **Mine Race:** the 100ms display timer recomputes elapsed time from a stored `startedAt` rather than incrementing, so backgrounding causes a harmless visible "jump" to the correct value on return, never drift or a wrong number.

No game is at risk of the classic "paused RAF + running wall clock timer = huge delta jump" failure mode the task asked about by name — every continuous-simulation game's dt clamp neutralizes it, and the two discrete-tick games have no continuous quantity for a jump to corrupt.

## Implementations that are genuinely well built

- **The fixed-`DT=1/120` accumulator pattern**, independently correct across five separately-authored game files (Pong, Sumo, Space Duel, PAC MAC, Paint) with a consistent `dt>0.1→0.1` safety clamp — this is the single strongest piece of shared engineering discipline in the set.
- **Sumo and Paint's guest-side local prediction** (re-running the actual step math client-side, seeded fresh from each snapshot) — the correct pattern, and the one Snake/Tron/Space Duel's fire path should copy.
- **Paint's imperative DOM-mutation rendering** (build 400 cells once, mutate only changed `className`s via refs) — the most scalable rendering approach in the set, bypassing React reconciliation for the hot path entirely.
- **PAC MAC's buffered `want`-direction + tile-center-turn input model** — correct, no-drop input queuing for a maze game.
- **Mine Race's iterative (stack-based, not recursive) flood fill** — no stack-overflow risk at any board size, and its debounced, count-only Firebase sync is a clean anti-leak, low-write-volume design.
- **Space Duel's host-side-only fire-cooldown enforcement** — correct authority placement even though the client can spam the input.
- **Cleanup discipline overall** — every RAF loop, `setTimeout`/`setInterval`, and event listener across all eight games is torn down on unmount/dependency-change, with exactly one exception found (#11, Mine Race's `syncTimerRef`).

## Structural certainties vs. needs-a-profiler

**Structural certainties (derived from reading, no live test needed):**
- All delta-time/accumulator behavior and clamp values (table above).
- All five "cannot tunnel" collision verdicts (max-speed × fixed-DT arithmetic vs. collision-shape dimensions).
- Every prediction mechanism's exact code path (#1, #2, #3, #6, #7, #8).
- Tron's unbounded payload growth (#4) — the array-length-grows-with-round-length fact is structural; its actual bandwidth/CPU cost at round end is not measured.
- All write-rate/throttle numbers in the tick-rate table.
- All cleanup findings, including the one gap (#11).
- The complete absence of `visibilitychange` handling repo-wide (a grep result, not an inference).

**Needs a profiler or live two-network test to confirm:**
- Whether Snake/Tron's full-grid DOM rebuild (#5) or Tron's per-tick trail-array payload (#4) actually causes visible jank/latency in practice, versus being merely inefficient-but-invisible at current board sizes and tick rates.
- Whether the rAF accumulator's catch-up burst after tab backgrounding (visibility section) produces a felt hitch.
- Whether the hard-reset reconciliation pop (#8) is visually significant under real-world packet loss on the unordered/unreliable WebRTC channel, versus rare enough not to matter.
- Real RTT-driven feel of guest-side lag across all games — this requires live two-network testing, out of scope for a read-only review, and was already flagged as unassessable by the prior correctness/design reviews.
- Actual GC pressure from per-tick object-literal allocation inside every `step()`/snapshot-build call at up to 120Hz (sim) / 30Hz (snapshot) — plausible from the code shape, not measured.
