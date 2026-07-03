# PRD — Mine Race (minesweeper duel)

**One-liner:** both players sweep the identical seeded minefield simultaneously — first to clear
every safe cell wins, first to detonate loses instantly.

| | |
|---|---|
| `type` | `minesweeper` |
| Label / badge | `MINE RACE` / `MR` |
| Category | `reflex` (it's a speed race) |
| Integration | **C** — custom race page (math/typing precedent) |
| Network | RTDB seeded race — no P2P |
| Effort | **S/M** |
| Priority | P3 |

## Game rules

- Board: **12×12, 22 mines** (`ROWS/COLS/MINES` tunable constants — chosen for 2–4 minute
  rounds; classic Intermediate 16×16/40 runs too long for a duel).
- Both players get the **same seeded board** with the **same pre-revealed opening**: generation
  picks a seeded zero-cell and pre-floods its region for both players. This solves first-click
  safety without per-player board regeneration (which would break the identical-board fairness).
- Left-click/tap reveals; number = adjacent mines; revealing a zero flood-fills.
- Flags: right-click / long-press, **local-only** (never synced — pure player aid).
- **Chording** (click a satisfied number to reveal its unflagged neighbors) is included — it's
  the core speed mechanic for experienced players.
- **Round end (whichever first):**
  - a player reveals a mine → **opponent wins instantly**;
  - a player reveals all 122 safe cells → **they win**.
  - The end event is serialized by the standard winner `runTransaction`, so a simultaneous
    boom+clear photo-finish resolves to whichever transaction lands first.
- 50/50 guess endgames are inherent to minesweeper; both players face the identical board, so
  it stays symmetric — accepted, not mitigated.

## Data model

Top-level race keys (all added to `FIELD_NULLS`):

```
minesSeed:        number      // written by freshGameState
minesStartedAt:   epoch-ms    // both-ready start (mirror TypingGame's countdown flow)
minesRevealedX/O: number      // COUNT of revealed safe cells — the ghost display
minesDeadX/O:     bool
minesDoneX/O:     bool        // all safe cells revealed
```

**Anti-leak rule (critical):** only *counts* are mirrored. Revealed cell **positions must never
be written to Firebase** — on an identical board they are direct hints ("they're deep in the
top-right, so it's safe"). Board state stays entirely client-side, derived from the seed.
This also means spectators see only two progress bars, not boards — accepted for v1
(spectator boards would leak to any player who opens a second tab).

## UI

- Own board center-stage; opponent ghost = progress bar (`revealed / 122`) + avatar, plus a
  skull state on `minesDead`. Standard last-10-percent urgency treatment.
- Cell rendering: DOM grid (no canvas), numbers colored by the classic 1–8 palette **mapped to
  theme tokens** (1→`retro-p1`, 2→`retro-win`, 3→`retro-p2`, 4+→`retro-cta`/dim variants) —
  never the traditional hardcoded blue/green/red.
- Mine reveal on loss: full board shown with mines, the fatal cell highlighted.
- Mobile: 12 columns fit `max-w-md`; tap = reveal, long-press = flag (with haptic if available);
  a REVEAL/FLAG mode toggle button as fallback for long-press-hostile browsers.

## Files

| File | Contents |
|---|---|
| `src/lib/minesweeperLogic.js` | `generateBoard(seed)` → `{ mines: Set, counts: int[], opening: int[] }` (seeded PRNG, zero-cell opening guaranteed by regenerating placement until one exists — deterministic loop off the seed), `floodReveal(board, cell, revealed)`, `chordTargets(board, cell, revealed, flags)`, `isComplete(revealed)` |
| `src/lib/minesweeperLogic.test.js` | see Testing |
| `src/pages/MineRaceGame.jsx` | ready/countdown → race → end; board component inline or extracted |
| Registration | registry entry (`custom: true`), icon, ladder case, `freshGameState` branch, `FIELD_NULLS` keys |

## Edge cases

- Reload mid-round: board re-derives from seed, but **own revealed set is client-only and is
  lost** → v1 rule: reload = your revealed count stays in Firebase but you resume from the
  opening region (self-punishing, no leak); acceptable. Persisting own revealed set to
  sessionStorage is a cheap improvement — do it if trivial.
- Flag-then-chord misfires (wrong flag placement): standard minesweeper punishment (you reveal
  a mine) — no special handling.
- Opponent quits mid-race: presence banner; finish solo for the win via completion.
- Both dead is impossible (first death ends the round transactionally).

## Testing

- Unit: board determinism per seed; mine count exact; counts correctness (fixture boards);
  opening region is zero-flood and mine-free; flood fill (interior, edge, whole-board-zero);
  chording target computation (satisfied/unsatisfied/overflagged); completion detection.
- Manual: two-browser race; long-press flagging on a real phone; simultaneous-ish finish;
  reload behavior.

## Stretch

Spectator-safe delayed board view (30 s delay); best-time solo mode on `/demo`; board-size
variants (`variantOf`); synced "both boards revealed" post-game replay.
