# PRD — Artillery (Scorched Earth duel)

**One-liner:** turn-based tank artillery on destructible seeded terrain — pick angle and power,
watch the shell arc, carve craters. *Looks* real-time, but every client just deterministically
replays a tiny append-only shot list from RTDB: spectacle without any of the WebRTC stack.

| | |
|---|---|
| `type` | `artillery` |
| Label / badge | `ARTILLERY` / `AR` |
| Category | `reflex` (aim skill), turn-based mechanics |
| Integration | **C** — custom page; plain RTDB, `currentTurn` used |
| Network | RTDB only — deterministic replay model (novel for the platform; documented here carefully) |
| Effort | **L** — physics feel + determinism discipline |
| Priority | P3 |

## Game rules

- Seeded 1D terrain heightmap; tanks spawn at seeded positions in the left/right thirds,
  sitting on the terrain. X is left, always fires first.
- On your turn: set **angle** (0–90°, mirrored per side) and **power** (0–100), fire. The shell
  flies under gravity + **wind** (per-shot, shown before firing), explodes on terrain/tank
  contact: subtracts a crater from the heightmap and deals radial splash damage.
- HP 100 each; direct hit ≈ 35, falling off with distance (constants tunable). **Self-splash
  counts.** Tanks settle down onto lowered terrain after craters (no fall damage v1).
- Win: opponent HP ≤ 0. Both die on the same shot → **draw**. One battle = one standard
  scoreboard round; PLAY AGAIN = new seed.

## The deterministic-replay model (core design)

Authoritative state is just:

```
artillerySeed:  number                          // terrain + spawn + wind derivation
artilleryShots: { pushId: { by, angle, power } }   // append-only
```

Both added to `FIELD_NULLS`. Everything else — terrain, craters, HP, tank y-positions, whose
shell landed where — is **derived on every client by replaying the shot list from the seed**
with the same pure code. Firebase stays tiny, spectators and late joiners reconstruct perfectly,
reloads are free, and there is no possibility of state divergence *if and only if the sim is
bit-deterministic*. Hence:

**Determinism requirements (hard, non-negotiable, enforced by test):**
1. Fixed-timestep integration (`dt = 1/120`), plain `+ − × ÷` on IEEE-754 doubles — these are
   deterministic across engines.
2. **No `Math.sin/cos/pow/exp`** in sim code — the ECMAScript spec does not require correctly-
   rounded transcendentals and engines differ. Use own minimax-polynomial `sin/cos` (or a
   quantized lookup table) in `artilleryLogic.js`. This is the classic cross-browser desync trap;
   flagging it here is half this PRD's value.
3. No `Date.now`/`Math.random` in the sim; all randomness derives from `artillerySeed` via the
   seeded PRNG (terrain, spawns, and `windForShot(seed, shotIndex)`).
4. The *animation* (shell flying ~1–2 s) is just the replay played out over rAF; the *result* is
   computed instantly and identically everywhere. Winner detection: the firing client runs the
   standard winner `runTransaction` when replay shows a death (any client observing agreement is
   fine — the transaction serializes).

`freshGameState('artillery')` → `{ …FIELD_NULLS, board: null, boxes: null, round: null,
currentTurn: 'X', artillerySeed: <random>, artilleryShots: null }`. Turn flips with each shot
write (standard turn machinery, turn indicator and move sounds work; page may override audio).

## Terrain & physics spec

- Heightmap: 256 columns, normalized height 0–1; generation = 3–4 seeded sine layers + seeded
  midpoint displacement, clamped to keep both spawn thirds landable.
- Shell: `v₀ = power·k` at `angle`; per step `vx += wind·dt`, `vy += g·dt`. Collision when shell
  y ≤ terrain height at shell x (column-interpolated) or within tank hitbox.
- Crater: radius ∝ warhead (constant v1), subtract a smooth arc from affected columns
  (floor ≥ 0). Tanks re-settle to `terrainHeight(tankX)` after every explosion.
- Damage: `35 · max(0, 1 − dist/blastRadius)`, rounded; applied to both tanks (self-hits real).
- Wind: `windForShot` in ±0.15 range, displayed as an arrow + magnitude before aiming.

## UI

- `src/components/ArtilleryArena.jsx` — **SVG** (theming rule: no canvas): terrain as a single
  `<path>` filled via `--c-*` structure tint, tanks as pixel sprites in `retro-p1/p2`, shell as
  a glowing dot with a fading dotted trail, crater bite animated by morphing the path, explosion
  as an expanding themed burst.
- Controls (`src/pages/ArtilleryGame.jsx`): angle + power sliders with big ±1 fine-tune buttons
  (the fine-tune buttons ARE the game feel — artillery is about bracketing), keyboard arrows,
  FIRE button. **Your previous shot's trajectory** shown as a faint dotted ghost (bracketing
  aid); no live aim preview (that would delete the skill).
- HUD: HP bars both sides in owner accents, wind indicator, turn banner (standard).
- Mobile: portrait = controls under the arena; sliders sized for thumbs.

## Files

| File | Contents |
|---|---|
| `src/lib/artilleryLogic.js` | seeded PRNG, `detSin/detCos` (own trig), `generateTerrain(seed)`, `windForShot`, `simulateShot(state, shot)` → `{path, impact, craters, damage}`, `replayAll(seed, shots)` → full derived state |
| `src/lib/artilleryLogic.test.js` | see Testing — determinism suite is the point |
| `src/components/ArtilleryArena.jsx` | SVG rendering + replay animation |
| `src/pages/ArtilleryGame.jsx` | controls, turn gating, winner transaction |
| Registration | registry entry (`custom: true`), icon, ladder case, `freshGameState` branch, `FIELD_NULLS` keys |

## Edge cases

- Shell exits side bounds: miss, no crater (top exit: keep simulating — it comes back down).
- Shell lands exactly between columns: interpolated height — covered by determinism (same code
  everywhere), tested at boundaries.
- Tank buried by a crater rim (terrain rises? craters only subtract — can't happen v1).
- Turn spam: standard `currentTurn` gating; duplicate shot writes idempotent by push-key replay
  order.
- Reload/late-join mid-flight: replay reconstructs final state; the in-flight animation is
  skipped for shots older than the latest (only the newest shot animates).

## Testing

- **Determinism suite:** `replayAll(seed, shots)` snapshot-tested against golden fixtures
  (exact float equality, not approximate); `detSin/detCos` accuracy bound (< 1e-9 vs reference)
  and pure-arithmetic implementation asserted; terrain generation golden per seed.
- Behavior: gravity-only shot lands where closed-form says; wind drift direction; crater floors
  at 0; splash falloff; self-damage; both-die draw; tank re-settle.
- Manual: full duel two browsers **verifying identical terrain pixel-for-pixel after 10+ shots
  on two different browser engines** (the determinism acceptance test); spectate a game in
  progress; reload mid-game.

## Stretch

Movement fuel per turn; weapon variety (big/bouncy/cluster); fall damage; 2v2 party mode;
demo-mode AI (closed-form ballistic solver + seeded error).
