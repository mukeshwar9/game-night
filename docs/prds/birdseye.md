# PRD — BIRDSEYE (sling the flock, ride the shot)

**One-liner:** sling a flock of farm birds at a wooden fort and pop every scarecrow, watching
the shot from behind the bird (CHASE), from its eyes (BEAK) or side-on (SIDE). The physics is
a small deterministic 2D sim; the "3D" is a camera trick on top. Online it is a two-player duel
that, like Artillery, replays an append-only shot list from RTDB.

| | |
|---|---|
| `type` | `birdseye` |
| Label / badge | `BIRDSEYE` / `BE` |
| Category | `reflex` (aim skill), turn-based online |
| Integration | **C** — custom page (`custom: true`), `solo: true`; no `focus`, no `startRound` |
| Network | RTDB only — deterministic replay (Artillery's model); no WebRTC |
| Solo route | `/solo/birdseye` via `src/pages/Demo.jsx` → `BirdseyeSolo.jsx` |
| Online page | `src/pages/BirdseyeGame.jsx` (2 seats, `X` throws first) |
| Added | 2026-10-06 |

## Approved design decisions

- **D1 — Cameras.** CHASE (over-the-bird, from behind) is the default. A one-tap **BEAK**
  first-person toggle can be switched at any time, including mid-flight. **SIDE** is the
  comfort view: it is the default whenever `prefers-reduced-motion` (or the in-app reduced
  motion setting) is on, and it keeps the classic 2D read. Impacts get a **slow-mo CRASH cam**
  (cut from CHASE; the comfort settings can switch the cut off).
- **D1a — Side picture-in-picture.** While CHASE or BEAK is the main camera, a small fixed side-on
  window (top right, under the camera switch) shows the whole sling-to-fort lane, the aim arc while
  pulling and the flown trail, to judge the trajectory. It is hidden on SIDE, while PEEK is held and
  once the shot settles. Framing lives in `src/lib/birdseyeCamera.js` (`pipCamGoal`, `pipVisible`).
- **D2 — Aiming.** A 3/4 over-the-shoulder aim view that sits nearly in the flight lane, so the sling and
  the pulled-back bird stay near the middle of the canvas (`AIM_CAM`, tested on portrait and landscape shapes). Drag anywhere with **drag-opposite**
  mapping (pull back, the bird flies the other way; a longer pull is a harder throw; releasing
  near the start is a cancel, `MIN_POWER` 0.12). Hold **PEEK** while aiming to see the fort side-on.
- **D3 — Renderer.** Canvas 2D faux-3D (projected, depth-sorted, half-resolution canvas, no
  WebGL; colours from the `--c-*` tokens, birds as pixel art). three.js is only a fallback if
  this cannot hold frame rate on target phones.
  Lighting is warm sun / cool shade per face, cast shadows are one projected layer, far geometry fades into a
  horizon haze, boards get per-material detail (planks, mortar, glare, straw, cracks), and a frame-time
  governor switches texture, tufts and the vignette off on slow devices.
- **D4 — Simulation and net model.** One 2D deterministic planck sim
  (`src/lib/vendor/planck-det.js`, deterministic trig from `detMath.js`, 1/60 s fixed step,
  fixed solver iterations) in the x/y plane, viewed through the 3D cameras. Shots are integers.
  Online, the room stores only a fort index and a shot list; every client replays it.
- **D5 — Scope shipped now.** Solo: the **five World 1 forts**; online: a **2P duel on one fort**.
- **D6 — Duel replay.** The thrower flies live and writes the shot when it settles; the rival
  then **watches the same shot replayed** from their own camera. A reload does not replay old shots.
- **D7 — Slow-mo only when it matters.** The CRASH cam and slow-mo fire when the bird closes on
  the fort (about 2 m, heading at it), never on a clean miss.
- **D8 — Identity.** Name BIRDSEYE, a farm world (FENWICK FARM), an original cast (sparrow PIP,
  kingfisher DART, quail chicks TRIO, scarecrows). No Angry Birds IP: no pigs, no copied
  character shapes, names, sounds or level layouts.

### Deferred (not in this build)

FORT WARS (rival forts, both sides build and fire), DAILY FORT (seeded daily puzzle and
leaderboard), the rest of the flock beyond what exists (HONK, BRUNO), worlds 2–4. TRIO is
implemented in the sim and shot format but no World 1 fort uses it yet.

## Rules

- **Birds** (`BIRDS` in `birdseyeCore.js`): PIP (sparrow) taps to **FLAP** for a second arc;
  DART (kingfisher) taps to **DIVE** straight through wood and glass; TRIO (quail chicks) taps
  to **SPLIT**. The tap tick is stored as `k` in the shot (`-1` = no ability used).
- **Materials:** wood, stone, glass, hay (hay is a soft, indestructible cushion, 0 points).
  Breaking wood scores 50, stone 80, glass 120.
- **Scarecrows** pop (1000 each) when hit hard, tipped past about 60°, or dropped 0.9 m.
- **Solo:** each fort gives 3 birds in its fixed order. Clearing a fort (every scarecrow popped)
  adds **1500 per unused bird**; stars: ★ any clear, ★★/★★★ at the fort's two score thresholds.
  Fort *n* opens once fort *n−1* is cleared (1-1 always open). Progress (stars and best score)
  is per device (`birdseyeProgress.js`).
- **Duel:** both seats throw at the same fort, alternating, **3 birds each** (`DUEL_SHOTS_EACH`);
  X throws first. More scarecrows popped wins; points break a tie; otherwise draw. PLAY AGAIN
  walks to the next fort (`nextFortIndex`).
- **Solo result panels:** a cleared fort shows only the score card, REPLAY LEVEL and NEXT FORT (FORTS after
  the last one); a failed fort keeps replay-the-shot, FORTS and RETRY.

### World 1 — FENWICK FARM

| Fort | Name | Wind | Flock | ★★ / ★★★ |
|---|---|---|---|---|
| 1-1 | FIRST FLIGHT | 0 | PIP PIP PIP | 2500 / 4000 |
| 1-2 | HAY DAY | 0 | PIP PIP PIP | 3400 / 4900 |
| 1-3 | GLASSHOUSE | 0 | PIP DART PIP | 3500 / 5000 |
| 1-4 | FENWICK FARM | −0.6 | PIP DART PIP | 4800 / 6500 |
| 1-5 | THE BARN | −0.8 | PIP DART DART | 4500 / 6000 |

(Source of truth: `FORTS` in `src/lib/birdseyeCore.js`; star thresholds come from headless
shot sweeps checked in `birdseyeLogic.test.js`.)

## Data model

```
bsFort:  int 0..4                                   // fort index (FORTS.length - 1)
bsShots: { pushId: { by: 'X'|'O', b: 'pip'|'dart'|'trio', a: int, p: int, k: int } }  // append-only
```

- `a` angle in 1/4096 turns (−110..912, from `ANGLE_MIN`/`ANGLE_MAX`), `p` power per-mille
  (0..1000), `k` ability tick (−1..540, `MAX_SHOT_TICKS`).
- Both keys are per-match: in `FIELD_NULLS`; `freshGameState('birdseye')` (`games.js`) sets
  `bsFort` (via `freshDuel`) and nulls `bsShots`.
- Each shot rebuilds the world from the previous shot's quantised snapshot, so replay is exact
  on every client regardless of warm-start state. Shots are normalised on read
  (`normalizeShot`, `duelShots`); invalid records are dropped.
- The firing client writes the shot **and** flips `currentTurn` in one `runTransaction` on
  `games/{id}`; whichever client sees the replay finish runs the winner transaction.

## Security rules (`database.rules.json`, `tests/rules/birdseye.test.js`)

- `bsFort`: integer 0..4. `bsShots` only on `gameType === 'birdseye'` rooms.
- `bsShots/$shot`: all of `by,b,a,p,k`, each integer in the ranges above; a **new** shot must
  have `by` equal to the room's previous `currentTurn` and belong to the writing uid's seat;
  an existing shot may be rewritten only unchanged (so whole-room transactions re-validate
  cleanly). Deleting the keys (switch / NEW MATCH) is allowed.

## Files

| File | Contents |
|---|---|
| `src/lib/birdseyeCore.js` | planck-free data: flock, materials, forts, shot quantisation, scoring and stars, progress, duel turn rules (entry-bundle safe) |
| `src/lib/birdseyeLogic.js` | deterministic sim, `replayDuel`; pulls in the vendored planck |
| `src/components/birdseye/` | canvas renderer, camera logic, pixel art, arena HUD (CHASE/BEAK/SIDE, PEEK, ability button) |
| `src/pages/BirdseyeSolo.jsx`, `BirdseyeGame.jsx` | solo forts; online duel |
| Registration | `games.js` entry, `FIELD_NULLS` + `freshGameState`, `rules.js`, `rulesNumbers.test.js`, sounds, `Demo.jsx`, catalogue pixel art (`scripts/pixel-art/games/reflex.mjs`, `GameArt.jsx`) |

## Testing

- Vitest: determinism and replay (`birdseyeLogic.test.js`), shot quantisation, scoring, stars,
  progress and duel rules (`birdseyeCore.test.js`), HOW TO PLAY numbers (`rulesNumbers.test.js`).
- Rules: `tests/rules/birdseye.test.js` (turn ownership, ranges, immutability, transaction shape).
- E2E: `tests/e2e/birdseye.spec.js` (two browser contexts, one per player).
- Not yet done: rule-media stills (the manifest lists BIRDSEYE as skipped), real two-device
  playtest of CHASE/BEAK comfort on phones.

## Known gaps

- **Reload to rethrow.** A duel shot is written only once it settles, because the ability tap
  tick `k` is chosen mid-flight. A shooter who reloads during the flight discards that throw
  and can throw the same bird again. Closing this needs a pending-shot marker written at
  launch (a rules and data-model change), deferred until it matters in practice.
- The E2E spec takes about 2 minutes because the six flights run in real time.
