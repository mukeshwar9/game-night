# PRD — Pairs (Concentration / memory-match duel)

**One-liner:** the classic memory-match game — flip two of 36 face-down cards a turn, keep a
matching pair and go again, miss and pass the turn. Simple to learn, brutal to actually
memorize; fits the registry's `applyMove` shape exactly (extra turn on match is the dots &
boxes/mancala precedent; deck/flip state are custom keys like Simon/Visual Memory).

| | |
|---|---|
| `type` | `pairs` |
| Label / badge | `PAIRS` / `PR` |
| Category | `memory` (2 players + spectators) |
| Integration | **B** — registry + `applyMove` (standard `board`, plus two custom keys) |
| Network | RTDB, turn-based, honest-client |
| Effort | **S/M** |
| `addedAt` | `2026-07-11` |

This spec is implementation-ready: a builder should not need to make any open design
decisions. Every open question raised while researching the codebase has been resolved below
(see "Decisions resolved from source" in each section) — there is nothing left for the
orchestrator to answer.

---

## 1. Overview and rules

- **Board:** 6×6 grid, 36 cards. 18 distinct "faces" (see §Card faces), each appearing exactly
  twice, shuffled at game creation.
- **Turn structure:** on your turn you flip exactly two face-down cards, one at a time (two taps).
  1. **First tap** (of a turn): flips one card face-up. Nothing else happens yet — you still owe
     a second tap this turn.
  2. **Second tap:** flips a second card face-up.
     - **Match** (same face): you claim the pair — both cards are stamped with your symbol and
       stay face-up permanently. **You immediately get another turn** (first tap again — same
       "extra turn on completion" grammar as Dots & Boxes and Mancala's store-landing rule;
       `currentTurn` does **not** flip).
     - **No match:** both cards stay face-up and visible to everyone (**no auto-flip-back
       timer**) and `currentTurn` flips to the opponent. The mismatched pair is cleared (flipped
       back to face-down) by the *next* player's own first tap of their turn — see §Data model /
       §Logic details, branch (b). There is no cosmetic delay/timeout; state is 100% Firebase-driven
       so this is deterministic and reload-safe.
- **You may never flip:**
  - a card that's already claimed (owned by X or O), or
  - a card that's already face-up as one of the current turn's picks (can't match a card with
    itself, and can't re-tap one of a still-showing mismatched leftover pair — you must tap a
    *different*, unclaimed card, which simultaneously dismisses the leftover pair and starts your
    own first pick).
- **Win condition:**
  - **Clinch:** the moment a player owns **≥ 10 of the 18 pairs**, they win immediately (checked
    after every match — the other player can have at most 8, so this can never be simultaneous
    for both sides).
  - **Board full:** if all 36 cards get claimed without either side reaching 10, the split is
    always exactly **9–9** (10+ would already have triggered the clinch branch above) → **draw**.
  - Like every other registry board game, round wins go through the standard `runTransaction` +
    `scores` + rematch/switch machinery; **first to 3 round wins takes the match** (Pairs is not
    added to `Game.jsx`'s `SINGLE_ROUND_GAMES` set — it's a multi-round match game like SOS /
    Dots & Boxes / Gomoku, not a single-round reflex game like Tron/Sumo/Spaceduel).
  - No `winningLine` (no line concept — same as Dots & Boxes/SOS/Reversi/Chain Reaction).

### Card faces — decision from source

`src/lib/avatars.js` exports `SHAPES`, a 22-entry array of pixel-art sprite keys (20 "creature"
shapes + 2 humanoid shapes `boy`/`girl`). **22 ≥ 18**, so per the brief's decision rule: **use
the existing `Avatar` component/sprites as card faces, no new inline glyphs.**

Chosen 18 faces — the first 18 non-humanoid entries of `SHAPES` in file order (excludes `sword`,
`slime`, `boy`, `girl` purely to keep the set at exactly 18 and avoid the humanoid
multi-part-tone rendering path, which is more visual complexity than a card face needs):

```
invader, robot, ghost, alien, skull, cat, ufo, wizard, ninja,
crown, dino, heart, frog, star, mushroom, bolt, moon, fish
```

Each is rendered at a **fixed neutral tone, `text`** (avatar id = `` `${face}.text` ``, e.g.
`'robot.text'`) — deliberately uniform across all 18 faces so the *shape* alone carries the
matching signal; ownership (X/O) is communicated separately by the claimed-card background tint
+ corner tag (§UI/UX), not by recoloring the face. `parseAvatar('robot.text')` resolves cleanly
(shape in `SHAPES`, tone in `TONES`) — verified against `src/lib/avatars.js`'s `parseAvatar`.

---

## 2. Data model

Two new top-level Firebase keys under `games/{gameId}`, **both added to `FIELD_NULLS`** in
`src/lib/games.js` so switching games clears them:

```
pairsDeck:    string[36]              // face ids (from the 18-face set above), each twice, shuffled.
                                       // Written once by freshGameState('pairs'); never rewritten
                                       // mid-round. Public in Firebase — see Trust model below.
pairsFlipped: number[] | null         // 0, 1, or 2 cell indices (0–35) currently face-up but NOT
                                       // yet claimed this "step". null when empty (Firebase
                                       // deletes empty arrays — always normalize on read).
```

