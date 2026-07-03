# PRD — Mancala (Kalah)

**One-liner:** the ancient sow-and-capture pit game. Fits the registry's `applyMove` shape
exactly (extra turns are already precedented by dots & boxes; custom state keys by PIG).

| | |
|---|---|
| `type` | `mancala` |
| Label / badge | `MANCALA` / `MC` |
| Category | `board` (2 players + spectators) |
| Integration | **B** — registry + `applyMove`, `boardSize: 0` (PIG pattern: all state in custom keys) |
| Network | RTDB, turn-based |
| Effort | **S/M** — logic is S; the sowing animation is the M |
| Priority | P2 |

## Game rules (Kalah 6,4 — the standard)

- 14 slots: `pits[0..5]` = X's pits, `pits[6]` = X's store, `pits[7..12]` = O's pits,
  `pits[13]` = O's store. Start: 4 seeds in each pit, stores empty.
- On your turn, pick one of **your own non-empty pits**; sow its seeds counterclockwise one per
  slot, **skipping the opponent's store**.
- **Extra turn:** last seed lands in your own store → you move again (`currentTurn` stays — dots
  & boxes precedent).
- **Capture:** last seed lands in your own **empty** pit and the opposite pit
  (`opposite(i) = 12 - i`) is non-empty → both that seed and the opposite pit's seeds go to your
  store.
- **End:** a player's six pits are all empty at the start of their turn (or after any move —
  check after every move). The other player sweeps their remaining seeds into their own store.
  Most seeds wins; 24–24 = draw.

## Data model

Two new top-level keys (added to `FIELD_NULLS`):

```
mancalaPits: number[14]                       // authoritative state
mancalaLast: { pit, by, seeds } | null        // last move metadata → drives the sow animation
```

`freshGameState('mancala')` →
`{ ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: 'X',
   mancalaPits: [4,4,4,4,4,4,0,4,4,4,4,4,4,0].map… , mancalaLast: null }`
(store as a plain number array — Firebase handles numeric arrays; normalize on read with a
`normalizePits()` that mirrors `normalizeBoard`'s array-or-object tolerance).

## Registry entry

```js
{
  type: 'mancala', label: 'MANCALA', desc: 'sow & capture', Icon: MancalaIcon,
  badge: 'MC', maxWidth: 'max-w-md', category: 'board',
  boardSize: 0,
  getMoveIndex: (_, pit) => pit,
  BoardComponent: MancalaBoard,
  applyMove: ({ game, index, symbol }) => {
    const pits = normalizePits(game.mancalaPits)
    const moved = applyMancalaMove(pits, index, symbol)   // null if not your pit / empty
    if (!moved) return null
    return {
      updates: {
        mancalaPits: moved.pits,
        mancalaLast: { pit: index, by: symbol, seeds: pits[index] },
        currentTurn: moved.extraTurn ? symbol : (symbol === 'X' ? 'O' : 'X'),
      },
      result: moved.result,   // null | { winner: 'X'|'O'|'draw' } (post-sweep totals)
    }
  },
  boardProps: (game) => ({
    pits: normalizePits(game.mancalaPits),
    last: game.mancalaLast ?? null,
  }),
}
```

`applyMancalaMove` performs sow + capture + end-sweep in one pure step and returns
`{ pits, extraTurn, captured, result }`. No `winningLine`.

## Board component — `src/components/MancalaBoard.jsx`

- Horizontal layout: O's store left, 2×6 pit grid, X's store right. X's row on the bottom.
  **V1 ships fixed X-perspective with strong YOU / RIVAL row labels** — board components receive
  `boardProps(game)` only, and threading the viewer's symbol through `Game.jsx` is a generic
  change shared with checkers (see Open questions there). Perspective flip is a fast-follow.
- Seeds: clusters of pixel dots for counts ≤ 6, dot cluster + numeral above that. Stores show
  big numerals.
- **Sow animation:** on `last` change, animate seeds hopping pit-to-pit (staggered ~120 ms CSS
  transitions, total capped ~1.5 s for big sows). Replay is derived client-side from
  `last.pit` + `last.seeds` — the written `pits` are already final, so animation is cosmetic and
  spectator-safe. Capture gets a distinct "vacuum" effect + sound; extra turn gets a "GO AGAIN"
  toast (dots & boxes precedent).
- Legal-move affordance: your non-empty pits glow on your turn; hover/long-press previews the
  landing pit (subtle — it's part of the skill, keep it to a faint outline).

## Files

| File | Contents |
|---|---|
| `src/lib/mancalaLogic.js` | `INITIAL_PITS`, `normalizePits`, `applyMancalaMove`, `opposite`, `getMancalaWinner` (exported for tests) |
| `src/lib/mancalaLogic.test.js` | see Testing |
| `src/components/MancalaBoard.jsx` | layout + sow/capture animation |
| Registration | registry entry, icon; **no `Game.jsx` changes** |

## Edge cases

- Sow wraps the whole board (>13 seeds): opponent store skipped every lap — test explicitly.
- Capture with empty opposite pit: **no capture** (the seed stays) — the most common rules bug.
- Last-seed-in-store on a move that also empties your side: extra turn is moot; end-check
  runs after every move and the sweep resolves the game.
- Firebase array handling: 14-element numeric array with zeros is safe (no `null` holes ever —
  zeros are numbers, not empty strings).

## Testing

- Unit: basic sow; store skip (both directions); wraparound sow; extra-turn detection; capture
  (valid, empty-opposite invalid, capture into store totals); end-sweep both sides; winner/draw
  at 24–24; illegal move rejections (opponent's pit, empty pit).
- Manual: two-browser game; animation timing with rapid extra-turn chains; spectator view.
