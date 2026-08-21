# PRD — Pig Big

**One-liner:** Pig with **two** dice per roll. Only **snake eyes** (`[1,1]`) busts; a single 1
still scores. Same race to 100, same `DiceBoard` shell, `variantOf: 'dice'`.

| | |
|---|---|
| `type` | `dice-big` |
| Label / badge | `PIG BIG` / `PIG2` |
| Category | `dicebluff` (2 players + spectators) |
| Integration | **B** — `boardSize: 0` + `applyMove` + `boardProps`. **Requires a small `Game.jsx` branch** (seeded roll is hardcoded to `cfg.type === 'dice'`). |
| Network | RTDB, honest-client, existing Pig commit-reveal seed |
| Effort | **S/M** |
| Priority | P2 — pig mode, not a new catalog tile |
| `addedAt` | `2026-08-15` |

This spec is implementation-ready: no open design decisions.

---

## Game rules

- **Target:** first to **100** banked points (same as classic Pig).
- **ROLL:** roll two dice `[d1, d2]`, each 1–6.
  - `[1,1]` → **bust**: at-risk total becomes 0, trail clears, turn flips.
  - anything else, including `[1,5]` → add `d1 + d2` to the at-risk total, **stay** on the mover.
- **BANK:** add at-risk total to `diceScoreX` / `diceScoreO`, clear at-risk, flip turn.
  Bank with at-risk **0** is allowed (same as classic `applyDiceMove` — no extra guard).
- After a bank, if that player's banked total ≥ 100 → they win the round.
- Match: first to 3 round wins.

## Data model

Boardless. Reuse every Pig key. **No new Firebase keys, no `FIELD_NULLS` change.**

```
diceScoreX / diceScoreO: number
diceTurnScore: number
diceLast: number | [d1, d2] | null   // classic: number; this mode: pair
diceRolls: array                     // classic: number[]; this mode: [d1,d2][]
diceRollIndex: number                // +1 per ROLL (not per die)
diceSeed, diceSeedCommitX, diceSeedRevealX, diceSeedB: same handshake as Pig
currentTurn: 'X' | 'O'
```

Do **not** add `diceLastPair`. `DiceBoard` classic must treat `diceLast` as a bust only when
`diceLast === 1` (number). This mode treats bust when `Array.isArray(diceLast) && d1===1 && d2===1`.

`freshGameState('dice-big')` uses the **same branch as `dice`** (scores 0, seed nulls,
`currentTurn: 'X'`, `board: null`).

## Registry

On base `dice`:

```js
classicLabel: 'ONE DIE',
classicBlurb: 'Roll a 1 and the turn pot is gone. First to 100.',
```

```js
{
  type: 'dice-big', label: 'PIG BIG', desc: 'two dice, snake eyes bust',
  Icon: DiceIcon, badge: 'PIG2', maxWidth: 'max-w-xs',
  category: 'dicebluff', addedAt: '2026-08-15',
  durationMin: 4, tags: ['luck'], solo: true,
  variantOf: 'dice', variantLabel: '2 DICE',
  variantBlurb: 'Two dice. Only double 1 busts. A single 1 still scores.',
  boardSize: 0,
  getMoveIndex: () => 0,
  BoardComponent: DiceBoard,
  applyMove: ({ game, move, symbol }) => {
    const action = typeof move === 'string' ? move : move?.action
    const face = typeof move === 'string' ? undefined : move?.face
    return applyDiceBigMove(game, action, symbol, face)
  },
  boardProps: (game) => ({
    isBig: true,
    diceScoreX: game.diceScoreX ?? 0,
    diceScoreO: game.diceScoreO ?? 0,
    diceTurnScore: game.diceTurnScore ?? 0,
    diceLast: game.diceLast ?? null,
    diceRolls: Array.isArray(game.diceRolls) ? game.diceRolls : [],
    diceSeed: game.diceSeed ?? null,
  }),
}
```

Reuse `DiceIcon`. No new icon.

## Logic — `src/lib/diceLogic.js` (same module)

Keep `applyDiceMove` untouched for classic. Add `applyDiceBigMove(game, action, symbol, facePair)`
and `rollFacePairAsync(seedHex, rollIndex)` in the same file.