`board: string[36]` is the **standard** registry `board` key (not a new top-level key — it
already goes through the generic `normalizeBoard`/`FIELD_NULLS`-adjacent machinery every board
game uses). Cell values: `''` unclaimed, `'X'`/`'O'` — a claimed pair's **both** cells get the
claiming symbol (mirrors Dots & Boxes' `boxes` ownership convention, just folded into `board`
itself since Pairs has no separate "structure vs. territory" split).

`boxes` is unused for Pairs (`null`, same as SOS/Reversi/Chain Reaction). No `round` sub-node.
`currentTurn` is the standard `'X'|'O'` key, present throughout (Pairs is turn-based, unlike
Pong/Snake).

### Who writes what

| Key | Writer |
|---|---|
| `board` | `applyMove` (via `update()` in `Game.jsx`'s `handleMove`, or the play-again reset) |
| `pairsDeck` | `freshGameState('pairs')` only (game creation, Play Again, New Match, switch-into-pairs) — **never** written by `applyMove` |
| `pairsFlipped` | `applyMove`, every move (set to `[i]`, `[j, i]`, or `null`) |
| `currentTurn` | `applyMove` |

### Trust model — honest-client, with an explicit up-front leak (documented, accepted)

Pairs is **honest-client tier** (README's tier 1 — same as all 28+ existing board games: any
client could in principle read or write `games/{id}` directly). What's unusual about Pairs
relative to, say, Tic-Tac-Toe is that the "secret" information (which face is under which
face-down card) is **front-loaded in full at creation time**, not derived progressively from
moves — so a technically savvy player who inspects the live Firebase subscription (dev tools
network tab, or the Firebase console/REST API for the room) can read `pairsDeck` and get a
perfect memory for the entire game from move one, not just an incremental edge. This is **not**
the same thing as the README's "bundle-leak" tier (that's about *static* content — e.g. Fibbage's
prompt deck — shipping in the JS bundle; here, `PAIRS_FACES` shipping in the bundle is
irrelevant/harmless, since which 18 faces exist is meant to be public — it's the **per-game
shuffle order** that's the sensitive bit, and that value is generated fresh per game and written
straight to a "public" Firebase field).

