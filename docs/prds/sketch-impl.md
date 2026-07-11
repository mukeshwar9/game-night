# SKETCH — implementation delta-spec (2P-capable draw & guess)

Base design: `docs/prds/sketch.md`. This document is the **authoritative, implementation-ready
spec** — it supersedes the base PRD wherever the two disagree (2-player support, the dropped
`revealWord`/localStorage backup, `wordPattern` vs `wordLen`, timer mechanics). A builder agent
should need to make **zero** design decisions reading this file. Integration type **D** (custom
party page), per `docs/prds/README.md`.

Registry: `{ custom: true, nPlayer: true, minPlayers: 2, maxPlayers: 8 }`. Category `party`.

---

## 1. Overview and rules

**Match:** every seat draws `cyclesFor(playerCount)` times — **3** cycles if the match has
exactly 2 players, **2** cycles otherwise (override to the base PRD's flat "2 cycles"). Total
rounds = `cyclesFor(playerCount) × playerCount`. Highest total score wins; **ties share the win**
(every player at the max score is a co-winner).

**Round — one artist, everyone else guesses:**

1. **Choosing (15 s — `CHOOSE_MS`):** the artist sees 3 word options (one per difficulty tier)
   drawn from the deck and picks one. If the artist's own local countdown hits 0 before they
   pick, their client **auto-picks `options[0]`**.
2. **Drawing (75 s — `DRAW_MS`):** the artist draws on the shared canvas (no letters/numbers/
   words allowed as a house rule, unenforced — same honor-system trust tier as the rest of the
   platform). Guessers submit free-text guesses via a single input box. The word is shown to
   guessers as blanks derived from `wordPattern` (see §4). Correct guessers are locked in
   immediately, see the actual word, and wait; incorrect guesses appear in a public chat feed.
   Guesses are **only accepted while `phase === 'drawing'`**. The round ends early once every
   *active* (online) guesser has guessed correctly.
3. **Reveal (6 s — `REVEAL_MS`):** the word is shown to everyone (derived client-side — see
   §1a), per-round score deltas are displayed, and the next artist is announced. Scoring happens
   exactly once, atomically, the instant the round transitions into reveal (§2 write-ownership
   table) — there is no separate "reveal → scored" sub-step.

After the final reveal of the match expires, the host writes `status: 'finished'` (the last
round's `round` node is **left in place**, not nulled, so the finished screen can still show the
last round's deltas if desired). The finished screen shows final standings, a **NEW MATCH**
button (`onNewMatch` — resets scores, standard shared machinery) and the game switcher.

### 1a. Trust model — self-grading via salted hash, word derivable by everyone (override)

The base PRD had the artist write `revealWord` at reveal time, with a localStorage backup for
reload safety. **This spec drops both.** Instead:

- On picking a word, the artist's client computes `commit(normalize(word))` (from `src/lib/
  commit.js` — unchanged) and publishes **both `hash` and `salt`** to `round.commitment`, plus
  `round.wordPattern` (public token-length pattern, computed from the raw word).
- Each guesser's client verifies its own guess by calling `verifyReveal(commitment.hash,
  normalize(guess), commitment.salt)` locally — a match means correct. No round-trip, no artist
  dependency for grading.
- Because `round.options` (the 3 *candidate* deck indices offered to the artist) and
  `round.commitment` (hash + salt) are **both public**, **any client — including the artist after
  a reload — can derive the chosen word** by hashing each of the 3 candidates with the salt and
  checking which one matches the public hash. This is `deriveWord()` in `sketchLogic.js` (§3).
  There is therefore **no artist-side word storage at all** (no sessionStorage, no localStorage,
  no `revealWord` Firebase field) — the artist recovers the word on reload exactly the same way
  a guesser or spectator would, by deriving it.
- **Residual leak (accepted, same tier as Fibbage):** since the salt is published immediately
  (not withheld until reveal, unlike Wavelength/Fibbage), a player willing to open devtools can
  derive the real word themselves **before the round ends** by hashing the 3 public candidates.
  The deck also ships in the client bundle regardless. This is the same accepted bundle-leak
  trust tier documented in `docs/prds/README.md` §Trust models — it only fails to defend against
  a technically capable cheater, not a casual spectator. Copy the caveat comment into
  `src/lib/decks/sketch.js` verbatim (see §3e).

### 1b. Edge cases (resolved)

- **Mid-match join is unsupported** (PRD correction — override #6): the shared join flow in
  `Game.jsx` only allows claiming a `players/{uid}` seat while `status === 'waiting'` (confirmed
  at `Game.jsx:249`, unchanged, no sketch-specific code needed). A visitor who opens the link
  mid-match is a **spectator** (`mySeat` not in `players`) until the match ends and a new one
  starts, at which point they can seat up from the lobby like anyone else.
- **`round.order` is a fixed snapshot** taken once at match start (`startRound`) and never
  mutated — if a player leaves mid-match they stay in the rotation (their turn gets skipped via
  the offline-artist mechanism, §2) and keep whatever score they'd already earned. This matches
  the base PRD's own framing of `order` as "seat order snapshot for the match." If every guesser
  leaves and only the artist remains online, the round still resolves normally via the natural
  `endsAt` timeout (0 correct guessers, §4's `roundDeltas` returns `{}`) — no special "too few
  players" abort path, matching existing party-game precedent (Wavelength/Fibbage don't have one
  either).
- **No repeated words within a match** (override #5): every round's advance carries forward
  `used: [...(round.used||[]), ...round.options]` (all 3 *offered* candidates, not just the
  chosen one) so pickOptions never re-offers a word already seen this match.
- Guesses/chat text: no profanity filtering (out of scope v1, same as base PRD — private rooms,
  invited friends).
- No solo bot / no `/demo` gameplay (matches every other party game — `PartyGameCard` fallback,
  §6).

---

## 2. Data model

Everything lives under `games/{gameId}/round`. **No new top-level Firebase keys, no
`FIELD_NULLS` changes** — confirmed: the generic `nPlayer` branch of `freshGameState()`
(`src/lib/games.js`, currently `if (cfg.nPlayer) return { ...FIELD_NULLS, board: null, boxes:
null, currentTurn: null, round: null }`) already clears everything Sketch uses, because it's all
inside `round`. No `database.rules.json` changes needed — confirmed: `games/$gameId` is fully
open to any authed client except the `players` subtree (see `database.rules.json`), which Sketch
doesn't touch beyond the existing generic join flow.

```
games/{gameId}:
  gameType: 'sketch'
  status: 'waiting' | 'playing' | 'finished'
  players: { [uid]: { name, joinedAt, playerId, online, avatar } }   // generic nPlayer shape, unchanged
  scores:  { [uid]: number }                                         // generic party shape, unchanged
  round: {
    phase:      'choosing' | 'drawing' | 'reveal',
    cycle:      number,               // 1-indexed; bumps when the seat order wraps
    artist:     uid,
    order:      [uid, ...],           // fixed snapshot from startRound, never mutated
    used:       [number, ...],        // deck indices already offered this match (any tier)
    options:    [number, number, number] | null,  // 3 deck indices; null until artist publishes
    commitment: { hash: string, salt: string } | null,  // set when artist picks a word
    wordPattern: string,              // e.g. "5" or "3 3"; '' until artist picks
    endsAt:     epoch-ms,             // current phase's deadline (see §4 timers)
    strokes:    { [pushId]: { c: 0-7, w: 1|2|3, p: [int, ...] } },  // artist-only writes
    chat:       { [pushId]: { uid, text } },        // wrong guesses only
    correct:    { [uid]: { at: number } },          // uid's own write, once
    scored:     boolean,              // true once this round's deltas were applied (idempotent gate)
  }
```

No field above needs `FIELD_NULLS` — `round: null` (already in the generic nPlayer branch)
clears the whole subtree in one write.

### Write-ownership table

Every write below either (a) is a **plain `update()`/`push()`/`remove()`** because exactly one
uid can ever write that path, or (b) is a **`runTransaction`** because two clients could
plausibly race for the same write and correctness requires a compare-and-swap. Every transaction
below computes its result **entirely from the `current` value the transaction callback
receives**, never from an outer-scope/stale React snapshot — this is what makes retries safe.

| Phase | Actor | Path | Write kind + guard | Notes / races |
|---|---|---|---|---|
| lobby (`waiting`) | any client | `players/{uid}` | existing generic `runTransaction` guarded on `cur == null` (unchanged, `Game.jsx:251`) | — |
| lobby | host | `games/{id}` (`status`, `round`, …) | plain `update()` from `handleNStart` → `cfg.startRound(players)` (existing generic code, unchanged) | Two host tabs double-clicking START both write the *same* deterministic initial shape — harmless. |
| choosing | **artist** | `games/{id}` → `round.options`, `round.endsAt` | `runTransaction` guarded on `cur.round.phase==='choosing' && cur.round.artist===myUid && !cur.round.options` | Prevents a delayed/stale write from a *previous* artist turn (see race below) from landing after the host has already skipped past it. |
| choosing | **artist** | `games/{id}` → `round.commitment`, `round.wordPattern`, `round.phase:'drawing'`, `round.endsAt` | `runTransaction` guarded on `cur.round.phase==='choosing' && cur.round.artist===myUid`, plus a local `pickedRef` guard against a double-fire from the *same* client (button click racing the auto-pick timer) | **RACE (flagged):** if this were a plain `update()` instead of a transaction, a network-delayed pick from an artist whose turn was *just skipped* by the host (see next row) could land afterwards and clobber the *new* artist's round. The `artist===myUid` guard makes a stale write a no-op. |
| choosing | **host** (manual button) | `games/{id}` → whole `round` (via `nextRoundState`, deltas `{}`) | `runTransaction` guarded on `cur.round.phase==='choosing'` | Visible only once `now() >= (round.endsAt||0) + SKIP_CHOOSING_GRACE_MS` (5 s) — this grace is deliberately *longer* than the artist's own auto-pick deadline so a legitimately-connected-but-slightly-slow artist's auto-pick always wins the race in normal conditions; only a truly stalled/offline artist ever sees the host's button fire first. **Host==artist overlap:** if the host is also the stalled artist, they can skip their own turn — harmless, forfeits only their own draw. |
| drawing | **artist** (only) | `round/strokes/{pushId}` | `push()`, unguarded (single writer) | — |
| drawing | **artist** | `round/strokes/{lastKey}` | `remove()` (undo) | Removes the *single* most-recently-pushed key — since strokes are ~100 ms segments, undo may only remove part of one continuous pen stroke. Intentional v1 simplification (matches base PRD wording literally: "removes its own last stroke key"). |
| drawing | **artist** | `round/strokes` | `set(null)` (clear) | — |
| drawing | **guesser** | `round/chat/{pushId}` | `push()` — wrong guess, plaintext, unguarded (append-only) | — |
| drawing | **guesser** | `round/correct/{uid}` | plain `update()` guarded by a local `correctSentRef` (own uid only, mirrors Fibbage's `subPublished`/`revealPublished` ref pattern) | Only the guessing player themself ever writes their own key; a same-client double-fire is blocked by the ref. A genuine 2-tabs-same-uid race just overwrites `at` with a later value — accepted low-risk edge case (repo convention: same-browser tabs share `playerId`). |
| drawing | **host** | `games/{id}` → `scores`, `round.scored:true`, `round.phase:'reveal'`, `round.endsAt` (+`REVEAL_MS`) | `runTransaction` guarded on `cur.round.phase==='drawing'`; computes `roundDeltas(...)` **inside the callback** from `cur.round.correct` and `activeGuessers(cur.players, cur.round.order, cur.round.artist)` (live values, not stale props) | Triggered automatically by a host-side watcher when `now() >= round.endsAt` **or** every active guesser has a `round.correct` entry. **RACE (flagged) — double-advance:** two near-simultaneous triggers (timeout tick + all-correct effect) both attempt this transaction; RTDB's compare-and-swap means only the first to commit changes anything, the second's guard (`phase==='drawing'`) fails and it's a no-op. **RACE (flagged) — double-score:** impossible by construction — deltas are computed and applied atomically in the same transaction that also flips the phase, so there's no window between "advance" and "score" for a second call to interleave. |
| drawing | **host** (manual button) | *same path as the row above* | *same transaction*, called directly on click | Visible once the artist has been observed `online === false` continuously for `ARTIST_OFFLINE_DRAWING_MS` (10 s) while `phase==='drawing'`. This does **not** void the round — it just triggers the same scoring transition early, crediting whoever already guessed correctly (fair: some guessers may have already gotten it before the artist vanished). |
| drawing | *(accepted residual race)* | `round/correct/{uid}` | — | A guesser's correct-write that was in flight over the wire at the exact moment the host's transaction above commits may land a few ms *after* `phase` has already flipped to `'reveal'`. It is not re-scored (the host guard prevents re-firing). Documented accepted risk, §9 — same class as any last-instant tie in the existing codebase. |
| reveal | *(any client)* | — (read-only) | `deriveWord()` called locally by everyone, no write | — |
| reveal | **host** | `games/{id}` → either `status:'finished'` **or** the whole `round` (via `nextRoundState`) | `runTransaction` guarded on `cur.round.phase==='reveal' && cur.round.endsAt===expectedEndsAt` | Fires automatically once `now() >= round.endsAt`. The `endsAt` equality guard is defense-in-depth against a stale closure double-firing (the `phase==='reveal'` guard alone is already sufficient for correctness, since a committed transition changes `phase`, but both are specified per the brief). Uses `matchOver(round.order, round.artist, round.cycle)` to decide finish vs. next round. |
| finished | any seated player | `games/{id}` (`...freshGameState('sketch')`, `status:'waiting'`, `scores:{}`) | existing generic `applyNNewMatch` (`onNewMatch`), unchanged | Standard shared machinery — no sketch-specific code. |
| finished | any seated player | `games/{id}.gameType` etc. | existing generic `applySwitchGame` (`onSwitchGame`), unchanged | Standard shared machinery. |

**Every host-initiated transition that sets a fresh `endsAt` computes `now() + PHASE_MS` once,
*before* calling `runTransaction`, and closes over that single value inside the callback** —
never call `Date.now()`/`now()` fresh on every retry attempt inside a transaction body (it would
drift the deadline slightly on each retry). `now()` here is the corrected server-time function
from `useServerNow()` (§5).

---

## 3. New files

### 3a. `src/lib/decks/sketch.js`

```js
export const SKETCH_WORDS = [ /* ~250 entries, see §3e for the full list */ ]
```
Exports: `SKETCH_WORDS: { word: string, tier: 1 | 2 | 3 }[]`. No other exports. Bundle-leak
caveat comment required (verbatim text in §3e).

### 3b. `src/lib/sketchLogic.js`

No DOM, no Firebase, no React — pure functions + constants, mirrors `fibbageLogic.js`/
`wavelengthLogic.js`. Vitest suite: `src/lib/sketchLogic.test.js`.

```js
// Re-exported, not duplicated — see docs/prds/README.md trust-model note on avoiding
// copy-pasted seat/shuffle helpers. mulberry32 stays private to fibbageLogic.js (not
// exported); pickOptions only needs seededShuffle.
export { seatOrder, hashString, seededShuffle } from './fibbageLogic'
import { seededShuffle } from './fibbageLogic'
import { verifyReveal } from './commit'

// ---- Tunable constants -----------------------------------------------------
export const CHOOSE_MS = 15000
export const DRAW_MS = 75000
export const REVEAL_MS = 6000
export const SKIP_CHOOSING_GRACE_MS = 5000
export const ARTIST_OFFLINE_DRAWING_MS = 10000

export const ARTIST_PTS_PER_CORRECT = 25
export const GUESSER_BASE_PTS = 100
export const GUESSER_STEP_PTS = 10
export const GUESSER_FLOOR_PTS = 50

export const SOLO_GUESSER_BASE_PTS = 50   // 2-player (exactly 1 guesser) variant
export const SOLO_GUESSER_BONUS_MAX = 50
export const SOLO_ARTIST_DIVISOR = 2

// ---- normalize(str) -> string ----------------------------------------------
// lowercase, trim, collapse internal whitespace to single spaces, then STRIP
// (delete, not replace-with-space) any character that isn't a Unicode letter,
// digit, or space — so "Writer's Block" -> "writers block" (apostrophe just
// disappears, doesn't fracture the word into extra tokens).
export function normalize(str) { /* see pseudocode §4 */ }

// ---- wordPattern(word) -> string -------------------------------------------
// Space-separated token lengths of the RAW word (whitespace-split, no
// punctuation stripping): "hot dog" -> "3 3", "sunglasses" -> "10",
// "writer's block" -> "9 5" (apostrophe counts toward its token's length here
// — this is the PUBLIC blank-pattern, deliberately unrelated to normalize()).
export function wordPattern(word) { /* see pseudocode §4 */ }

// ---- quantize(fraction) -> int 0-255, dequantize(int) -> fraction 0-1 -----
// fraction is a pointer position as a 0..1 fraction of the canvas's width or
// height. Roundtrip-safe for every integer 0..255.
export function quantize(fraction) { /* see pseudocode §4 */ }
export function dequantize(q) { /* see pseudocode §4 */ }

// ---- pickOptions(deck, seed, used = []) -> [i, j, k] -----------------------
// One deck index per tier (1, 2, 3), deterministic from `seed`, excluding any
// index already in `used`. Falls back to any other unused/unchosen index if a
// tier's pool is empty; falls back to full reuse (ignoring `used`) only if the
// ENTIRE deck has been exhausted (should never happen in practice with a
// ~250-word deck). See pseudocode §4.
export function pickOptions(deck, seed, used = []) { /* ... */ }

// ---- nextArtist(order, artist) -> uid --------------------------------------
// Next uid in `order` after `artist`, wrapping to order[0]. Falls back to
// order[0] if `artist` isn't found in `order` (defensive).
export function nextArtist(order, artist) { /* ... */ }

// ---- cyclesFor(playerCount) -> number --------------------------------------
// 3 when playerCount === 2, else 2.
export function cyclesFor(playerCount) { /* ... */ }

// ---- matchOver(order, artist, cycle) -> boolean ----------------------------
// True when the round that just finished (this artist, this cycle) was the
// LAST round of the match: artist is the last seat in `order` AND
// cycle >= cyclesFor(order.length).
export function matchOver(order, artist, cycle) { /* ... */ }

// ---- nextRoundState(round) -> { finished: true } | { finished: false, round } --
// Pure computation of the next round's seed object given the round that just
// ended (used for BOTH a normal reveal-expiry advance AND a void/skip). Caller
// adds `endsAt: now() + CHOOSE_MS` before writing `round` (this function does
// not touch wall-clock time). `used` carries forward round.used + round.options
// (the 3 offered candidates, whether or not the chosen one was ever confirmed).
export function nextRoundState(round) { /* ... */ }

// ---- activeGuessers(players, order, artist) -> uid[] -----------------------
// order minus artist, filtered to online (players[id]?.online !== false);
// falls back to the full guesser list if NONE are online (so the early-end
// check never permanently excludes everyone — the endsAt timeout is the real
// safety net regardless of this fallback).
export function activeGuessers(players, order, artist) { /* ... */ }

// ---- roundDeltas({ guesserIds, correct, artistId, endsAt }) -> { [uid]: pts } --
// Branches on guesserIds.length:
//   0 guessers: {} (shouldn't happen; defensive)
//   1 guesser (2-player variant): if they didn't guess, {} (0/0). Otherwise
//     ratio = clamp01((endsAt - correct[uid].at) / DRAW_MS)
//     guesserPts = SOLO_GUESSER_BASE_PTS + round(SOLO_GUESSER_BONUS_MAX * ratio)
//     artist gets floor(guesserPts / SOLO_ARTIST_DIVISOR)
//   2+ guessers: rank everyone with a `correct` entry by `at` ascending (tie
//     -> uid string compare ascending), award
//     max(GUESSER_FLOOR_PTS, GUESSER_BASE_PTS - i*GUESSER_STEP_PTS) by rank i
//     (0-indexed); artist gets ARTIST_PTS_PER_CORRECT * (number who guessed
//     correctly). If nobody guessed correctly, {} (artist also gets 0).
// Missing keys in the returned object mean "+0" — caller merges additively.
export function roundDeltas({ guesserIds, correct, artistId, endsAt }) { /* ... */ }

// ---- deriveWord(deckWords, options, commitment) -> Promise<string | null> --
// For each candidate index in `options`, hash deckWords[i].word (normalized)
// against commitment via verifyReveal(commitment.hash, normalize(word),
// commitment.salt); returns the first match, or null if none verify (should
// never happen with consistent data).
export async function deriveWord(deckWords, options, commitment) { /* ... */ }
```

### 3c. `src/components/SketchCanvas.jsx`

```jsx
export default function SketchCanvas({ gameId, isArtist }) { ... }
```

**That's the entire props contract** — two props, no more. The component is fully
self-contained: it owns its own Firebase subscription, its own toolbar state, and all
strokes/undo/clear writes. Non-artists get the exact same component with `isArtist={false}`
(read-only render, no toolbar, no pointer handlers attached).

- **Subscription (own, independent of the parent's whole-game `onValue`):**
  ```js
  useEffect(() => {
    const strokesRef = ref(db, `games/${gameId}/round/strokes`)
    const local = {}
    const unAdd = onChildAdded(strokesRef, snap => { local[snap.key] = snap.val(); setStrokes({ ...local }) })
    const unRem = onChildRemoved(strokesRef, snap => { delete local[snap.key]; setStrokes({ ...local }) })
    return () => { unAdd(); unRem() }
  }, [gameId])
  ```
  `onChildAdded` fires once per pre-existing child immediately on subscribe (replay-on-mount is
  automatic — a late-joining spectator's canvas reconstructs itself for free, no special code).
  When the parent replaces the whole `round` object between rounds (§2), Firebase diffs the
  subtree and this listener receives `child_removed` for every old stroke — the canvas empties
  itself automatically with no round-boundary/remount key needed.
- **Rendering:** SVG `viewBox="0 0 256 256"`, `shapeRendering="crispEdges"`, background
  **hardcoded `#ffffff`** (part of the same sanctioned theming exception as the palette — a
  themed dark background would make the fixed-palette strokes illegible; the outer frame/toolbar
  chrome around the canvas still themes normally via `retro-*`/`--c-*`). Render
  `Object.entries(strokes).sort(([a], [b]) => (a < b ? -1 : 1))` (push keys sort chronologically)
  as one `<polyline>` per entry: `points` = raw quantized ints paired up (no dequantize needed
  for rendering — the 0-255 grid IS the viewBox), `stroke={PALETTE[c]}`,
  `strokeWidth={BRUSH_WIDTHS[w]}`, `fill="none"`, `strokeLinecap="round"`, `strokeLinejoin="round"`.
- **Pointer capture (artist only):** `onPointerDown` calls `e.target.setPointerCapture(e.pointerId)`,
  starts a local point buffer seeded with the down position; `onPointerMove` (while down) appends
  quantized points to the buffer; `onPointerUp`/`onPointerCancel` ends the stroke and flushes
  immediately. `touch-action: none` via inline `style` on the SVG element (mandatory — without it,
  touch drags scroll the page instead of drawing).
- **Segment batching:** a `setInterval(flush, 100)` while `isArtist && pointerDown` pushes the
  buffered points (since the last flush) as one new child under `round/strokes`
  (`{ c: colorIndex, w: brushSize, p: [x0,y0,x1,y1,...] }`), then **resets the buffer to just the
  last point** (not empty) so the next segment starts contiguously with no visual gap. On
  pointer-up, flush any remaining buffered points immediately (even if <100ms since the last
  flush) so the last few pixels aren't dropped.
- **No separate local-optimistic preview layer.** The artist's own `onChildAdded` fires for their
  own pushes near-instantly (Firebase's local-write echo), so the same `strokes` state used for
  rendering everyone else's view is sufficient for the artist's own feedback too, bounded by the
  same ~100 ms flush cadence. Do not build an extra "live stroke" buffer — it's unneeded
  complexity for a deliberately-accepted 100ms feel.
- **Undo:** `const keys = Object.keys(strokes).sort(); const last = keys[keys.length - 1]; if
  (last) remove(ref(db, \`games/${gameId}/round/strokes/${last}\`))`.
- **Clear:** `set(ref(db, \`games/${gameId}/round/strokes\`), null)`.
- **Toolbar (rendered only when `isArtist`):** 8 fixed swatches (tap targets ≥28px, `PALETTE`
  below), 3 brush-size buttons (each showing a dot preview sized to `BRUSH_WIDTHS[w]`), an UNDO
  button, a CLEAR button. Toolbar chrome (buttons' borders/background/labels) uses
  `retro-*`/`--c-*` tokens normally; only the swatch fill colors and the canvas ink/background are
  the fixed hardcoded hex values.
  ```js
  const PALETTE = ['#1a1a1a', '#ffffff', '#e0393c', '#f2994a', '#f5d947', '#3fae6a', '#3a7bd5', '#7a4a2a']
  const BRUSH_WIDTHS = { 1: 3, 2: 7, 3: 13 }
  ```
- Local component state: `color` (0-7, default 0), `brushSize` (1|2|3, default 2) — persists
  across this same client's turns as artist within a match (no reset needed; a nice-to-have, not
  a requirement).

### 3d. `src/pages/SketchGame.jsx`

```jsx
export default function SketchGame({
  gameId, game, mySeat, players, isHost,
  onStart, onSwitchGame, onNewMatch, proposal,
}) { ... }
```

Props match the standard `nProps` shape exactly (`proposal` is always `null` for party games per
`Game.jsx`'s nPlayer branch — kept in the signature for consistency, unused). Structure and full
behavior spelled out in §5.

### 3e. Deck content and caveat comment (for `src/lib/decks/sketch.js`)

Caveat comment (copy verbatim, adapted from `src/lib/decks/fibbage.js`):

```js
// SKETCH deck — drawable words/phrases for the draw & guess party game. Each entry:
// { word: string, tier: 1 | 2 | 3 } — a rough "how easy to draw and guess" rating.
// pickOptions() offers exactly one word per tier every choosing phase, so the artist
// always has an easy/medium/hard spread:
//   tier 1 — concrete, iconic, single objects (e.g. "cat", "house", "sun")
//   tier 2 — everyday scenes/actions, slightly trickier concrete things (e.g. "birthday
//            party", "juggling", "traffic jam")
//   tier 3 — abstract concepts, idioms, and multi-word phrases, hardest to draw/guess
//            (e.g. "time travel", "stage fright", "raining cats and dogs")
//
// ⚠ RESIDUAL (UNFIXABLE) INFO LEAK: this deck ships in the client JS bundle, and the
// 3 offered `options` (deck indices) are public in Firebase — so any player who opens
// devtools can shortlist the 3 candidates. Sketch's commit scheme additionally
// publishes the SALT immediately (not withheld until reveal, unlike Wavelength/
// Fibbage), so a determined player can also hash each of the 3 candidates locally
// against the public `commitment.hash` and read the real word BEFORE the round ends
// (see deriveWord() in sketchLogic.js — this is the same function honest clients use
// to show the word at reveal). This is an accepted leak at the same trust tier as
// Fibbage's bundled answer key — the platform has no trusted server to keep a word
// secret from a client willing to inspect its own network traffic / JS bundle. It only
// defends against a spectator glancing at a single Firebase field. See the
// commit-reveal trust-model note in docs/prds/README.md.

export const SKETCH_WORDS = [
  // --- tier 1 (90) --------------------------------------------------------
  { word: 'cat', tier: 1 }, { word: 'dog', tier: 1 }, { word: 'house', tier: 1 },
  { word: 'sun', tier: 1 }, { word: 'moon', tier: 1 }, { word: 'star', tier: 1 },
  { word: 'tree', tier: 1 }, { word: 'flower', tier: 1 }, { word: 'fish', tier: 1 },
  { word: 'bird', tier: 1 }, { word: 'car', tier: 1 }, { word: 'boat', tier: 1 },
  { word: 'apple', tier: 1 }, { word: 'banana', tier: 1 }, { word: 'book', tier: 1 },
  { word: 'chair', tier: 1 }, { word: 'table', tier: 1 }, { word: 'clock', tier: 1 },
  { word: 'cup', tier: 1 }, { word: 'hat', tier: 1 }, { word: 'shoe', tier: 1 },
  { word: 'umbrella', tier: 1 }, { word: 'balloon', tier: 1 }, { word: 'kite', tier: 1 },
  { word: 'ball', tier: 1 }, { word: 'bicycle', tier: 1 }, { word: 'guitar', tier: 1 },
  { word: 'drum', tier: 1 }, { word: 'key', tier: 1 }, { word: 'door', tier: 1 },
  { word: 'window', tier: 1 }, { word: 'ladder', tier: 1 }, { word: 'bridge', tier: 1 },
  { word: 'mountain', tier: 1 }, { word: 'cloud', tier: 1 }, { word: 'rainbow', tier: 1 },
  { word: 'snowman', tier: 1 }, { word: 'candle', tier: 1 }, { word: 'lightbulb', tier: 1 },
  { word: 'phone', tier: 1 }, { word: 'camera', tier: 1 }, { word: 'glasses', tier: 1 },
  { word: 'crown', tier: 1 }, { word: 'ring', tier: 1 }, { word: 'heart', tier: 1 },
  { word: 'spider', tier: 1 }, { word: 'snake', tier: 1 }, { word: 'frog', tier: 1 },
  { word: 'rabbit', tier: 1 }, { word: 'duck', tier: 1 }, { word: 'owl', tier: 1 },
  { word: 'bee', tier: 1 }, { word: 'ant', tier: 1 }, { word: 'whale', tier: 1 },
  { word: 'octopus', tier: 1 }, { word: 'crab', tier: 1 }, { word: 'snail', tier: 1 },
  { word: 'turtle', tier: 1 }, { word: 'penguin', tier: 1 }, { word: 'elephant', tier: 1 },
  { word: 'giraffe', tier: 1 }, { word: 'lion', tier: 1 }, { word: 'tiger', tier: 1 },
  { word: 'monkey', tier: 1 }, { word: 'horse', tier: 1 }, { word: 'cow', tier: 1 },
  { word: 'pig', tier: 1 }, { word: 'sheep', tier: 1 }, { word: 'chicken', tier: 1 },
  { word: 'egg', tier: 1 }, { word: 'pizza', tier: 1 }, { word: 'hamburger', tier: 1 },
  { word: 'ice cream', tier: 1 }, { word: 'cake', tier: 1 }, { word: 'cookie', tier: 1 },
  { word: 'pretzel', tier: 1 }, { word: 'carrot', tier: 1 }, { word: 'mushroom', tier: 1 },
  { word: 'cactus', tier: 1 }, { word: 'volcano', tier: 1 }, { word: 'island', tier: 1 },
  { word: 'anchor', tier: 1 }, { word: 'compass', tier: 1 }, { word: 'telescope', tier: 1 },
  { word: 'robot', tier: 1 }, { word: 'rocket', tier: 1 }, { word: 'airplane', tier: 1 },
  { word: 'train', tier: 1 }, { word: 'bus', tier: 1 }, { word: 'skateboard', tier: 1 },

  // --- tier 2 (90) --------------------------------------------------------
  { word: 'birthday party', tier: 2 }, { word: 'juggling', tier: 2 },
  { word: 'sandcastle', tier: 2 }, { word: 'campfire', tier: 2 },
  { word: 'snowball fight', tier: 2 }, { word: 'roller coaster', tier: 2 },
  { word: 'fireworks', tier: 2 }, { word: 'tightrope walker', tier: 2 },
  { word: 'scuba diver', tier: 2 }, { word: 'mummy', tier: 2 },
  { word: 'pirate ship', tier: 2 }, { word: 'treasure chest', tier: 2 },
  { word: 'magic wand', tier: 2 }, { word: 'wizard hat', tier: 2 },
  { word: 'dragon', tier: 2 }, { word: 'unicorn', tier: 2 }, { word: 'mermaid', tier: 2 },
  { word: 'ghost', tier: 2 }, { word: 'vampire', tier: 2 }, { word: 'werewolf', tier: 2 },
  { word: 'zombie', tier: 2 }, { word: 'superhero cape', tier: 2 },
  { word: 'knight in armor', tier: 2 }, { word: 'castle', tier: 2 },
  { word: 'drawbridge', tier: 2 }, { word: 'waterfall', tier: 2 },
  { word: 'desert oasis', tier: 2 }, { word: 'igloo', tier: 2 },
  { word: 'lighthouse', tier: 2 }, { word: 'windmill', tier: 2 },
  { word: 'scarecrow', tier: 2 }, { word: 'beehive', tier: 2 },
  { word: 'spider web', tier: 2 }, { word: 'footprint', tier: 2 },
  { word: 'shadow puppet', tier: 2 }, { word: 'thunderstorm', tier: 2 },
  { word: 'tornado', tier: 2 }, { word: 'earthquake', tier: 2 },
  { word: 'avalanche', tier: 2 }, { word: 'quicksand', tier: 2 }, { word: 'maze', tier: 2 },
  { word: 'seesaw', tier: 2 }, { word: 'trampoline', tier: 2 }, { word: 'hopscotch', tier: 2 },
  { word: 'tug of war', tier: 2 }, { word: 'arm wrestling', tier: 2 },
  { word: 'thumb war', tier: 2 }, { word: 'piggyback ride', tier: 2 },
  { word: 'sleepwalking', tier: 2 }, { word: 'snoring', tier: 2 }, { word: 'hiccups', tier: 2 },
  { word: 'sneezing', tier: 2 }, { word: 'yawning', tier: 2 }, { word: 'whispering', tier: 2 },
  { word: 'tiptoeing', tier: 2 }, { word: 'somersault', tier: 2 }, { word: 'cartwheel', tier: 2 },
  { word: 'handstand', tier: 2 }, { word: 'high five', tier: 2 }, { word: 'fist bump', tier: 2 },
  { word: 'group hug', tier: 2 }, { word: 'staring contest', tier: 2 },
  { word: 'hide and seek', tier: 2 }, { word: 'musical chairs', tier: 2 },
  { word: 'jump rope', tier: 2 }, { word: 'board game', tier: 2 },
  { word: 'puzzle piece', tier: 2 }, { word: 'domino effect', tier: 2 },
  { word: 'house of cards', tier: 2 }, { word: 'paper airplane', tier: 2 },
  { word: 'origami crane', tier: 2 }, { word: 'bubble wrap', tier: 2 },
  { word: 'rubber band', tier: 2 }, { word: 'clothesline', tier: 2 },
  { word: 'vacuum cleaner', tier: 2 }, { word: 'lawnmower', tier: 2 },
  { word: 'wheelbarrow', tier: 2 }, { word: 'garden hose', tier: 2 },
  { word: 'birdhouse', tier: 2 }, { word: 'scaffolding', tier: 2 },
  { word: 'traffic jam', tier: 2 }, { word: 'parking lot', tier: 2 },
  { word: 'crosswalk', tier: 2 }, { word: 'escalator', tier: 2 }, { word: 'elevator', tier: 2 },
  { word: 'revolving door', tier: 2 }, { word: 'fire escape', tier: 2 },
  { word: 'fire hydrant', tier: 2 }, { word: 'manhole cover', tier: 2 },
  { word: 'street lamp', tier: 2 },

  // --- tier 3 (70) --------------------------------------------------------
  { word: 'time travel', tier: 3 }, { word: "writer's block", tier: 3 },
  { word: 'stage fright', tier: 3 }, { word: 'peer pressure', tier: 3 },
  { word: 'procrastination', tier: 3 }, { word: 'optical illusion', tier: 3 },
  { word: 'identity crisis', tier: 3 }, { word: 'culture shock', tier: 3 },
  { word: 'sleep paralysis', tier: 3 }, { word: 'midlife crisis', tier: 3 },
  { word: 'information overload', tier: 3 }, { word: 'conspiracy theory', tier: 3 },
  { word: 'déjà vu', tier: 3 }, { word: 'groundhog day', tier: 3 },
  { word: 'broken heart', tier: 3 }, { word: 'love at first sight', tier: 3 },
  { word: 'butterflies in stomach', tier: 3 }, { word: 'cold shoulder', tier: 3 },
  { word: 'raining cats and dogs', tier: 3 }, { word: 'piece of cake', tier: 3 },
  { word: 'break a leg', tier: 3 }, { word: 'spill the beans', tier: 3 },
  { word: 'costs an arm and a leg', tier: 3 }, { word: 'hit the hay', tier: 3 },
  { word: 'under the weather', tier: 3 }, { word: 'once in a blue moon', tier: 3 },
  { word: 'elephant in the room', tier: 3 }, { word: 'fish out of water', tier: 3 },
  { word: 'barking up the wrong tree', tier: 3 },
  { word: 'let the cat out of the bag', tier: 3 },
  { word: 'kill two birds with one stone', tier: 3 },
  { word: 'add insult to injury', tier: 3 }, { word: 'beat around the bush', tier: 3 },
  { word: 'bite the bullet', tier: 3 }, { word: 'burn the midnight oil', tier: 3 },
  { word: 'caught red-handed', tier: 3 }, { word: 'curiosity killed the cat', tier: 3 },
  { word: "don't count your chickens", tier: 3 },
  { word: 'early bird catches the worm', tier: 3 },
  { word: 'every cloud has a silver lining', tier: 3 },
  { word: 'go the extra mile', tier: 3 }, { word: 'hold your horses', tier: 3 },
  { word: 'in hot water', tier: 3 }, { word: 'jump on the bandwagon', tier: 3 },
  { word: 'keep your chin up', tier: 3 }, { word: 'let sleeping dogs lie', tier: 3 },
  { word: 'make a mountain out of a molehill', tier: 3 }, { word: 'miss the boat', tier: 3 },
  { word: 'on thin ice', tier: 3 }, { word: 'out of the blue', tier: 3 },
  { word: "pull someone's leg", tier: 3 }, { word: 'see eye to eye', tier: 3 },
  { word: 'spill the tea', tier: 3 }, { word: 'the ball is in your court', tier: 3 },
  { word: 'time flies', tier: 3 }, { word: 'turn a blind eye', tier: 3 },
  { word: 'wear your heart on your sleeve', tier: 3 }, { word: 'when pigs fly', tier: 3 },
  { word: "you can't judge a book by its cover", tier: 3 },
  { word: 'back to square one', tier: 3 }, { word: 'bite off more than you chew', tier: 3 },
  { word: 'cry over spilled milk', tier: 3 }, { word: 'hit the nail on the head', tier: 3 },
  { word: 'a blessing in disguise', tier: 3 }, { word: 'actions speak louder than words', tier: 3 },
  { word: 'better late than never', tier: 3 }, { word: 'birds of a feather', tier: 3 },
  { word: 'blood is thicker than water', tier: 3 },
  { word: "don't put all your eggs in one basket", tier: 3 },
  { word: 'the grass is always greener', tier: 3 },
]
```

(90 + 90 + 70 = 250 entries — counted; the builder should re-count after pasting to be sure
nothing was dropped in transcription.)

---

## 4. Logic details (pseudocode)

```js
// normalize -------------------------------------------------------------
function normalize(str) {
  return String(str ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')   // strip punctuation, KEEP spaces already there
}

// wordPattern -------------------------------------------------------------
function wordPattern(word) {
  return String(word ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.length)
    .join(' ')
}

// quantize / dequantize ---------------------------------------------------
function quantize(fraction) {
  return Math.max(0, Math.min(255, Math.round(fraction * 255)))
}
function dequantize(q) {
  return q / 255
}

// pickOptions ---------------------------------------------------------------
function pickOptions(deck, seed, used = []) {
  const usedSet = new Set(used)
  const byTier = { 1: [], 2: [], 3: [] }
  deck.forEach((entry, i) => { if (!usedSet.has(i) && byTier[entry.tier]) byTier[entry.tier].push(i) })

  const pickFrom = (indices, offset) =>
    indices.length === 0 ? null : seededShuffle(indices, seed + offset)[0]

  const chosen = []
  const chosenSet = new Set()
  ;[1, 2, 3].forEach((tier, offset) => {
    let pool = byTier[tier].filter(i => !chosenSet.has(i))
    let pick = pickFrom(pool, offset)
    if (pick == null) {
      // tier pool exhausted (or all its unused words already chosen for this
      // set) — fall back to ANY unused, unchosen index from any tier.
      const fallback = deck.map((_, i) => i).filter(i => !usedSet.has(i) && !chosenSet.has(i))
      pick = pickFrom(fallback, offset + 10)
    }
    if (pick == null) {
      // Entire deck used this match (only possible in an extremely long
      // match) — allow reuse, ignoring `used`, still avoiding a dup within
      // THIS options set.
      const anyPool = deck.map((_, i) => i).filter(i => !chosenSet.has(i))
      pick = pickFrom(anyPool, offset + 20)
    }
    if (pick != null) { chosen.push(pick); chosenSet.add(pick) }
  })
  return chosen
}

// nextArtist / cyclesFor / matchOver ---------------------------------------
function nextArtist(order, artist) {
  const idx = order.indexOf(artist)
  if (idx === -1 || order.length === 0) return order[0] ?? null
  return order[(idx + 1) % order.length]
}
function cyclesFor(playerCount) { return playerCount === 2 ? 3 : 2 }
function matchOver(order, artist, cycle) {
  const idx = order.indexOf(artist)
  return idx === order.length - 1 && cycle >= cyclesFor(order.length)
}

// nextRoundState ------------------------------------------------------------
function nextRoundState(round) {
  const { order, artist, cycle, used, options } = round
  const carryUsed = [...(used || []), ...(options || [])]
  if (matchOver(order, artist, cycle)) return { finished: true }
  const idx = order.indexOf(artist)
  const wraps = idx === order.length - 1
  return {
    finished: false,
    round: {
      phase: 'choosing',
      cycle: cycle + (wraps ? 1 : 0),
      artist: nextArtist(order, artist),
      order,
      used: carryUsed,
      // caller adds: options: null, commitment: null, wordPattern: '',
      // strokes: null, chat: null, correct: null, scored: false,
      // endsAt: now() + CHOOSE_MS
    },
  }
}

// activeGuessers --------------------------------------------------------
function activeGuessers(players, order, artist) {
  const guessers = order.filter(id => id !== artist)
  const online = guessers.filter(id => players?.[id]?.online !== false)
  return online.length > 0 ? online : guessers
}

// roundDeltas -----------------------------------------------------------
function roundDeltas({ guesserIds, correct, artistId, endsAt }) {
  const deltas = {}
  const n = guesserIds.length
  if (n === 0) return deltas
  if (n === 1) {
    const uid = guesserIds[0]
    const c = correct?.[uid]
    if (!c) return deltas
    const ratio = Math.max(0, Math.min(1, (endsAt - c.at) / DRAW_MS))
    const guesserPts = SOLO_GUESSER_BASE_PTS + Math.round(SOLO_GUESSER_BONUS_MAX * ratio)
    deltas[uid] = guesserPts
    deltas[artistId] = (deltas[artistId] || 0) + Math.floor(guesserPts / SOLO_ARTIST_DIVISOR)
    return deltas
  }
  const ranked = guesserIds
    .filter(uid => correct?.[uid])
    .sort((a, b) => (correct[a].at - correct[b].at) || String(a).localeCompare(String(b)))
  if (ranked.length === 0) return deltas
  ranked.forEach((uid, i) => {
    deltas[uid] = Math.max(GUESSER_FLOOR_PTS, GUESSER_BASE_PTS - i * GUESSER_STEP_PTS)
  })
  deltas[artistId] = (deltas[artistId] || 0) + ARTIST_PTS_PER_CORRECT * ranked.length
  return deltas
}

// deriveWord --------------------------------------------------------------
async function deriveWord(deckWords, options, commitment) {
  if (!commitment?.hash || !commitment?.salt) return null
  for (const i of options || []) {
    const word = deckWords[i]?.word
    if (word == null) continue
    if (await verifyReveal(commitment.hash, normalize(word), commitment.salt)) return word
  }
  return null
}
```

---

## 5. UI/UX

### Layout

`maxWidth: 'max-w-sm'` (matches sibling party games). Header chrome (HOME link, theme switcher,
rules button, invite, mute, badge, game id) is rendered by `Game.jsx`'s nPlayer wrapper — Sketch
only renders the body.

### `useServerNow()` — the new `.info/serverTimeOffset` pattern (page-local hook, not exported)

```js
function useServerNow() {
  const offsetRef = useRef(0)
  const [, setTick] = useState(0)
  useEffect(() => {
    const offRef = ref(db, '.info/serverTimeOffset')
    const unsub = onValue(offRef, snap => { offsetRef.current = snap.val() || 0 })
    const interval = setInterval(() => setTick(t => (t + 1) % 1e6), 250)
    return () => { unsub(); clearInterval(interval) }
  }, [])
  return useCallback(() => Date.now() + offsetRef.current, [])
}
```

The 250 ms tick is what makes the countdown UI re-render; `now()` itself is cheap and pure.

### Lobby (`status !== 'playing'`)

- Title, one-line rules blurb.
- Player list: `<Avatar id={players[id].avatar} size={20} />` + name (+ "(YOU)" for `mySeat`) +
  "·OFFLINE" tag when `online === false` — same visual language as Wavelength's lobby list, with
  avatars added (Avatar component already used elsewhere for exactly this purpose, e.g.
  `Home.jsx`).
- `MIN_PLAYERS = 2` (override — was 3 in the base PRD). Below `MIN_PLAYERS`: "NEED N MORE
  PLAYER(S) TO START". At/above: host sees **START ROUND** (`onStart`), others see "WAITING FOR
  HOST TO START…".
- Finished-match variant (`status === 'finished'`): same screen shows final standings instead of
  "waiting" (see below) plus NEW MATCH + SHARE + GameSwitcher.

### Choosing phase

- **Artist:** "3 word options — 15s countdown ring/bar" using `now()`/`round.endsAt`. If
  `round.options` doesn't exist yet, show a brief "PICKING WORDS…" spinner (the artist's own
  effect publishes them within one render tick — this state is only visible on a slow connection
  or to other seats for a beat). Once options exist: 3 buttons showing each candidate's raw word
  (only the artist ever sees the plaintext at this stage — legitimate, they're about to draw it).
  Clicking one calls the pick-word transaction (§2). Local `pickedRef` guard prevents a double
  submit (button click racing the auto-pick timer, §2).
- **Everyone else:** "《artist name》 IS CHOOSING A WORD…" + the same countdown.
- **Host, when stalled** (`now() >= (round.endsAt||0) + SKIP_CHOOSING_GRACE_MS`): a "SKIP ROUND"
  button appears (§2 write-ownership table).

### Drawing phase

- `<SketchCanvas gameId={gameId} isArtist={mySeat === round.artist} />` — top of the drawing UI,
  always rendered for all seats/spectators.
- Word display: blanks derived from `round.wordPattern` (e.g. `"5 3"` → two groups of underscores
  `_ _ _ _ _   _ _ _`), UNLESS `round.correct[mySeat]` exists, in which case show the actual word
  (derived via `deriveWord`, cached in local state) instead of blanks, plus a small "✓ YOU GOT
  IT — WAITING…" note.
- Countdown to `round.endsAt`.
- **Guess input** (visible to non-artist seated players who haven't yet guessed correctly, only
  during `phase === 'drawing'`): single text field + submit (Enter or button). On submit:
  1. `normalize(input)` locally.
  2. `await verifyReveal(round.commitment.hash, normalizedGuess, round.commitment.salt)`.
  3. If true: play `sounds.win()` immediately, set `correctSentRef.current = true`, `update(round/
     correct, { [mySeat]: { at: serverTimestamp() } })`.
  4. If false: `push(round/chat, { uid: mySeat, text: input.trim() })`.
  5. Clear the input either way.
- **Chat feed:** scrollable list (`max-h-40 overflow-y-auto`) of `round.chat` entries (sorted by
  push key), each rendered as `NAME: text`, auto-scrolled to bottom on new entries.
- **Artist / already-correct guessers:** no guess input; artist sees a live tally "N/M guessed
  so far" (`Object.keys(round.correct||{}).length` / `activeGuessers(...).length`).
- **Host, when the artist has been observed offline ≥ `ARTIST_OFFLINE_DRAWING_MS`:** a "SKIP
  ROUND" button appears (triggers the same scoring-advance transaction early, §2). Implemented
  with a ref tracking "since when did I first observe artist offline" (no existing duration-based
  offline helper in the codebase — this is new, page-local logic, per §2).

### Reveal phase

- Still render `<SketchCanvas gameId={gameId} isArtist={false} />` (always `isArtist={false}` here,
  even for the artist who just drew — drawing has ended, the canvas is read-only, showing exactly
  the strokes that existed when the round advanced; the SAME strokes subtree persists untouched
  until the next round replaces `round` wholesale, so no separate "frozen snapshot" state is
  needed — the live subscription already shows the final frame).
- Word (from `deriveWord`, computed once via a `useEffect` keyed on `round.commitment?.hash`) shown
  large above or below the canvas.
- If `!round.scored` yet (should be near-instantaneous, same-transaction as the phase flip): "TALLYING…".
- Score delta list per player (uses the SAME `roundDeltas` inputs the host used, recomputed
  client-side from `round.correct`/`round.order`/`round.artist`/`round.endsAt` for DISPLAY only —
  the authoritative numbers already live in `scores`, this is purely a "+N" annotation next to
  each name, matching Wavelength's `highlight` prop pattern on its Scoreboard).
- Full scoreboard, sorted desc, `mySeat` highlighted.
- No manual "NEXT ROUND" button — the host's automatic reveal→next-round transition
  (`REVEAL_MS`, §2) drives it; players just wait out the countdown. (Deliberately simpler than
  Fibbage's manual "NEXT PROMPT" button, since Sketch already has a full deterministic timer
  chain and the host is guaranteed to exist.)

### Finished (`status === 'finished'`)

- "MATCH OVER" + winner line — "YOU WIN!" if `mySeat` is among the top-scorers (ties share the
  win — check `scores[mySeat] === maxScore`), else `"{NAME} WINS"` (or `"{N} WAY TIE"` framing if
  more than one winner and `mySeat` isn't one — mirror Fibbage's `champ` framing, listing all
  co-winners' names joined by "&" if more than one).
- Full scoreboard.
- NEW MATCH (`onNewMatch`) + SHARE (`shareResult`, same call shape as Fibbage/Wavelength) +
  GameSwitcher.

### Sound cues

| Trigger | Sound |
|---|---|
| phase enters `'drawing'` | `sounds.go()` (all clients) |
| my own correct guess (locally, at submit time, before the round-trip) | `sounds.win()` |
| someone ELSE's correct guess appears in `round.correct` (diff old vs new keys, excluding my own uid) | `sounds.bell()` |
| phase enters `'reveal'` with zero entries in `round.correct` | `sounds.miss()` |
| `status` transitions to `'finished'`, `mySeat` among top-scorers | `sounds.matchWin()` |
| `status` transitions to `'finished'`, `mySeat` seated but not a top-scorer | `sounds.lose()` |

No `recordMatch()` call — consistent with the existing gap in Wavelength/Fibbage/Spyfair (none
of them record match stats either; `Game.jsx`'s central win-effect, which is the only thing that
calls `recordMatch`, explicitly skips all `nPlayer` games). Not a regression to fix here.

### Mobile / touch

Pointer Events unify mouse/touch/pen (`onPointerDown/Move/Up/Cancel`), `touch-action: none` on
the canvas prevents scroll-while-drawing. Toolbar swatches/buttons sized for ≥28px tap targets.
Guess input uses a standard `<input type="text">` (native mobile keyboard, no special handling
needed — matches every other text-guess input in the codebase, e.g. Fibbage's lie input).

---

## 6. Integration touchpoints

### `src/lib/games.js`

Add `SketchIcon` to the existing GameIcons import:

```js
import {
  TicTacToeIcon, ConnectFourIcon, HangwomanIcon, DotsAndBoxesIcon, SosIcon,
  SimonIcon, ChimpIcon, NumberMemoryIcon, VisualMemoryIcon, ReactionIcon, AimIcon,
  TypingIcon, MathIcon,
  GomokuIcon, ReversiIcon, OrderChaosIcon, DiceIcon, TwoTruthsIcon, BluffIcon,
  WavelengthIcon, FibbageIcon, SpyfairIcon, PongIcon, SnakeIcon,
  TronIcon, SumoIcon, SpaceDuelIcon, ChainReactionIcon,
  WordDuelIcon, SketchIcon,
} from '../components/GameIcons'
```

Add a new import line for the sketch logic helpers used by `startRound`:

```js
import { seatOrder as seatOrderSketch, CHOOSE_MS as SKETCH_CHOOSE_MS } from './sketchLogic'
```

Add the registry entry (append to the `GAME_TYPES` array, after the `wordduel` entry or anywhere
in the party group — position doesn't matter, the UI groups by `category`):

```js
{
  type: 'sketch', label: 'SKETCH',
  desc: 'draw & guess the word', Icon: SketchIcon,
  badge: 'SK', maxWidth: 'max-w-sm',
  category: 'party',
  addedAt: '2026-07-11',
  durationMin: 10, tags: ['thinky'],
  custom: true, nPlayer: true, minPlayers: 2, maxPlayers: 8,
  startRound: (players) => {
    const order = seatOrderSketch(players)
    return {
      round: {
        phase: 'choosing',
        cycle: 1,
        artist: order[0] ?? null,
        order,
        used: [],
        endsAt: Date.now() + SKETCH_CHOOSE_MS,
      },
    }
  },
},
```

**`freshGameState()`: no changes needed** — confirmed, the existing generic branch
(`if (cfg.nPlayer) return { ...FIELD_NULLS, board: null, boxes: null, currentTurn: null, round:
null }`) already clears Sketch's entire state (everything lives under `round`).

**`FIELD_NULLS`: no changes needed** — confirmed, no new top-level keys.

**`database.rules.json`: no changes needed** — confirmed, `games/$gameId` is world-writable for
authed users except `players` (unaffected by Sketch).

### `src/components/GameIcons.jsx`

Add (style/size matches every existing icon — 24×24 viewBox, `currentColor`, `aria-hidden`):

```jsx
export function SketchIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* pencil */}
      <path d="M14.5 3.5 L20.5 9.5 L9 21 L3 21 L3 15 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      <path d="M12.5 5.5 L18.5 11.5" stroke="currentColor" strokeWidth="1.5" />
      {/* squiggle stroke trailing off the tip, like a drawn line */}
      <path d="M3 21 Q1 19 2.5 17" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.6" />
    </svg>
  )
}
```

### `src/pages/Game.jsx`

Add the import alongside the other party pages:

```js
import SketchGame from './SketchGame'
```

Placed directly below `import SpyfairGame from './SpyfairGame'` (line 35).

Extend the nPlayer dispatch ladder (~line 1050-1056):

```jsx
{game.gameType === 'wavelength' ? (
  <WavelengthGame {...nProps} />
) : game.gameType === 'fibbage' ? (
  <FibbageGame {...nProps} />
) : game.gameType === 'sketch' ? (
  <SketchGame {...nProps} />
) : (
  <SpyfairGame {...nProps} />
)}
```

### `src/lib/rules.js`

Add an entry (any position in `GAME_RULES`, e.g. after `spyfair`):

```js
sketch: {
  objective: 'One player draws a secret word while everyone else races to guess it in chat.',
  howToPlay: [
    '2–8 players. Each round, one player is the artist and picks a secret word from 3 options.',
    'The artist draws it on the shared canvas.',
    'Everyone else types guesses — the word length is shown as blanks.',
    'Guessing correctly locks you in early and reveals the word to you — keep it secret from the others still guessing.',
  ],
  win: 'Guessers score by how fast they guess correctly; the artist scores per correct guesser. Everyone draws twice (three times in a 2-player match) — most total points wins, ties share the win.',
},
```

### `src/pages/Demo.jsx`

Add `SketchIcon` to the GameIcons import block (line 12-18):

```js
import {
  TicTacToeIcon, HangwomanIcon, DotsAndBoxesIcon, SosIcon,
  SimonIcon, ChimpIcon, NumberMemoryIcon, VisualMemoryIcon, ReactionIcon, AimIcon, TypingIcon, MathIcon,
  ConnectFourIcon, GomokuIcon, ReversiIcon, OrderChaosIcon, DiceIcon,
  TwoTruthsIcon, BluffIcon, WavelengthIcon, FibbageIcon, SpyfairIcon, PongIcon, SnakeIcon,
  TronIcon, SumoIcon, SpaceDuelIcon, ChainReactionIcon, WordDuelIcon, SketchIcon,
} from '../components/GameIcons';
```

Add a `PARTY_BLURB` entry (~line 143-149):

```js
const PARTY_BLURB = {
  twotruths: 'Spot the lie among three statements.',
  bluff: "Liar's dice — out-bluff your opponent.",
  wavelength: 'Read minds on a hidden spectrum.',
  fibbage: 'Invent fake answers, fool your friends.',
  spyfair: 'Find the spy before time runs out.',
  sketch: 'Draw the secret word, race to guess it.',
}
```

Add a demo-list entry (~line 1876, in the "Party cards" section):

```js
{ type: 'sketch',        short: 'SKETCH',        Icon: SketchIcon,       Component: () => <PartyGameCard type="sketch" />      },
```

**`src/lib/demoBots.js`: no changes** — Sketch is a party game with no solo-bot demo (matches
every other party game, `PartyGameCard` renders the "NEEDS 2+ PLAYERS — NO SOLO BOT" fallback for
free once the registry/Demo.jsx entries above exist).

---

## 7. Unit tests (`src/lib/sketchLogic.test.js`)

- `normalize`: lowercases; trims; collapses internal whitespace (`'multiple    spaces'` →
  `'multiple spaces'`); strips punctuation without fracturing tokens (`"writer's block"` →
  `'writers block'`); `normalize(null)`/`normalize(undefined)` → `''`.
- `wordPattern`: single word (`'sunglasses'` → `'10'`); two words (`'hot dog'` → `'3 3'`);
  punctuation counted as part of a token's raw length (`"writer's block"` → `'9 5'`); extra
  whitespace ignored (`'  Ice   Cream  '` → `'3 5'`).
- `quantize`/`dequantize` roundtrip: for every integer `0..255`, `quantize(dequantize(i)) === i`;
  `quantize` clamps out-of-range fractions (`quantize(-0.5) === 0`, `quantize(1.5) === 255`).
- `pickOptions`:
  - determinism: same `(deck, seed, used)` called twice → identical result.
  - used-exclusion: pre-populate `used` with specific indices → none appear in the result.
  - tier spread: with a deck that has entries in all 3 tiers, `result[0]`/`[1]`/`[2]` map to
    tier 1/2/3 respectively (via `deck[i].tier`).
  - tier-exhaustion fallback: tiny fake deck where tier 1 is fully in `used` → `pickOptions` still
    returns 3 indices (borrowed from other tiers).
  - full-deck-exhaustion fallback: every index in `used` → still returns entries (reuse allowed).
- `nextArtist`: middle-of-order wraps to the next seat; last-seat wraps to `order[0]`; artist not
  present in `order` falls back to `order[0]`.
- `cyclesFor`: `cyclesFor(2) === 3`; `cyclesFor(3) === 2`; `cyclesFor(8) === 2`.
- `matchOver` / rotation, **2 players**: simulate the full 6-round sequence for `order=['a','b']`
  (cyclesFor=3) via repeated `nextRoundState` calls; assert `matchOver` is `false` for rounds 1-5
  and `true` only at round 6 (artist `'b'`, cycle 3).
- `matchOver` / rotation, **5 players**: simulate the full 10-round sequence for a 5-seat `order`
  (cyclesFor=2); assert `matchOver` true only at round 10 (last seat, cycle 2).
- `nextRoundState`: mid-match round → `{ finished: false, round: {...} }` with correctly bumped
  `cycle`/`artist` and `used` extended by the old round's `options`; final round → `{ finished:
  true }`.
- `activeGuessers`: excludes the artist; falls back to the full guesser list when none are
  online; returns only-online subset otherwise.
- `roundDeltas` — **2-player (1 guesser) boundaries:**
  - instant guess (`at === endsAt - DRAW_MS`, i.e. guessed the moment drawing started) → guesser
    `100`, artist `50`.
  - last-second guess (`at === endsAt`) → guesser `50`, artist `25`.
  - timeout (no `correct` entry at all) → `{}` (both 0).
- `roundDeltas` — **3+ guessers:**
  - ordering: 3 correct guessers ranked by `at` ascending → `100/90/80`; artist `+25×3`.
  - tie-break: two guessers with identical `at` → ranked by uid string ascending.
  - floor: 6th-place (or later) correct guesser still scores `50`, not lower.
  - nobody guessed → `{}` (artist also 0).
- `deriveWord`: build a tiny fake deck + real `commit()` (from `src/lib/commit.js`) on one
  candidate; `deriveWord` returns that candidate's word given the 3 candidate indices +
  commitment; returns `null` if the commitment doesn't match any candidate (corrupted state).

---

## 8. Manual verification script

**2-browser run (dedicated 2P test — the mandated override):** browser A normal window
(player 1), browser B **incognito** window (player 2 — same-browser regular tabs share
`playerId`, per repo convention).

1. A creates a Sketch room, B joins via the invite link/code while both are in the lobby.
   Confirm both names + avatars show, and A (host, first `joinedAt`) sees START ROUND while B
   sees "WAITING FOR HOST".
2. A starts. Confirm `round.artist` is deterministically the first seat (`seatOrder` = A, since A
   joined first) and `phase: 'choosing'`.
3. As the artist, confirm 3 word options appear within ~1s (options published by the artist's own
   client), each with a plausible easy/medium/hard spread. Pick one.
4. Confirm B sees blanks matching `wordPattern`, a live 75s countdown, and the canvas.
5. Draw on A's canvas (mouse or trackpad) — confirm strokes appear on B's screen within ~100-200ms,
   confirm undo removes the last-drawn segment, confirm clear wipes the canvas for both.
6. On B, type a WRONG guess — confirm it appears in the chat feed on BOTH screens, confirm no
   score change.
7. On B, type the CORRECT word (test case-insensitivity + extra whitespace, e.g. wrong case or
   trailing spaces) — confirm: B's screen immediately shows the actual word + "YOU GOT IT",
   `sounds.win()` fires on B, `sounds.bell()` fires on A (the artist), the round transitions to
   `'reveal'` promptly (early-end — B was the only/last guesser).
8. Confirm the reveal screen on both browsers shows the same derived word and the SAME score
   deltas: B should get somewhere in `[50, 100]` depending on how fast the guess landed, A
   (artist) gets `floor(B's points / 2)`.
9. Confirm reveal auto-advances to the next round after ~6s, artist rotates to B, `cycle` stays 1.
10. Repeat through all 6 rounds (3 cycles × 2 players) letting at least one round TIME OUT with no
    correct guess (let the 75s countdown run out) — confirm reveal shows the word, both players
    get 0 for that round, `sounds.miss()` fires, and the round still advances normally afterward.
11. After round 6, confirm `status` flips to `'finished'`, final standings show, `sounds.matchWin
    ()`/`sounds.lose()` fire on the correct browser, NEW MATCH resets scores to 0 and returns to
    the lobby (not a full room reset — same gameId).
12. **Artist-disconnect test:** mid-drawing, close browser tab for whichever browser is currently
    the artist (or use devtools offline mode) without using New Match. Confirm, after ~10s, the
    OTHER browser (host) sees a SKIP ROUND button; click it; confirm the round advances to the
    next artist with no score change and no reveal shown for the skipped round.
13. **Choosing-stall test:** at the very start of a round, have the artist simply not click any
    option and wait past 15s+5s=20s total. Confirm the OTHER browser (host) sees a SKIP ROUND
    button appear at the 20s mark (not before); click it; confirm rotation advances.
14. **Reload-recovery test:** mid-drawing, reload the ARTIST's own browser tab. Confirm they
    rejoin the same seat (uid-based reclaim, unchanged shared mechanism), the canvas replays all
    existing strokes, and — since there's no artist-only word storage anymore — the artist can
    still see what word they're drawing (derived, not from any local storage).

**3-browser run** (2 normal windows + 1 incognito, simulating a 3-player match — exercises the
3+ guesser scoring branch and tier/cycle math):

1. Three players join, host starts. Confirm `cyclesFor(3) === 2` → 6 total rounds, and after all 6
   confirm the match ends (not 9).
2. In one round, have BOTH non-artist players guess correctly in a deliberate order (guesser 1
   first, guesser 2 a couple seconds later). Confirm guesser 1 scores `100`, guesser 2 scores
   `90`, and the artist scores `25 × 2 = 50`.
3. Confirm a round where only ONE of the two guessers gets it right (the other times out) —
   confirm the non-guessing player scores 0 that round and the artist still scores `25 × 1 = 25`
   (not the 2-player time-bonus formula — this room has 2 possible guessers, so the 3+-player
   scoring table applies even though only 1 person actually guessed correctly that round).
4. Confirm ties share the win: engineer (via slow/no guesses) a final score tie between two of the
   three players and confirm the finished screen credits both as winners.
5. Confirm a spectator (open the room link in a 4th browser AFTER the match has started) sees the
   canvas/chat/countdown read-only, with no guess input, and cannot join a seat until a NEW MATCH
   starts (attempting to join while `status==='playing'` should silently no-op per the existing
   join-flow gate).
6. Mobile/touch pass: open the artist's view on an actual touch device (or Chrome device-mode with
   touch emulation) — confirm drawing works via touch-drag without the page scrolling, and the
   toolbar swatches/brush buttons are comfortably tappable.

---

## 9. Risks and mitigations

- **Word derivable before the round ends by a technically capable cheater.** Accepted, documented
  residual leak at the same trust tier as Fibbage (§1a). Mitigation: none possible without a
  trusted server; this is a platform-wide accepted trade-off (`docs/prds/README.md` §Trust
  models).
- **A guesser's correct-write can land a few ms after the host's drawing→reveal transaction has
  already committed** (in-flight network write racing the phase flip). The guess is not
  retroactively scored. Mitigation: none needed beyond documenting it — this only affects a
  guess that was, at best, tied with the literal instant of round-end; the UX impact is a rare
  "I swear I got it in time" edge case, same class as timing edge cases already accepted
  elsewhere in the codebase (e.g. Wavelength's `onlineGuessers` presence-based fallback).
- **Two nearly-simultaneous triggers for the drawing→reveal transaction** (timeout tick vs.
  all-correct effect) both fire `runTransaction` — mitigated by RTDB's own compare-and-swap
  semantics (only the first commit changes anything; the guard makes the second a no-op). No
  extra client-side lock needed beyond the `phase==='drawing'` guard already in the transaction.
- **Host==artist overlap.** The host and the artist can be the same client, and (since `order` is
  a fixed snapshot) the host will eventually also become the artist for some LATER round too.
  Every effect is gated independently (`isArtist`/`isHost` are both just booleans derived from
  `mySeat`), and every write is guarded against stale/duplicate application (§2), so a single
  client legitimately running both the "I'm the artist publishing options" effect and the "I'm
  the host watching for expiry" effect at once is safe — verified case-by-case in the
  write-ownership table. Specifically checked: (a) the host can skip their OWN stalled
  choosing/drawing turn — intentional, harmless, forfeits only their own turn; (b) a host who
  becomes the NEW artist the instant their own reveal→next-round transaction commits will see
  `round.artist === mySeat` flip true in the very same render that `round.phase` becomes
  `'choosing'` again — no separate write is needed to "become" artist, so there's no window for a
  stale write to target the wrong round in that specific handoff.
- **Deck exhaustion in an unusually long match.** With ~250 words and at most `3 × 8 = 24` rounds
  in the largest/longest configuration (8 players × 3 cycles is impossible since `cyclesFor(8) ===
  2`, so the real worst case is `2 × 8 = 16` rounds × 3 candidates/round = 48 words consumed,
  well under 250) — practically never exhausts a tier, but `pickOptions`'s fallback chain (§4)
  guarantees the room never gets stuck even if it somehow did.
- **No `recordMatch()` for Sketch.** Consistent with the existing gap for every other party game
  (Wavelength/Fibbage/Spyfair) — `Game.jsx`'s central win-effect, the only caller of
  `recordMatch`, explicitly skips all `nPlayer` games. Not introduced by this spec, not fixed by
  it either; flagged here so it isn't mistaken for an oversight.
- **`useServerNow()` is a new pattern for this repo** (no prior `.info/serverTimeOffset` usage
  anywhere in `src/`). Risk: subtly wrong offset math could desync countdowns across clients.
  Mitigation: the offset only affects DISPLAY countdowns and each client's OWN decision of when
  to fire ITS OWN writes (artist's auto-pick, host's expiry transitions) — every write that
  matters for correctness is additionally guarded by a Firebase-side phase/identity check (§2),
  so even a client with a wildly wrong local clock can only ever produce no-op writes, never a
  corrupt round state; at worst it fires its own transition a little early/late relative to other
  clients' wall-clock expectations, a cosmetic desync, not a correctness bug.
