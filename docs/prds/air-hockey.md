# PRD — Air Hockey

**One-liner:** a portrait-orientation, mobile-first real-time table duel — the pong stack
(host-authoritative sim + WebRTC data channel) with 2D mallets, momentum transfer, and goals.

| | |
|---|---|
| `type` | `airhockey` |
| Label / badge | `AIR HOCKEY` / `AH` |
| Category | `reflex` (2 players + spectators-by-score) |
| Integration | **E** — custom realtime page (`custom: true, realtime: true`) |
| Network | WebRTC data channel via `src/lib/realtime/rtc.js`; Firebase for room/signaling/score |
| Effort | **M** — transport and sync are solved; physics feel is the work |
| Priority | P3 |

## Why / positioning

Pong is horizontal-paddle 1D; sumo is 2D shoving without goals. Air hockey is the missing
middle: 2D positioning + aiming + goals, and uniquely suited to phones because the court is
**portrait** and the primary control is **drag-your-mallet** — the most natural touch input of
any realtime game on the platform.

## Game rules

- Court: normalized portrait rectangle (width 1 × height 1.5), walls elastic, **goal mouths
  centered on the short ends** (~35% of width). X defends the **bottom** goal, O the top.
- Each player's mallet (circle, r≈0.06) is confined to their own half. Puck (circle, r≈0.035)
  has slight friction (long, natural glides), elastic wall bounces, max-speed clamp.
- Mallet–puck collision transfers mallet velocity (tracked from recent input positions) with
  restitution — a stationary block is possible; a flick shot is fast.
- **Score 7 to win the game** (`WIN_SCORE = 7`). After each goal: 1 s serve delay (pong
  precedent), puck serves toward the player who conceded.
- One game = one round on the standard scoreboard (winner transaction increments `scores`).

## Architecture — mirror pong exactly

| Concern | Approach (all precedented in pong) |
|---|---|
| Pure sim | `src/lib/airhockeyLogic.js`: `createState()`, `step(state, inputs, dt)` (fixed timestep, returns `{state, events}`), `computeAI(state, difficulty)`, `getWinner(state)`. No DOM, no network. |
| Transport | `rtc.js` unchanged — X hosts/offers, O answers, signaling under `games/$id/signaling`, STUN-only with the existing CONNECTION FAILED + RETRY surface. |
| Sync | Host (X) runs the true sim at rAF, applies own + guest inputs, streams ~30 Hz snapshots `{puck, mallets, score}`. Guest predicts own mallet locally (zero input lag) and dead-reckons puck/host-mallet from snapshot velocity. |
| Firebase | `airhockeyScoreX/O` written per goal (human-speed, spectators see score); winner via `runTransaction` at 7. `currentTurn: null`. |
| Events → audio | `step` emits `'hit' | 'wall' | 'goal'`; the page drives audio (custom-page convention). |

**Guest-view rotation:** O sees the court rotated 180° so their goal is always at the bottom
(pong mirrors left/right the same way). Rotation is render-only; sim coordinates are canonical.

**Inputs over the channel:** guest sends mallet target position (normalized) at input rate;
host clamps to O's half and derives mallet velocity from position history — velocity is *derived
by the sim*, never trusted from the client.

## Data model

New top-level keys (added to `FIELD_NULLS`): `airhockeyScoreX`, `airhockeyScoreO`
(`signaling` is already nulled there). `freshGameState('airhockey')` →
`{ …FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
airhockeyScoreX: 0, airhockeyScoreO: 0 }`.

## Physics spec (the actual work)

- Fixed timestep `dt = 1/120`, accumulator loop (pong pattern).
- Friction: `v *= (1 - μ·dt)`, μ ≈ 0.25 — puck should cross the court ~3× before stalling.
- Collision: circle–circle, positional correction + impulse along the normal; mallet treated as
  infinite mass (it's position-driven). Restitution ≈ 0.92 puck–wall, ≈ 1.0 puck–mallet, plus
  `k·malletVelocity` injection (k ≈ 0.6, the "flick" feel — the number one tuning knob).
- Max puck speed clamp (≈ 2.2 court-heights/s) so dead-reckoning between snapshots stays sane.
- Goal detection: puck fully past the goal line within mouth x-range; else back-wall bounce.
- Tunnel-proofing: substep when `|v|·dt > puckRadius` (a flicked puck must not skip the goal
  line or a mallet).

## UI

- `src/components/AirHockeyTable.jsx` — DOM/CSS like PongCourt (no canvas): themed table
  (`--c-*` center line/circle, glowing goal mouths in each player's accent), puck with a short
  CSS trail, mallets in `retro-p1`/`retro-p2` with `shadow-neon-*`.
- `src/hooks/useAirHockeyControls.js`: pointer drag (primary — mallet chases finger with a
  small smoothing constant), WASD/arrows fallback at fixed speed. `touch-action: none`.
- Score pips top corners; serve countdown center; goal flash + existing win-effect at 7.

## Local play

`AirHockeyDemo` on `/demo` vs `computeAI` (reaction-delay handicap, three difficulties) — the
physics-tuning environment, exactly like PongDemo. Build it *first*; multiplayer is a transport
swap.

## Edge cases

- Same caveats as pong, inherited wholesale: ~5–10% symmetric-NAT connection failures (RETRY
  surface), host tab-close kills the sim (guest sees the standard disconnect/reclaim flow),
  spectators get score only (no frame stream).
- Puck pinned in a corner by a mallet: friction + positional correction frees it; add a
  stuck-detector (puck speed ≈ 0 while overlapping mallet for > 1.5 s → nudge toward center).
- Snapshot loss bursts (unreliable channel): dead reckoning covers ≤ ~200 ms; beyond that the
  puck snaps — accepted (pong behavior).

## Testing

- Unit (`airhockeyLogic.test.js`, pongLogic-suite pattern): step determinism; wall bounces;
  goal in/out of mouth range; mallet half-court clamp; velocity-transfer direction; max-speed
  clamp; tunnel-proofing at max speed; `getWinner` at 7.
- Manual: demo-mode feel pass on a real phone **before** any networking; then true two-device,
  two-network P2P (same-NAT second profile doesn't exercise traversal — pong note applies).

## Stretch

Power-ups ported from pong's system (multi-puck, wide mallet); best-of-N via `matchLength`
reuse; spectator frame relay through the host (post-TURN-decision only).