**Decision (matches the brief exactly):** accept this leak. A commit-reveal scheme for 18
progressively-revealed pairs would be substantially more complex than Hangwoman's single-secret
case (mutual real-time verification of *which* cards match, turn by turn, with no server) and is
out of scope for v1. Document the caveat inline in `pairsLogic.js` next to `generatePairsDeck` —
same spirit as `src/lib/decks/fibbage.js`'s bundle-leak comment, but written specifically for
this "public deck field" leak rather than copied verbatim (it's a different leak vector).

---

## 3. New files

### `src/lib/pairsLogic.js`

Pure, no DOM, no Firebase, no network.

```js
// Trust-model note (see docs/prds/pairs.md §Trust model): pairsDeck is written to Firebase
// in full, in the clear, at game creation. Any client that inspects the live RTDB
// subscription (dev tools / Firebase console / REST) can read every face's location for
// the rest of the round. This is an accepted, documented leak (same honest-client tier as
// every other board game) — it is NOT the bundle-leak caveat (PAIRS_FACES itself is public
// and meant to be); it's specifically the per-game *shuffle order* that leaks early.

export const PAIRS_SIZE = 6
export const PAIRS_CELL_COUNT = 36
export const PAIRS_TOTAL_PAIRS = 18
export const PAIRS_CLINCH = 10

export const PAIRS_FACES = [
  'invader', 'robot', 'ghost', 'alien', 'skull', 'cat', 'ufo', 'wizard', 'ninja',
  'crown', 'dino', 'heart', 'frog', 'star', 'mushroom', 'bolt', 'moon', 'fish',
]

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Plain Math.random() shuffle at creation time — same sanctioned pattern as
// generateVmPattern (src/lib/visualMemoryLogic.js) and generateChimpLayout: these are
// symmetric-information/simultaneous-reveal games with no anti-cheat need for a seeded
// or server-verifiable RNG (contrast with Pig's diceSeed commit-reveal, which exists
// because Pig rolls are asymmetric turn-by-turn stakes). Not reproducible/testable by
// exact output — tests assert structure (counts), not a specific shuffle.
export function generatePairsDeck() {
  return shuffle([...PAIRS_FACES, ...PAIRS_FACES])
}

// Array-or-Firebase-numeric-object tolerance, same shape as normalizeVmArray /
// normalizeSimonSequence in the existing memory games.
export function normalizePairsDeck(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return Object.keys(raw).map(Number).sort((a, b) => a - b).map(k => raw[k])
}

export function normalizePairsFlipped(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return Object.keys(raw).map(Number).sort((a, b) => a - b).map(k => raw[k])
}

// Returns { winner: 'X'|'O'|'draw' } or null. Called unconditionally after every move
// (same pattern as getSosWinner/getDotsAndBoxesWinner) — cheap no-op when not yet decided.
export function getPairsWinner(board) {
  const xCells = board.filter(c => c === 'X').length
  const oCells = board.filter(c => c === 'O').length
  if (xCells / 2 >= PAIRS_CLINCH) return { winner: 'X' }
  if (oCells / 2 >= PAIRS_CLINCH) return { winner: 'O' }
  if (xCells + oCells === PAIRS_CELL_COUNT) return { winner: 'draw' } // always 9–9 here
  return null
}

// Pure move application. board/deck are already-normalized string[36]; flipped is an
// already-normalized number[] (0–2 entries). index is the tapped cell (0–35). symbol is
// the mover ('X'|'O').
//
// Returns null if illegal:
//   - index out of range
//   - board[index] already claimed
//   - index already in `flipped` (can't re-tap your own held card or a stale mismatch card)
// ("game finished" is NOT re-checked here — Game.jsx's handleMove already refuses to call
// applyMove at all once game.status !== 'playing', and the BotBoardDemo harness in
// src/pages/Demo.jsx applies the identical guard — see Logic details for why this branch
// needs no code here.)
//
// Returns { board, flipped, turnStays, matched } otherwise:
//   - flipped.length !== 1 (0 fresh, or 2 leftover-mismatch-to-clear): first tap of the
//     turn → { board (unchanged), flipped: [index], turnStays: true, matched: false }
//   - flipped.length === 1 (second tap): compare deck[j] vs deck[index]
//       match    → { board: <both cells set to symbol>, flipped: null, turnStays: true, matched: true }
//       mismatch → { board (unchanged), flipped: [j, index], turnStays: false, matched: false }
export function applyPairsMove(board, deck, flipped, index, symbol) {
  if (index < 0 || index >= PAIRS_CELL_COUNT) return null
  if (board[index]) return null
  if (flipped.includes(index)) return null

  if (flipped.length !== 1) {
    return { board, flipped: [index], turnStays: true, matched: false }
  }

  const [j] = flipped
  if (deck[j] === deck[index]) {
    const newBoard = [...board]
    newBoard[j] = symbol
    newBoard[index] = symbol
    return { board: newBoard, flipped: null, turnStays: true, matched: true }
  }

  return { board, flipped: [j, index], turnStays: false, matched: false }
}

// ---------------------------------------------------------------------------
// Bot (used only by the local /demo harness — see Demo.jsx wiring below).
// ---------------------------------------------------------------------------

const RECALL_P = 0.45          // 2nd-flip: chance the bot correctly plays the known twin
const FIRST_FLIP_SETUP_P = 0.15 // 1st-flip: see implementation note below

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)] }

function legalCellsExcluding(board, exclude) {
  const out = []
  for (let i = 0; i < PAIRS_CELL_COUNT; i++) {
    if (board[i] === '' && !exclude.includes(i)) out.push(i)
  }
  return out
}

function pickFirstFlip(board, deck, flipped) {
  const legal = legalCellsExcluding(board, flipped)
  if (!legal.length) return null
  if (Math.random() < FIRST_FLIP_SETUP_P) {
    // "Deliberate" first flip: pick a still-unclaimed face and flip one of its two
    // copies. IMPLEMENTATION NOTE: because Pairs always claims both copies of a face
    // in the same instant (never one-claimed/one-not), every legal cell's twin is,
    // by construction, always also legal. So this branch and the plain-random branch
    // below are currently statistically indistinguishable — grouping by face first
    // doesn't change the distribution. Implemented as two distinct code paths anyway
    // for spec fidelity and because a future variant (e.g. odd face counts, a "burn a
    // card" power-up) could break that invariant and make this branch meaningful.
    const faces = [...new Set(legal.map(i => deck[i]))]
    const face = pickRandom(faces)
    const cells = legal.filter(i => deck[i] === face)
    return pickRandom(cells)
  }
  return pickRandom(legal)
}

function pickSecondFlip(board, deck, flipped) {
  const held = flipped[0]
  const legal = legalCellsExcluding(board, [held])
  if (!legal.length) return null // defensive; can't happen mid-game (see Logic details)
  if (Math.random() < RECALL_P) {
    const heldFace = deck[held]
    const twin = legal.find(i => deck[i] === heldFace)
    if (twin !== undefined) return twin
  }
  return pickRandom(legal)
}

// gameView: the demo harness's local game-state object (already has real arrays for
// board/pairsDeck/pairsFlipped, never raw Firebase snapshot shape — see Demo.jsx wiring).
// symbol is accepted for call-site parity with pickBotMove(type, game, botSymbol) →
// demoBots.js's `case 'pairs': return computePairsBotMove(game, botSymbol)` dispatch, but
// unused by the algorithm itself (Pairs' flip legality is symmetric for both players).
// `void symbol` below is a deliberate no-op so ESLint's no-unused-vars (args: 'after-used'
// in this repo's eslint.config.js) doesn't flag the final parameter.
export function computePairsBotMove(gameView, symbol) {
  void symbol
  const board = gameView.board || []
  const deck = normalizePairsDeck(gameView.pairsDeck)
  const flipped = normalizePairsFlipped(gameView.pairsFlipped)
  if (flipped.length === 1) return pickSecondFlip(board, deck, flipped)
  return pickFirstFlip(board, deck, flipped)
}
```

**Export list summary:**

| Export | Signature | One-line behavior |
|---|---|---|
| `PAIRS_SIZE` | `6` | grid dimension |
| `PAIRS_CELL_COUNT` | `36` | total cells |
| `PAIRS_TOTAL_PAIRS` | `18` | total pairs on the board |
| `PAIRS_CLINCH` | `10` | pairs needed to win immediately |
| `PAIRS_FACES` | `string[18]` | the chosen avatar shape keys used as faces |
| `generatePairsDeck()` | `() => string[36]` | fresh shuffled deck (18 faces × 2) |
| `normalizePairsDeck(raw)` | `(any) => string[]` | Firebase array-or-object → array |
| `normalizePairsFlipped(raw)` | `(any) => number[]` | Firebase array-or-object → array |
| `getPairsWinner(board)` | `(string[36]) => {winner}\|null` | clinch/draw/undecided |
| `applyPairsMove(board, deck, flipped, index, symbol)` | `(...) => {board,flipped,turnStays,matched}\|null` | pure move application |
| `computePairsBotMove(gameView, symbol)` | `(object, 'X'\|'O') => number\|null` | demo-only bot move |

### `src/lib/pairsLogic.test.js`

Vitest suite — see §7 Unit tests for the full enumerated case list.

### `src/components/PairsBoard.jsx`

```
PairsBoard({ board, deck, flipped, onMove, disabled, currentTurn })
```

- `board: string[36]` — standard, pre-normalized by the platform (`normalizeBoard(game.board, cfg.boardSize)` in `Game.jsx` / `BotBoardDemo`).
- `deck: string[36]` — from `boardProps(game)`, already normalized.
- `flipped: number[]` (0–2 entries) — from `boardProps(game)`, already normalized.
- `onMove: (index: number) => void` — same contract as every other `BoardComponent`.
- `disabled: boolean` — true when it's not my turn / I'm a spectator / the round is over.
- `currentTurn: 'X' | 'O'` — used only to tint the "your current pick" ring color.
- Platform also passes `winningLine` generically (every `BoardComponent` receives it) —
  **ignored**, same as Dots & Boxes/SOS/Mancala (no line concept).

Full behavior spec is in §5 UI/UX.

---

## 4. Logic details

### Why "game finished" needs no code in `applyPairsMove`

Every call site already refuses to reach `applyMove` once the round is over:

- `Game.jsx`'s `handleMove` (line ~648): `if (game.status !== 'playing') return` — before it
  even computes `index` or calls `cfg.applyMove`.
- `src/pages/Demo.jsx`'s `BotBoardDemo.applyOne`/the bot-turn effect: both check
  `g.status !== 'playing'` before calling `applyOne`/`pickBotMove`.

So `applyPairsMove` staying pure and only checking cell-level legality (in range / unclaimed /
not already flipped) is correct and matches every other `applyMove` game in the registry (none
of `applySosMove`/`applyEdgeMove`/`applyVmMove`/`applySimonMove` re-check `game.status` either).

### Move algorithm (registry glue, in `src/lib/games.js`)

```
getMoveIndex(board, index):
  return board[index] ? -1 : index      // occupancy-only pre-check (mirrors SOS/Dots&Boxes);
                                         // the "already flipped" check happens one layer in,
                                         // inside applyMove, because getMoveIndex has no
                                         // access to game.pairsFlipped (only (board, move)).

applyMove({ board, game, index, symbol }):
  deck    = normalizePairsDeck(game.pairsDeck)
  flipped = normalizePairsFlipped(game.pairsFlipped)
  applied = applyPairsMove(board, deck, flipped, index, symbol)
  if applied is null: return null       // Game.jsx no-ops silently, no Firebase write
  return {
    updates: {
      board: applied.board,
      pairsFlipped: applied.flipped,    // null clears the Firebase key (per house rule)
      currentTurn: applied.turnStays ? symbol : opponent(symbol),
    },
    result: getPairsWinner(applied.board),
  }
```

### Why `pickSecondFlip`'s `legal` can never be empty

`applyPairsMove`'s invariant: cells are claimed **only** in matched pairs (both cells of a face
flip to a symbol in the same call). So at any point during play, every still-unclaimed face has
**both** of its copies unclaimed (never "one claimed, one not"). If the bot (or a human) is
holding one flipped, unclaimed card (`flipped.length === 1`), its twin — by that invariant — is
guaranteed to still be on the board and unclaimed somewhere else, so `legalCellsExcluding(board,
[held])` always has at least 1 entry whenever `flipped.length === 1` can occur (which itself only
happens mid-game, never on a fully-claimed board). The `if (!legal.length) return null` in
`pickSecondFlip` is defensive dead code kept for robustness, not a reachable path — call it out
as such in a code comment so a future reader doesn't think it's a live bug.