- `facePair` is `[d1, d2]` from `Game.jsx` when a seed exists. Omit it in demo/bot → two
  `rollDie()` calls. If `diceSeed` is set and `facePair` is missing on `'roll'` → return `null`
  (same refuse-random rule as classic).
- Bust only when `d1 === 1 && d2 === 1`. Otherwise `diceTurnScore += d1 + d2`, `currentTurn` stays.
- `diceLast` and each `diceRolls` entry are `[d1, d2]` in this mode.
- `rollFacePairAsync(seed, i)` → `[rollFaceAsync(seed, 2*i), rollFaceAsync(seed, 2*i+1)]`.
  `diceRollIndex` still increments by **1** per roll so verify uses the same `i`.

### `Game.jsx` (required)

Today seed gate + face precompute + mismatch toast all key off `cfg.type === 'dice'`:

- Roll blocked unless `diceSeed` (~line 809).
- `face = await rollFaceAsync(seed, diceRollIndex)` (~line 818–823).
- Opponent verify `expected !== game.diceLast` (~line 491–497).
- Bust SFX when `game.diceLast === 1` (~line 487).

Helper: `isPig(type) => type === 'dice' || type === 'dice-big'`.

For `dice-big` rolls: `face = await rollFacePairAsync(...)`. Verify both faces against
`game.diceLast` as a pair. Bust sound only on snake eyes (`Array.isArray(diceLast) && both 1`);
else `sounds.pigRoll` / `sounds.move` as today. Bank still `sounds.pigBank` if that path exists.

Do **not** write `if (cfg.type === 'dice' && cfg.variantOf === 'dice-big')` — `cfg.type` **is**
`dice-big`; `variantOf` is `'dice'`.

## Board — `src/components/DiceBoard.jsx`

Prop `isBig` from `boardProps`.

- Two `Die` faces side by side. Bust styling only when both are 1 — **change** current
  `Die` `isBust = bust || value === 1`, which would paint every single-1 as a bust in this
  mode. Pass `bust` explicitly: classic `bust={value===1}`; big `bust={d1===1 && d2===1}`
  and never auto-bust a lone 1.
- Trail: mini pair per roll. Buttons stay ROLL / BANK; optional label `ROLL 2 DICE`.
- Copy on snake eyes: `SNAKE EYES` (or reuse bust animation).

## Files

| File | Change |
|---|---|
| `src/lib/diceLogic.js` | `applyDiceBigMove`, `rollFacePairAsync` |
| `src/lib/diceLogic.test.js` | Big cases (keep classic) |
| `src/components/DiceBoard.jsx` | `isBig`; bust only on snake eyes when big |
| `src/pages/Game.jsx` | `isPig` for seed, pair roll, pair verify, bust SFX |
| `src/lib/games.js` | Variant row + `classicLabel` on `dice` |
| `src/lib/rules.js` | `dice-big` entry |
| `src/lib/demoBots.js` | `case 'dice-big': return botDice(...)` (hold-at-20 still fine) |
| `src/pages/Demo.jsx` | Tile next to Pig |
| `src/lib/games.test.js` | `freshGameState('dice-big')` matches pig scores/seed nulls |

## Edge cases

- Single 1 is **safe** (+ the other die). The whole point of the mode; tests must cover `[1,3]`.
- Switch `dice-big` → `dice`: `FIELD_NULLS` clears `diceLast`. If a stale array ever leaked,
  classic `Die` must not crash — `typeof diceLast === 'number'`.
- Hyphenated type `dice-big` is unique in the registry; keep it. Object lookup `GAME_RULES['dice-big']`
  is fine; do not write `GAME_RULES.dice-big`.
- Commit-reveal unchanged: still two player seeds, then many indexed draws. Big pig just uses
  two draws per roll index.

## Testing

- Unit: `[1,1]` bust + flip + pot 0; `[1,3]` +4 stay; `[2,6]` +8 stay; bank to 100 wins;
  bank at pot 0 allowed; seeded roll without pair → `null`.
- Manual: two-browser (incognito) seed handshake then a snake-eyes bust; mismatch toast if
  you force a bad `diceLast`; theme sweep; VariantChooser `ONE DIE` / `2 DICE`.

## Stretch

Bust on **any** 1 (standard two-dice Pig); snake eyes also wipes the **bank**; race to 50.
Not v1.
