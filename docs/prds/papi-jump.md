# PRD — Papi Jump (retro doodle-jump race)

**One-liner:** both players climb the identical seeded tower simultaneously — highest altitude in 90 seconds (or first to 2,000 m) wins.

| | |
|---|---|
| `type` | `papijump` |
| Label / badge | `PAPI JUMP` / `PJ` |
| Category | `reflex` (it's a speed race) |
| Integration | **C** — custom race page (mine-race/typing precedent) |
| Network | RTDB seeded race — no P2P |
| Effort | **S/M** |
| Priority | P2 |

## Game rules

- Vertical jumper in the Doodle Jump / Papi Jump family, reskinned to the midnight-arcade look: neon platforms on a dark grid with scanlines, pixel blob player (cyan X, pink O), squash-on-land and stretch-on-rise.
- Both players get the **same seeded platform tower** (seeded PRNG, deterministic gap/type sequence). Physics runs **locally per client** at a fixed 60 Hz timestep with dt clamping, so frame rate never affects jump height.
- Controls: `←`/`→` or `A`/`D` to steer, pointer drag on touch. Horizontal wrap-around (exit left, enter right). Landing on a platform bounces automatically; falling below the screen kills the run.
- Platform mix (tunable constants): normal 70%, moving 15%, breakable 10% (one use), spring 5% (super bounce). Difficulty ramps with altitude: gaps widen and moving-platform speed rises every 500 m.
- **Round end (whichever first):** 90-second timer expires, both players dead, or a player reaches 2,000 m. Higher altitude wins; equal altitude is a draw. The end event is serialized by the standard winner `runTransaction`, so a photo-finish resolves to whichever transaction lands first.

## Data model

Top-level race keys (all added to `FIELD_NULLS`):

```
jumpSeed:        string      // written by freshGameState, e.g. "t-9f3a"
jumpStartedAt:   epoch-ms    // both-ready start (mirror TypingGame's countdown flow)
jumpScoreX/O:    number      // altitude in meters — the ghost display
jumpDeadX/O:     bool
jumpDoneX/O:     bool        // dead or reached target / timer done
```

**Anti-leak rule (critical):** only *heights and dead flags* are mirrored. Platform positions and player coordinates must never be written to Firebase — they are derivable from the seed plus inputs and would let an opponent infer the tower. Game state stays entirely client-side, derived from the seed. Spectators see two progress bars, not live boards — accepted for v1 (same caveat as Mine Race).

## UI

- Own tower center-stage (portrait column, `max-w-xs`); opponent ghost = height bar (`score / 2000`) + avatar, plus a death state. Standard last-10-seconds urgency treatment on the timer.
- Rendering: DOM (no canvas) per theming rules — platforms and player are absolutely-positioned divs inside a relative arena, themed via `--c-*` tokens (`retro-p1/p2/cta/win`). Scanline overlay and parallax star backdrop are CSS only, so all 13 themes work for free.
- HUD: pixel score top-left, `YOU vs FOE` ghost bars above the tower, 3-2-1-GO countdown, game-over overlay with height + best.
- Mobile: tower width capped by both container and `100dvh` budget (SnakeArena precedent); drag steering with `touch-none`; keyboard on desktop. Sounds on the existing bus: bounce, spring, crack, fall.
- Custom page uses **`onPlayAgain` (keeps score) for the round-continue button, never `onNewMatch`**. Round winners go through the standard machinery (`runTransaction` sets `winner` and increments `scores`).

## Files

| File | Contents |
|---|---|
| `src/lib/jumpLogic.js` | `generateTower(seed)` → platform list (seeded PRNG, deterministic type/gap ramp), `createState(seed)`, `step(state, input, dt)` (gravity, velocity, platform collision, wrap, death); all pure, no DOM/Firebase |
| `src/lib/jumpLogic.test.js` | see Testing |
| `src/components/JumpArena.jsx` | DOM arena: platforms + player + backdrop + HUD props (`heightX/heightO`, `dead`, `timeLeft`); forwards input ref like SnakeArena |
| `src/hooks/useJumpControls.js` | keyboard + pointer-drag steering (usePongControls precedent) |
| `src/pages/JumpGame.jsx` | ready/countdown → race → end; debounced (~150 ms) height sync; winner transaction; spectator ghost view |
| `src/pages/JumpDemo.jsx` | solo vs reaction-handicapped bot (PongDemo precedent) for physics/feel iteration |
| Registration | registry entry (`custom: true, simultaneous: true, hidePlayerCards: true, matchTarget: 3`), icon, custom-ladder case, `freshGameState` branch, `FIELD_NULLS` keys |

## Edge cases

- Reload mid-round: tower re-derives from seed, but **own altitude progress is client-side and partially lost** → v1 rule: resume from last synced height minus a small penalty (self-punishing, no leak); acceptable. Persisting own run to sessionStorage is a cheap improvement — do it if trivial.
- Opponent quits mid-race: presence banner; finish solo for the win via altitude/target.
- Timer expiry with one player already dead: surviving height wins even if lower than the dead player's peak — documented, shown on the results panel.
- Simultaneous finish (both hit target within one sync window): winner transaction order decides; results panel shows both heights.

## Testing

- Unit: tower determinism per seed; platform mix within tolerance; collision (land, edge miss, wrap); spring multiplier; breakable one-use; death below screen; fixed-step determinism (same input sequence → same height across frame rates).
- Manual: two-browser race on identical seed; drag steering on a real phone; simultaneous-ish finish; reload behavior; spectator view shows bars only.

## Stretch

- Monster/bounce-pad platform types; best-height solo mode on `/demo`; tower-width variants; delayed spectator board view; seasonal tower skins per theme.