### Sound behavior (inherited, no `Game.jsx` change needed/possible)

- **Your own** moves (first flip, second flip, match, mismatch) all fire `sounds.move(mySymbol)`
  unconditionally inside `Game.jsx`'s `handleMove`, regardless of game type — this already
  covers every local tap, including non-board-changing flips.
- **Opponent's** moves: `Game.jsx`'s generic `applyMove`-family sound detector fires
  `sounds.move(opponentSymbol)` only when `filledCount` (derived from `board`) increases. For
  Pairs, `board` only changes on a **match** — so a spectator/opponent hears a sound when the
  other player completes a match, but **not** on their individual flip taps (first tap, or a
  mismatching second tap). This is an inherited, unavoidable platform behavior shared by every
  `applyMove` game whose board doesn't change on every sub-step (compare: SOS/Dots & Boxes do
  change `board` on every move, so they don't have this gap). **Not a defect** — the card's own
  flip animation (§UI/UX) is the primary feedback for a remote flip; call this out once in
  Risks so it isn't "discovered" as a bug later.

---

## 5. UI/UX

Layout: `maxWidth: 'max-w-md'`, 6-column CSS grid, `aspect-square` cells, ~2–3px gaps, wrapped in
the same `bg-retro-surface border-2 border-retro-border rounded p-2/p-3` card shell every other
board uses (Dots & Boxes/SOS precedent).

