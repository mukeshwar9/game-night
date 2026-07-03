# PRD: Breakout Duel

## Summary

Pong meets Breakout. Each player defends an edge with a paddle; a **shared brick wall**
fills the middle of the court. The ball chews lanes through the wall — every broken brick
opens an attack path toward someone's goal. Score by getting the ball past the opponent's
paddle; first to 5 points wins.

- **The twist:** the arena itself is the strategy. Early game is safe (the wall blocks
  everything); as bricks fall the court evolves into open dueling lanes — and power-up
  bricks can swing a rally instantly.
- Players: 2. Category: reflex. Netcode: **WebRTC P2P, host-authoritative** — a direct
  reuse of the Pong stack (`src/lib/realtime/rtc.js`, host sim + ~30 Hz snapshots + guest
  prediction). Effort: **M**.

## Rules

1. Court is the normalized 1×1 box (Pong convention): X's paddle left, O's right; ball
   bounces off top/bottom walls.
2. Brick wall: 6 columns × 12 rows band in the center (x ∈ [0.38, 0.62]). The ball
   destroys a brick on contact and reflects off the struck face.
3. ~15% of bricks (seeded) are **power bricks**: breaking one grants the *last player to
   touch the ball*: WIDE PADDLE (8 s), FAST BALL (one rally), or MULTIBALL (one extra ball
   until a point is scored). Reuse/extend Pong's existing power-up vocabulary where it
   overlaps.
4. A point scores when the ball exits a player's edge. After each point: serve delay
   (Pong's existing pattern), ball from center, **wall does not reset**.
5. First to 5 points wins the round → standard `winner` transaction. The wall fully
   resets on PLAY AGAIN.

## Architecture & data model

`custom: true` (`gameType: 'breakout'`, `category: 'reflex'`), page
`src/pages/BreakoutGame.jsx` — a structural sibling of `PongGame.jsx`.

- **Pure sim** `src/lib/breakoutLogic.js`: `createState(seed)` (brick layout + power-brick
  placement derived deterministically from seed = gameId hash — both peers and spectators
  agree without transmitting the layout), `step(state, inputs, dt)` fixed-timestep →
  `{ state, events }` (events: brickBreak, powerUp, wallHit, paddleHit, score),
  `computeAI(state, side, difficulty)`, `getWinner(state)`. No DOM, no network.
- **Transport:** identical to Pong — X hosts the one true sim in rAF, guest sends inputs,
  host streams snapshots. Snapshot payload = Pong's `{ ball(s), paddles, score }` **plus
  the brick bitfield**: 72 bricks = 72 bits ≈ 9 bytes packed + a small array of active
  power-brick indices. Cheap enough to include in every snapshot (unreliable channel →
  every snapshot must be self-contained; no deltas).
- **Firebase keys** (`FIELD_NULLS`): `breakoutScoreX`, `breakoutScoreO` (per-point,
  human-speed writes for spectators), `signaling` (transient, host-cleaned). No
  `currentTurn`. Winner via `runTransaction` at 5 points — standard finish machinery.

## UI/UX

- `src/components/BreakoutCourt.jsx` — DOM/CSS like PongCourt (not canvas). Bricks are
  absolutely-positioned divs; colors by row band cycling `p1 → cta → p2 → win` tints;
  power bricks pulse (`pong-ball-pulse`) with a `shadow-glow-dot`.
- Brick death: `miss-flash` + scale-out (~120 ms). At <20% wall remaining, surviving
  bricks dim — signals endgame open court.
- Controls: `useBreakoutControls` = copy of `usePongControls` (↑/↓, W/S, pointer drag).
- Active power-up chips under the score (icon + countdown bar).
- Sounds: `sounds.wall()` on wall/paddle, `sounds.hit(comboStreak)` on brick breaks
  (escalating pitch on same-rally streaks — very arcade), `sounds.bell()` on power-up,
  Pong's existing score/win sounds.

## AI / demo mode

`/demo` → `BreakoutDemo` vs `computeAI` with reaction handicap (Pong pattern): tracks the
ball with capped paddle speed + reaction latency; on MULTIBALL tracks the most threatening
ball only. Difficulty = latency + speed cap tuning. Demo is the physics-tuning environment.

## Edge cases

- **Self-contained snapshots** mean a guest never desyncs on dropped packets — the brick
  bitfield always reflects host truth.
- Multiball + scored point: all extra balls despawn on score (rule 3) — keeps serve logic
  identical to Pong's.
- NAT failure (~5–10%, STUN-only): same "CONNECTION FAILED / RETRY" surface as Pong.
- Spectators: v1 same as Pong — score via Firebase, no live court. (Court spectating is a
  platform-wide follow-up, not per-game.)
- Wall fully destroyed: game degenerates to pure Pong — fine, that's the endgame.

## Testing (vitest)

Deterministic layout from seed; brick collision reflection per struck face (all four);
corner hit resolution; power-brick grant to last toucher; multiball spawn/despawn on
score; step determinism (same inputs → same state hash over 10k steps — the host/guest
contract); bitfield pack/unpack round-trip; `getWinner` at 5.

## Milestones

1. `breakoutLogic.js` sim + tests, tuned via a local-only harness (1.5 days).
2. Court component + controls + demo vs AI (1 day).
3. P2P wiring (host/guest, snapshot bitfield) + two-device testing (1 day).
4. Registry, icon, power-up chips polish (half day).

## Open questions

- Brick HP: single-hit everywhere, or 2-hit rows nearest each goal (slows the early
  game)? Start single-hit; revisit pacing after playtest.
- Should FAST BALL apply to the opponent's return too (chaos) or only until the next
  paddle touch (advantage)? Start: one full rally, both players affected — simpler to read.
