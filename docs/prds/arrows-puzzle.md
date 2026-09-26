# PRD: Arrows Puzzle

> **Superseded 2026-09-26 — race rework.** The shipped game no longer matches this PRD.
> Arrows is now a simultaneous race: both players clear their own copy of an identical
> board generated from `arrowsSeed` (`generateArrowsLevel` in `src/lib/arrowsLogic.js`).
> An arrow is blocked when any other arrow sits between its head and the board edge
> (no curated traps); a blocked tap bumps the arrow toward its blocker, turns it red and
> costs a life. A clear arrow slithers along its own body and off the board. First to
> clear their board wins the round; running out of 3 lives forfeits it. Best of 3
> (easy → medium → hard), first to 2. Each board is simulated locally, so taps never
> wait on the network; Firebase carries only progress (`arrowsGone{X|O}`,
> `arrowsLives{X|O}`), a shared start time (`arrowsStartedAt`) and the round-end
> transaction. The sections below describe the original shared-board design.

## Summary

A shared-board 2-player reflex duel. A single SVG canvas holds a set of **snake paths**
(polylines on a dot grid) that never overlap but sit tight. Both players tap any
uncleared arrow at any time — the host arbitrates each tap through a Firebase
transaction. Clear an arrow and it slides off the board in your color; tap a **blocked
arrow** (a trap whose head can't exit) and it shakes red and costs you a life.

The visual language is ported from the captain-approved Lavish mockup
(`arrows-puzzle-levels.html`): matcha retro ink, 2.25px strokes with rounded bend
corners, a faint dot grid (34% opacity), outline-triangle arrowheads, flow-out
animation, and a blocked-shake.

- Players: 2. Category: reflex. Netcode: **Firebase Realtime Database transactions**
  (no WebRTC — state changes are human-speed taps, so the board is the single shared
  truth and every tap is atomic).
- Effort: **M** (new SVG board + tap-transaction round flow; no physics sim).

## Rules (locked)

1. **Shared board** — both players see the same arrows on one SVG canvas.
2. **Simultaneous taps** — either player may tap any uncleared arrow at any time. The
   host (X) arbitrates via `runTransaction` so two taps on the same arrow resolve to one.
3. **3 lives each** — a wrong tap (blocked head) costs 1 life for that player. At 0
   lives a player may no longer clear arrows (spectate only) until the round ends.
4. **Valid tap** — arrow is not blocked; it slides out along its exit axis and is
   removed, tinted to the clearing player's color (X = green, O = purple).
5. **Blocked tap** — the head cannot exit; brief red shake, lose 1 life, arrow stays.
6. **Round win** — when a round ends, whoever cleared more arrows wins the round.
   Equal clears = a drawn round (no point to either side).

### Match structure (captain decision)

- **15 levels total** — 5 easy, 5 medium, 5 hard (tier-1 levels are the mockup's;
  4 more per tier designed to the same rules).
- **3-round face-off** — round 1 = easy, round 2 = medium, round 3 = hard.
- **Match winner** — best-of-3: first to 2 round wins. After 3 rounds with round wins
  still level (1–1 with a draw, or all draws), the match is a draw.

## Level format

Levels live in `src/lib/levels/arrows/index.js`, keyed by id (`easy1` … `hard5`):

```js
{
  id: 'easy1',
  tier: 'easy',                 // easy | medium | hard
  label: 'TIGHT PACK',
  viewBox: [0, 0, 200, 240],
  arrows: [
    { d: 'M50 40 L50 100 L70 100 L70 140', blocked: false },  // SVG polyline
    { d: 'M80 40 L100 40 L100 80 L80 80 L80 120', blocked: true },
    // ...
  ],
}
```

- `d` is an axis-aligned `M/L` polyline (the same format the mockup authors). It is
  parsed at load (`parsePathD`) into `[[x,y], …]`. The last segment is the arrow's
  **exit direction**; the tip is where the outline-triangle head is drawn.
- `blocked` is a **static, curated flag** (mirrors the mockup's `data-blocked`): a
  blocked arrow is a permanent trap — it never clears, and tapping it always costs a
  life. Geometric "unblock by clearing the blocker" is a possible v2; the mockup treats
  blocked as static, so v1 does too.
- No two arrows share a lattice point or segment (validated by a unit test). No
  procedural generation in v1.

## Firebase state shape

`gameType: 'arrows'`, `custom: true`, `realtime: true`. State at `games/{gameId}`:

```
arrowsRound:  0 | 1 | 2            // round index → tier: easy / medium / hard
arrowsLevel:  'easy1' | ...        // the specific level for the current round
arrowsCleared: string[]            // per arrow: '' (uncleared) | 'X' | 'O' (who cleared it)
arrowsLivesX:  number              // 3 → 0 (reset each round)
arrowsLivesO:  number
winner:       'X' | 'O' | 'draw'   // round winner, set when the round ends
scores:       { X, O }             // MATCH points = round wins (best of 3)
```

All keys are listed in `FIELD_NULLS` so switching games clears them. `arrowsCleared` is
normalized on read with the same sparse-read pattern as every other array
(`normalizeCleared`). There is no `currentTurn` (omitted/null) so Game.jsx's turn-flip
move-sound detection stays silent — the page drives its own audio.

### Round flow

- `freshGameState('arrows')` → round 0 (a random easy level), cleared empty, 3 lives each.
- A tap transaction re-reads the room, applies `applyTap`, and — when the round resolves
  — sets `winner` + `status: 'finished'` and increments `scores[winner]`.
- "Play again" advances the round via the config `nextRound(game)` hook (round +1, a
  random level from the next tier, cleared/lives reset); `scores` persist. "New match"
  resets to round 0 and zeroes `scores` (standard `applyNewMatch`).

## UI/UX

- `src/components/ArrowsBoard.jsx` — SVG board: dot grid, rounded polyline bodies
  (`roundedPathD`, 8px corner radius, 2.25px stroke), outline-triangle heads
  (`buildArrowHead`, style D, closed path fill none), flow-out on clear
  (`flowOut` slides the group along its exit axis + fades), blocked shake (red flash).
- Colors flow through `--c-*` tokens (no hex): body = `--c-text` (retro ink), dots =
  `--c-structure` @ 34%, cleared = `--c-p1`/`--c-p2`, blocked = `--c-danger`, board =
  `--c-surface`.
- Custom HUD (`ArrowsGame.jsx`, `hidePlayerCards: true`): each side shows name, match
  score (round wins), lives (hearts), and current-round clears.
- Controls: tap/click only — no keyboard/pointer controls needed.
- Sounds: `sounds.hit()` on a clear, `sounds.miss()` on a blocked tap, standard
  win/lose/draw + WinEffect on round end (free from Game.jsx).

## Edge cases

- **Same-arrow race** — two players tap the same arrow near-simultaneously; the
  transaction re-reads and the loser's tap is a no-op.
- **Out of lives** — a 0-life player's taps are rejected client-side and in the
  transaction (`applyTap` returns null).
- **Both out of lives / board exhausted** — the round resolves the moment the last
  clearable arrow is cleared OR both players hit 0 lives.
- **Round draw** — equal clears → `winner: 'draw'`, no score bump; match may still end
  in an overall draw after 3 rounds.
- **Tab reload mid-round** — the board re-renders from Firebase; already-cleared arrows
  render hidden (no re-animation), lives/clears restored.

## Testing (vitest)

`src/lib/arrowsLogic.test.js` covers: `parsePathD`; `getLevel` returns parsed points;
`isArrowBlocked`; `applyTap` (valid clear, blocked life-loss, out-of-lives reject,
already-cleared reject); `getArrowsWinner` (majority, draw, both-dead); `roundedPathD`
and `exitVector`; `arrowsNextRound` tier progression; and a **level validation suite**
that asserts every one of the 15 levels parses, has the right arrow count (5/10/16),
exactly one blocked arrow, all points inside its viewBox, and no two arrows share a
lattice point or segment.

## Open questions

- Dynamic unblocking (clearing a blocker frees a blocked arrow) — v2; v1 keeps static
  traps per the mockup.
- Solo `/demo` bot play — deferred (not required for this task; multiplayer only).