### Per-cell states

1. **Face-down (default):** `bg-retro-card border border-retro-border`, centered small pixel
   "card back" glyph in `text-retro-dim` (a simple 4-pixel diamond, SVG, `fill="currentColor"`
   — no hex, themes automatically). Clickable (`onMove(i)`) when not `disabled`.
2. **Face-up, currently your held first pick** (`flipped.length === 1 && i === flipped[0]`):
   `bg-retro-surface`, ring highlight in the mover's tint — `ring-2 ring-retro-p1` if
   `currentTurn === 'X'` else `ring-2 ring-retro-p2` — plus the `Avatar` face at full opacity.
   Not clickable (already flipped this turn — tapping it again is illegal).
3. **Face-up, leftover mismatch** (`flipped.length === 2`, both indices): `bg-retro-surface`,
   `animate-pulse` (Tailwind core utility, no new keyframes/config needed) to hint "about to
   flip back," `Avatar` face shown. Not clickable.
4. **Claimed:** `bg-retro-tint-p1` (owner X) or `bg-retro-tint-p2` (owner O), `Avatar` face
   shown at reduced opacity (`opacity-60`) via a wrapping span — "dimmed," per the brief — plus
   a small corner tag: `<span className="absolute bottom-0.5 right-0.5 font-pixel text-[8px] text-retro-p1 text-glow-p1">X</span>` (or the `-p2`/`-p2` glow variant for O). Not clickable
   (`board[i]` truthy).

### Flip animation

Pure CSS 3D flip, self-contained in `PairsBoard.jsx` via inline `style` (no `index.css`/
`tailwind.config.js` edits — this repo's brief for this task explicitly forbids touching
existing files other than the registered shared touchpoints below):

```jsx
<button
  type="button"
  disabled={isDisabled}
  onClick={() => onMove(i)}
  className="relative aspect-square rounded-sm"
  style={{ perspective: '300px' }}
  aria-label={/* see below */}
>
  <div
    className="absolute inset-0 transition-transform duration-200"
    style={{ transformStyle: 'preserve-3d', transform: faceUp ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
  >
    <div className="absolute inset-0 ... /* back, card-back glyph */" style={{ backfaceVisibility: 'hidden' }} />
    <div className="absolute inset-0 ... /* front, Avatar face */" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }} />
  </div>
</button>
```

`faceUp = claimed || flipped.includes(i)`. `isDisabled = disabled || claimed || flipped.includes(i)`.
Transition duration ~200ms (per the brief). `Avatar` rendered at `size={36}` (fits comfortably
inside a ~55–72px cell across phone/tablet widths at `max-w-md`), default `tile` (true) so its
own knockout background (`--c-surface`) matches the front face's `bg-retro-surface` seamlessly
(verified against `Avatar.jsx`: `tile ? 'rgb(var(--c-surface))' : 'rgb(var(--c-bg))'`).

### Score readout

Below the grid, same convention as `DotsAndBoxesBoard`'s box-count bar:
`X {xPairs} — {oPairs} O` in `text-retro-p1 text-glow-p1` / `text-retro-p2 text-glow-p2`, where
`xPairs = board.filter(c => c === 'X').length / 2` (and same for O).

### Mobile/touch

- `touch-action: manipulation` on the grid container (avoid double-tap-zoom delay on rapid
  matching taps).
- `select-none` on cells (prevent text-selection highlight on fast repeated taps).
- Tap targets: at `max-w-md` (≈448px) with 6 columns and small gaps, each cell is ~65–72px —
  comfortably above the ~44px touch-target minimum even on narrow phones where the container
  shrinks to viewport width.
- No drag/hover-dependent interaction (unlike Word Hunt) — pure tap, so touch and mouse/keyboard
  (button focus + Enter/Space, free via native `<button>`) both work with zero extra plumbing.

### Theming

Every color via `retro-*` Tailwind tokens (`retro-card`, `retro-surface`, `retro-border`,
`retro-dim`, `retro-tint-p1`/`tint-p2`, `retro-p1`/`p2`, `text-glow-p1`/`p2`) or `currentColor`
inside the card-back SVG (inherits from a `text-retro-dim` className, same pattern as
`GameIcons.jsx`). **No hex, ever.** `Avatar` already handles its own theming (see
`src/components/Avatar.jsx`).

---

## 6. Integration touchpoints

Exact, copy-pasteable edits for every shared file. **No `Game.jsx` changes** — Pairs is a
standard registry entry (`custom` is not set), so it flows through `Game.jsx`'s existing generic
`cfg.BoardComponent` / `cfg.applyMove` / `cfg.boardProps` rendering path with zero per-game
branches (confirmed: the render block at `Game.jsx` ~line 1406–1415 already spreads
`cfg.boardProps(game)` onto `<cfg.BoardComponent>` for every non-custom game type). **No
`database.rules.json` changes** — `games/$gameId` is already permissive for arbitrary new keys
except `players` (verified 2026-07, per `docs/prds/README.md`).

### `src/components/GameIcons.jsx` — add this icon

```jsx
export function PairsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* 2×2 card grid — top-left & bottom-right "matched" (lit + face mark), the
          other two still face-down (dim) */}
      <rect x="2"  y="2"  width="9" height="9" rx="1.5" fill="currentColor" opacity="0.35" />
      <rect x="13" y="2"  width="9" height="9" rx="1.5" fill="currentColor" opacity="0.2" />
      <rect x="2"  y="13" width="9" height="9" rx="1.5" fill="currentColor" opacity="0.2" />
      <rect x="13" y="13" width="9" height="9" rx="1.5" fill="currentColor" opacity="0.35" />
      <rect x="5"  y="5"   width="3" height="3" fill="currentColor" opacity="1" />
      <rect x="16" y="16"  width="3" height="3" fill="currentColor" opacity="1" />
    </svg>
  )
}
```

### `src/lib/games.js` — imports

Add to the existing icon import block:

```js
import {
  TicTacToeIcon, ConnectFourIcon, HangwomanIcon, DotsAndBoxesIcon, SosIcon,
  SimonIcon, ChimpIcon, NumberMemoryIcon, VisualMemoryIcon, ReactionIcon, AimIcon,
  TypingIcon, MathIcon,
  GomokuIcon, ReversiIcon, OrderChaosIcon, DiceIcon, TwoTruthsIcon, BluffIcon,
  WavelengthIcon, FibbageIcon, SpyfairIcon, PongIcon, SnakeIcon,
  TronIcon, SumoIcon, SpaceDuelIcon, ChainReactionIcon,
  WordDuelIcon, PairsIcon,
} from '../components/GameIcons'
```

Add two new standalone imports (near the other logic-module imports, e.g. right after the
`ChainReactionBoard` import):

```js
import PairsBoard from '../components/PairsBoard'
import {
  PAIRS_CELL_COUNT,
  generatePairsDeck,
  normalizePairsDeck,
  normalizePairsFlipped,
  applyPairsMove,
  getPairsWinner,
} from './pairsLogic'
```

### `src/lib/games.js` — registry entry

Append to the `GAME_TYPES` array (position doesn't matter functionally; suggested: right after
the `wordduel` entry, i.e. the new last entry):

```js
  {
    type: 'pairs', label: 'PAIRS',
    desc: 'match the hidden pairs', Icon: PairsIcon,
    badge: 'PR', maxWidth: 'max-w-md',
    category: 'memory',
    addedAt: '2026-07-11',
    durationMin: 6, tags: ['thinky'], solo: true,
    boardSize: PAIRS_CELL_COUNT,
    getMoveIndex: (board, index) => (board[index] ? -1 : index),
    BoardComponent: PairsBoard,
    applyMove: ({ board, game, index, symbol }) => {
      const deck = normalizePairsDeck(game.pairsDeck)
      const flipped = normalizePairsFlipped(game.pairsFlipped)
      const applied = applyPairsMove(board, deck, flipped, index, symbol)
      if (!applied) return null
      return {
        updates: {
          board: applied.board,
          pairsFlipped: applied.flipped,
          currentTurn: applied.turnStays ? symbol : (symbol === 'X' ? 'O' : 'X'),
        },
        result: getPairsWinner(applied.board),
      }
    },
    boardProps: (game) => ({
      deck: normalizePairsDeck(game.pairsDeck),
      flipped: normalizePairsFlipped(game.pairsFlipped),
    }),
  },
```

### `src/lib/games.js` — `FIELD_NULLS` additions

Add anywhere inside the `FIELD_NULLS` object literal (suggested: right after the existing
`crLastMove: null,` line, at the end):

```js
  pairsDeck: null, pairsFlipped: null,
```

### `src/lib/games.js` — `freshGameState()` branch

Insert as a new `if (gameType === 'pairs') { ... }` branch, anywhere among the other per-type
branches before the final catch-all `return { ...FIELD_NULLS, board: Array(cfg.boardSize)... }`
(suggested: right after the `wordduel` branch):

```js
  if (gameType === 'pairs') {
    return { ...FIELD_NULLS, boxes: null, round: null, currentTurn: 'X',
      board: Array(PAIRS_CELL_COUNT).fill(''),
      pairsDeck: generatePairsDeck(),
      pairsFlipped: null }
  }
```

### `src/lib/rules.js` — entry

Add to the `GAME_RULES` object:

```js
  pairs: {
    objective: 'Find more matching pairs than your opponent on the 6×6 grid of 18 hidden pairs.',
    howToPlay: [
      'Tap any two face-down cards to flip them.',
      'Match the pair and you claim it — plus you immediately go again.',
      'Miss, and both cards stay face-up until your opponent\'s first tap of their turn, then it flips to them.',
    ],
    win: 'Claim 10 of the 18 pairs to win instantly. If the board fills first, whoever claimed more pairs wins — 9–9 is a draw.',
  },
```

### `src/lib/demoBots.js` — dispatch

Add the import (with the other logic-module imports at the top):

```js
import { computePairsBotMove } from './pairsLogic'
```

Add one line to the `pickBotMove` switch:

```js
    case 'pairs':        return computePairsBotMove(game, botSymbol)
```

### `src/pages/Demo.jsx` — wiring

Add `PairsIcon` to the existing `GameIcons` import block (same list already imported there —
add `PairsIcon` alongside `WordDuelIcon`).

Add one entry to the `DEMOS` array, in the "vs-AI board games" group (append after the
`chainreaction` line — Pairs is registry category `memory` but, like Dots & Boxes/SOS/Chain
Reaction, needs a real turn-taking adversarial bot, not the bespoke single-player "how far can
you get" demo components used by Simon/Visual Memory/Number Memory/Chimp, none of which have a
`pickBotMove` case):

```js
  { type: 'pairs',         short: 'PAIRS',          Icon: PairsIcon,          Component: () => <BotBoardDemo type="pairs" /> },
```

No other `Demo.jsx` changes — `BotBoardDemo` is fully generic over the registry (confirmed by
reading its implementation: it derives everything from `getGameConfig(type)`, `freshGameState`,
`cfg.applyMove`, `cfg.boardProps`, and `pickBotMove`).

---

## 7. Unit tests (`src/lib/pairsLogic.test.js`)

**`generatePairsDeck`**
- Returns 36 entries.
- Every face in `PAIRS_FACES` appears exactly twice (run once is enough — structural, not
  randomness-dependent).
- No face outside `PAIRS_FACES` appears.
- `PAIRS_FACES.length === 18`.

**`normalizePairsDeck` / `normalizePairsFlipped`**
- Array input passes through unchanged.
- `null`/`undefined` → `[]`.
- Firebase numeric-keyed object (e.g. `{0: 'a', 2: 'b'}`, simulating a sparse write) → sorted
  array by numeric key.

**`applyPairsMove`**
- Illegal: `board[i]` already `'X'`/`'O'` → `null`.
- Illegal: `index` already in `flipped` (both the `flipped.length === 1` self-retap case and the
  `flipped.length === 2` retap-a-stale-mismatch-card case) → `null`.
- Illegal: `index` out of range (`-1`, `36`) → `null`.
- First flip, `flipped = []`: returns `{ board: <unchanged>, flipped: [i], turnStays: true, matched: false }`.
- First flip clearing a leftover mismatch, `flipped = [j, k]` (two elements, tapping a third,
  different, unclaimed cell): returns `{ flipped: [i], turnStays: true, ... }` — old two indices
  are discarded, board unchanged.
- Second flip, match (`deck[j] === deck[i]`): returns `{ board: <both cells set to symbol>,
  flipped: null, turnStays: true, matched: true }`.
- Second flip, mismatch: returns `{ board: <unchanged>, flipped: [j, i], turnStays: false, matched: false }`
  (order: originally-held index first, newly-tapped index second).

**`getPairsWinner`**
- Fewer than 10 pairs either side, board not full → `null`.
- Exactly 9 pairs for X (18 cells) and board not full (impossible in practice since 9+9=18 is a
  full board, but assert the boundary anyway with a synthetic 9-X/0-O board that isn't
  full) → `null` (confirms the clinch threshold is a hard `>= 10`, not `>= 9`).
- X reaches exactly 10 pairs (20 X-cells), board not full → `{ winner: 'X' }` (clinch fires
  before the board fills).
- Symmetric case for O.
- Board fully claimed 9–9 (18 X-cells, 18 O-cells) → `{ winner: 'draw' }`.

**`computePairsBotMove`**
- Legality fuzz: run ~200 iterations over randomized synthetic `{ board, pairsDeck, pairsFlipped }`
  states (some cells claimed, `pairsFlipped` 0/1/2 entries) and assert the returned index (when
  non-null) is always a currently-unclaimed cell not already in `flipped`.
- When `flipped.length === 1`: mock `Math.random` to force `< RECALL_P` → asserts the function
  returns the index of the true twin (constructed test deck where the twin's location is known).
- When `flipped.length === 1` and `Math.random` mocked `>= RECALL_P`: asserts the returned index
  is a legal cell that is **not** `flipped[0]` (doesn't assert it avoids the twin — a random pick
  landing on the twin anyway is fine, just not guaranteed).
- When `flipped.length` is `0` or `2`: returns some legal, unclaimed, non-flipped index.
- Returns `null` when there are zero legal cells (fully claimed board, `flipped = []`).

Existing repo-wide `npm test` picks this up automatically (`src/lib/pairsLogic.test.js` matches
the existing Vitest glob); add it to the `## Commands` suite list mentioned in `CLAUDE.md` is
**not** required by this task (README/CLAUDE.md maintenance is out of scope for this PRD).

---

## 8. Manual verification script

Per `CLAUDE.md`: same-browser tabs share `playerId` — the second player **must** be a
private/incognito window (or a different browser).

1. **Browser A** (normal window): create a room, pick Pairs from the catalog (or switch an
   existing room to Pairs from an end-of-game screen). Confirm the 6×6 grid renders, all cards
   face-down.
2. **Browser B** (incognito): open the invite link, join as O. Confirm both windows show the
   identical grid (same deck, cards still face-down — the raw faces should *not* be visible to
   either player yet).
3. As X: tap a card → it flips face-up (animated) in **both** windows simultaneously; turn stays
   X's (`GameStatus` should keep showing X's turn — nothing passes to O yet).
4. As X: tap a **claimed-looking already-clicked** same card again → nothing happens (button
   disabled, no Firebase write, no sound).
5. As X: tap a second, non-matching card → both cards stay face-up in both windows; turn passes
   to O (`GameStatus`/turn indicator updates in both windows).
6. As O: tap a **third**, different, unclaimed card → confirm the two stale mismatched cards
   flip back to face-down at the same instant O's new pick flips face-up (single Firebase write,
   `pairsFlipped` replaced wholesale). Confirm O still owes a second tap (turn hasn't passed back
   yet).
7. Deliberately match a pair (use dev tools / the bot in `/demo` first to learn face layout if
   needed, or just play until a natural match happens): confirm both cells get the mover's tint +
   corner tag, stay permanently face-up, and **the same player's turn continues** (no turn-pass
   toast/indicator change).
8. Play to either a clinch (10 pairs one side) or a full board (9–9): confirm the standard
   end-of-round screen appears with the correct winner/draw, `scores` increments correctly, and
   the rematch (**PLAY AGAIN** — keeps score) / switch-game proposal flow works exactly like
   every other board game.
9. **Reload mid-round** in one browser: confirm the board/deck/flipped state rehydrates exactly
   (no secret client-only state exists for Pairs — unlike Hangwoman, there's nothing to lose on
   reload).
10. **Spectator:** open the same invite link in a third context (or just don't claim a seat) —
    confirm cards render read-only (no click response) and update live as X/O play.
11. **Switch games:** from Pairs' end screen, switch to a different game type; confirm
    `pairsDeck`/`pairsFlipped` are gone from the Firebase node (check via the Firebase console or
    simply confirm the new game's board renders cleanly with no leftover Pairs state).
12. **`/demo` bot mode:** visit `/demo/pairs` (or select PAIRS from the demo picker); confirm you
    can play a full round against the CPU, including matches, mismatches, extra turns, and a
    final win/draw screen with NEXT ROUND / PLAY AGAIN buttons (`BotBoardDemo`'s existing generic
    end-screen).

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Up-front deck leak via Firebase inspection (see §Trust model) | Accepted, documented, consistent with the platform's honest-client tier; a commit-reveal redesign is out of scope for v1 and noted as a possible stretch. |
| Opponent's individual flip taps (non-matching) don't trigger the generic remote-move sound (only matches do — board only changes on a match) | Documented as inherited/expected in §4; the card flip animation itself is the primary remote-move feedback. Not a regression to fix — same class of gap exists for any `applyMove` game whose board doesn't change every sub-step (Pairs is simply the first one to have that shape). |
| 36-card 6×6 grid could feel visually dense / small tap targets on narrow phones | `max-w-md` + `aspect-square` cells keep targets ≥ ~55–72px at typical phone widths; verify on a real device during manual testing (script step 1–2). If too small in practice, a fast-follow could drop to `max-w-sm` with slightly larger card art, or offer a 4×4/24-card "quick" variant later (`variantOf` pattern, like Ultimate TTT/C4 Pop Out) — not needed for v1. |
| Avatar sprite reuse means Pairs card faces look identical to profile-picker avatars, which could feel like "borrowed" art rather than bespoke game content | Deliberate, brief-mandated choice (avatars.js has ≥18 keys) — keeps bundle size flat (no new art assets) and the pixel-art aesthetic perfectly consistent with the rest of the platform. |
| Bot's first-flip 0.15/0.85 "setup" split is currently a no-op (see implementation note in `pickFirstFlip`) | Documented explicitly in code + this PRD so it isn't mistaken for a bug later; harmless either way since both branches are legal, symmetric picks. |
| `getPairsWinner` computed on every move including non-board-changing flips | Cheap (`Array.prototype.filter` over 36 elements) and matches the existing `getSosWinner`/`getDotsAndBoxesWinner`/`getReversiWinner` precedent of unconditional post-move winner checks — no perf concern. |
