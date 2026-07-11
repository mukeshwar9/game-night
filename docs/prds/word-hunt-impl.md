# DELTA-SPEC — Word Hunt (Boggle duel) `type: 'wordhunt'`

Status: implementation-ready delta against `docs/prds/word-hunt.md` (authoritative design),
corrected against the **actual** current codebase (audited 2026-07-11). Read the PRD first; this
document overrides/clarifies wherever it conflicts, and pins down every "your call" the PRD left
open. A builder should not need to make any design decision not already resolved here.

---

## 0. Audit findings — where the PRD's assumptions don't match the codebase

These are load-bearing corrections. Follow **this spec**, not the PRD, wherever they conflict.

1. **`src/lib/dictionary.js` already exists but is not the shared multi-length dictionary the PRD
   assumes.** It holds exactly two `Set`s of **5-letter-only** words (`_ANSWERS` ≈950 words,
   `_VALID` ≈13,000 words) built solely for Word Duel's Wordle mechanic, exporting `has(word)` and
   `isAnswerWord(word)`. It is **statically imported** — `import { has, isAnswerWord } from
   './dictionary'` in `src/lib/wordduelLogic.js` — with no lazy-loading, no dynamic `import()`,
   and no loading splash anywhere in `WordDuelGame.jsx`. Raw size 155 KB / ~47 KB gzipped, part of
   the main bundle today.
   → Word Hunt **cannot reuse this file** (wrong word-length shape; repurposing it risks
   destabilizing Word Duel). This spec creates a new, separate, genuinely lazy-loaded module pair:
   `src/lib/wordhuntDictionary.js` (loader) + `src/lib/wordhuntDictionaryData.js` (data, reached
   only via dynamic `import()`, so it becomes its own Vite/Rollup chunk). **`dictionary.js` is not
   modified.**
2. **There is no "Word Duel splash precedent."** Word Duel has no async gate at all — its
   dictionary is bundled synchronously, so there's nothing to wait for. The closest real
   precedent in this codebase for "block rendering behind an async readiness check" is
   `src/lib/AuthContext.jsx`'s boot splash and `src/pages/Game.jsx`'s `LoadingScreen` (~line
   93-98), both of which render `<ArcadeLoader variant="inline" />` centered full-screen while
   waiting. This spec reuses that exact component/variant for the dictionary-load gate (§5.1).
3. **TypingGame/MathGame have no mutual "both-ready" handshake.** Both use a single **START**
   button: whichever player taps it first wins a `runTransaction` race that stamps a start
   timestamp; the other player's UI just starts counting down the instant that timestamp appears
   on their snapshot. Word Hunt adopts this exact mechanic (§4.4) — a single tap starts the round
   for both players, no waiting on a second "ready" signal.
4. **Math's finish transaction is not gated on any "both done" condition** — it fires whenever
   any client's local clock crosses the shared deadline, guarded only by `status !== 'finished'`.
   This is what makes it resilient to a vanished opponent (the PRD's own "round still completes
   solo" edge case requires this). Word Hunt's `wordhuntDoneX`/`wordhuntDoneO` keys exist (the PRD
   names them explicitly) but are **informational acknowledgements only** — gating the finish
   transaction on both flags would hang forever if the opponent's client never ticks past the
   deadline (closed tab, backgrounded mobile browser throttled, etc.). See §4.4.
5. **`fibbageLogic.js` exports `seededShuffle` and `hashString`, but its `mulberry32` PRNG is a
   private, unexported helper.** Word Hunt's grid generator reuses only the exported
   `seededShuffle` (imported, not duplicated) for both the die-to-cell shuffle and the per-die
   face pick — see §4.1. `fibbageLogic.js` is not modified.
6. **`games.js` already imports per-game logic modules and calls their generators directly inside
   `freshGameState`** — e.g. `import { generateSeed } from './mathLogic'`, called as
   `mathSeed: generateSeed()` in the `'math'` branch. This is the exact precedent
   `generateGrid(seed)` follows for Word Hunt (§2, §6.3): `games.js` imports `generateGrid` from
   `./wordhuntLogic` and `generateSeed` from `./mathLogic` (already imported into `games.js` for
   Math — reused as-is, no new seed generator needed), and calls
   `generateGrid(generateSeed())` at creation / PLAY AGAIN / NEW MATCH / SWITCH GAME time.
7. **Word Duel's Demo entry (`WordDuelDemo`, `src/pages/Demo.jsx` ~line 258-465) is a fully
   self-contained, from-scratch UI** — it does not import or reuse anything from
   `WordDuelGame.jsx`'s board/keyboard components, only pure logic (`markGuess`, `isValidGuess`,
   `getKeyboardState`) plus a hand-rolled "bot" (a random plausible guess-count revealed on demand,
   not a real move-by-move bot). Word Hunt's demo follows the same pattern (§5.4): its own grid +
   drag UI inline in `Demo.jsx`, importing only pure functions from `wordhuntLogic.js` /
   `wordhuntDictionary.js`, no shared component file with the real game page.
8. **`demoBots.js` is exclusively for board-family games** (`getWinner`/`applyMove` shape, driving
   `BotBoardDemo`). Word Hunt is a custom race page, not board-family — **`demoBots.js` needs no
   changes.**
9. **`database.rules.json` needs no changes** — `games/$gameId` is already permissive for every
   key except `players` (confirmed platform convention, README "Non-negotiable checklists" #6).

---

## 1. Overview and rules

Two players get the **identical seeded 4×4 Boggle grid**. A single "READY" tap (either player)
starts a 3-second countdown; then both players get **80 seconds** to trace as many valid words as
they can on the shared grid. This is a **seeded race**, the same family as Mental Math / Typing
Race — not turn-based (`currentTurn` stays `null` throughout, exactly like Pong/Snake/Typing/Math).

**Grid generation.** The 16 classic Boggle dice (fixed 6-letter face sets, §4.1) are shuffled into
the 16 cells and one face is chosen per die, both steps driven by a single integer seed. Same seed
⇒ byte-identical 16-character grid string, always (unit-tested). The "Qu" face is stored as the
single character `'q'` and rendered as "Qu" (counts as 2 letters for both typing/tracing and
scoring, per classic Boggle).

**Valid word:** ≥ 3 letters, present in the Word Hunt dictionary, and traceable through
**8-directionally-adjacent** tiles without reusing a tile (the "Qu" tile consumes 2 letters — "qu"
— from the candidate word in a single step of the path).

**Scoring** (classic Boggle table, keyed by the letter-length of the typed word):

| Length | 3–4 | 5 | 6 | 7 | 8+ |
|---|---|---|---|---|---|
| Points | 1 | 2 | 3 | 5 | 11 |

**No shared-word cancellation** — both players may independently score the same word (GamePigeon
rule, explicit PRD requirement, not classic Boggle). Within one player's own list, the same word
cannot be scored twice: canonicalized (lowercased, trimmed) words are deduplicated **client-side**
before ever being written to Firebase (checked against a synchronous `useRef` set — see §4.3), so
a resubmitted already-found word is rejected locally (amber-shake feedback, no Firebase write, no
score change) and never needs server-side dedup.

**Round end.** The hard deadline is `wordhuntStartedAt + COUNTDOWN_MS + ROUND_MS` (3,000 + 80,000
ms). Higher score wins; equal scores draw. Standard best-of-3 match scoreboard
(`scores.X`/`scores.O`), exactly like every other custom page (§4.4).

**Edge cases (all resolved):**

- **`Qu` tile:** grid cell stores `'q'`; UI renders "Qu"; `findPath` matches 2 characters ("qu")
  from the candidate word for that tile/step; typing "QU" on the physical keyboard is one
  2-character contribution toward the word, same as any other pair of letters.
- **Reload mid-round:** all state lives in Firebase — found words, running score, the grid, and
  the start timestamp. On mount, the page derives `isCountdown`/`isPlaying`/`timeLeftMs` purely
  from `Date.now()` vs. `wordhuntStartedAt` (no client-local timer state to lose), and rehydrates
  `myWords`/`myScore` straight from `game.wordhuntWords{X|O}` / `game.wordhuntScore{X|O}`. Only an
  unsubmitted in-progress drag/typed buffer is lost on reload — acceptable, mirrors Math/Typing
  (which lose only the current unsubmitted keystrokes on reload).
- **Opponent quits mid-round:** the existing `opponentOnline` presence prop drives the standard
  "OPPONENT IS OFFLINE" banner (same convention as every other custom page); the round still
  finishes off a solo client's clock because the finish transaction is gated on the shared
  deadline only, never on the opponent's `wordhuntDone` flag (§0.4, §4.4).
- **Grid with pathologically few findable words:** accepted as-is per PRD — both players share
  the identical grid, so the pain (if any) is symmetric. No mitigation.
- **Timer authority / late submits:** each client stops accepting new submits at its own corrected
  local deadline; a hacked client submitting after that is caught only by an implausible score —
  accepted honest-client trust tier (README "Trust models" §1, same as every board game). Word
  Hunt is **not** a hidden-information game the way Hangwoman/Word Duel are — nothing is secret;
  found words simply aren't *rendered* to the opponent during play, a UI-only soft-hide, not a
  security boundary (PRD "Leak note", accepted, self-limiting).
- **Dictionary fails to load** (offline first visit, chunk fetch error): the page shows a retry
  affordance instead of hanging forever (§5.1).

---

## 2. Data model

All keys below are new **top-level** fields under `games/{gameId}` (no `round` sub-node, no
`board`/`boxes` — mirrors Math/Typing's flat-key convention, not Word Duel's `round`-nested one).
Written by `freshGameState('wordhunt')` at creation / PLAY AGAIN / NEW MATCH / SWITCH GAME time
(§6.3), and **all eight are added to `FIELD_NULLS`** (§6.2) so switching away from Word Hunt clears
every one.

| Key | Type | Written by | Lifecycle |
|---|---|---|---|
| `wordhuntGrid` | `string`, 16 chars, `'q'` = the Qu die face | `freshGameState('wordhunt')` only — never mutated mid-round | Present for the room's whole life while `gameType === 'wordhunt'`; **regenerated (new seed) every time `freshGameState` runs** — creation, PLAY AGAIN, NEW MATCH, and SWITCH GAME (back) into Word Hunt all call it fresh, so a new grid appears each round automatically (confirmed via `Game.jsx`'s `applyPlayAgain`, §3.5 note). |
| `wordhuntStartedAt` | `epoch-ms` (number) | First client to tap READY, via `runTransaction` guarded on `!current.wordhuntStartedAt` (Math/Typing's `handleStartClick` pattern, verbatim) | Absent while waiting; set exactly once; cleared (absent) by the next `freshGameState`. |
| `wordhuntWordsX` / `wordhuntWordsO` | `string[]`, append-only, each entry a canonicalized lowercase word | Each player writes **only their own** key: one indexed write per newly-found word — `update(ref(db, \`games/${gameId}\`), { [\`wordhuntWords${mySymbol}/${idx}\`]: word, [\`wordhuntScore${mySymbol}\`]: newScore })` | Absent until the player's first find; grows during play; both lists are rendered read-only on the end screen. |
| `wordhuntScoreX` / `wordhuntScoreO` | `number` | Each player writes only their own, **recomputed from scratch** every time (`scoreWords(myWords)`) and written in the *same* `update()` call as the word append — never hand-incremented, so it can't drift from the word list. Initialized to `0` by `freshGameState`. | `0` at round start; monotonically non-decreasing during play; frozen once `status === 'finished'`. |
| `wordhuntDoneX` / `wordhuntDoneO` | `bool` (`true` only — never written `false`) | Each player's own client writes it once, the first time its local clock crosses the round deadline | Absent until the deadline; **informational only** — drives "wrapping up…" / opponent-status copy. Does **not** gate the winner transaction (§0.4, §4.4). |

No `board`, `boxes`, or `round` node is used. `currentTurn` is `null` (no turns).

---

## 3. New files

### 3.1 `src/lib/wordhuntLogic.js`

Pure logic, no DOM/Firebase, Vitest-covered.

**Exports:**

- `GRID_SIZE = 4`, `CELL_COUNT = 16` — grid dimensions.
- `COUNTDOWN_MS = 3_000`, `ROUND_MS = 80_000` — mirrors `mathLogic.js`'s `QUESTION_MS`/`GAME_MS`
  naming convention exactly.
- `MATCH_WINS = 3` — mirrors `wordduelLogic.js`'s constant of the same name/value.
- `MIN_WORD_LENGTH = 3`.
- `BOGGLE_DICE` — the 16 classic dice, **verbatim, exactly this array, do not alter**:
  ```js
  export const BOGGLE_DICE = [
    'aaeegn', 'abbjoo', 'achops', 'affkps', 'aoottw', 'cimotu',
    'deilrx', 'delrvy', 'distty', 'eeghnw', 'eeinsu', 'ehrtvw',
    'eiosst', 'elrtty', 'himnqu', 'hlnnrz',
  ]
  ```
  (Each string is exactly 6 characters; index 14, `'himnqu'`, carries the Qu face as `'q'`.)
- `generateGrid(seed: number) => string` — 16-char grid string. Algorithm (§4.1).
- `rowColOf(index) => [row, col]`, `indexOf(row, col) => index` — grid coordinate helpers.
- `neighborsOf(index) => number[]` — the up-to-8 orthogonal+diagonal in-bounds neighbor indices.
- `canonicalize(word) => string` — `String(word ?? '').trim().toLowerCase()`. This is the one and
  only normalization/dedup-key function; use it everywhere a word is compared or stored.
- `findPath(grid: string, word: string) => number[] | null` — DFS path search (§4.2). Returns the
  tile-index path in traversal order, or `null` if the word cannot be traced. Does **not** check
  dictionary membership or length — pure grid-geometry search only.
- `scoreWord(word) => number` — the scoring table (§1); returns `0` for words shorter than
  `MIN_WORD_LENGTH`.
- `scoreWords(words: string[]) => number` — sums `scoreWord` over the list. **Assumes the caller
  has already deduplicated** (by `canonicalize`) — it is a tally/reducer, not a dedup step.

**Imports:** `import { seededShuffle } from './fibbageLogic'` (the only cross-module dependency;
`fibbageLogic.js` itself has zero imports, so this is a lightweight, safe reuse — confirmed by
reading the file).

### 3.2 `src/lib/wordhuntDictionary.js`

Lazy-loaded Word Hunt dictionary loader — separate from `src/lib/dictionary.js` (which is Word
Duel's fixed 5-letter list; see §0 finding 1). Header comment must explain why (copy the gist of
§0 finding 1) plus the bundle-leak caveat (copy the spirit of the caveat atop
`src/lib/decks/fibbage.js`, adapted: a Boggle word list is a lookup table, not an "answer," so the
residual leak here is lower-stakes, but the same acceptance applies).

**Exports:**

- `loadDictionary() => Promise<{ has(word: string): boolean }>` — on first call, dynamically
  `import('./wordhuntDictionaryData.js')` (this is what makes Vite/Rollup emit
  `wordhuntDictionaryData.js` as its own chunk, fetched only when this function first runs); wraps
  the resulting `WORDHUNT_WORDS` Set in a `has(word)` that canonicalizes (`trim().toLowerCase()`)
  before lookup. Caches the resolved promise at module scope so repeat calls (e.g. the game page
  and the demo, in the same tab) resolve instantly without re-fetching. On fetch rejection, clears
  the cached promise before rethrowing, so a subsequent call retries the fetch fresh (this backs
  the retry-button UX in §5.1).

Implementation (exact):

```js
let _promise = null

export function loadDictionary() {
  if (!_promise) {
    _promise = import('./wordhuntDictionaryData.js')
      .then((mod) => ({
        has: (word) => mod.WORDHUNT_WORDS.has(String(word ?? '').trim().toLowerCase()),
      }))
      .catch((err) => {
        _promise = null
        throw err
      })
  }
  return _promise
}
```

### 3.3 `src/lib/wordhuntDictionaryData.js`

Pure data file, **zero imports** (so it code-splits cleanly and has no side effects on load).
Builder populates `WORDHUNT_WORDS` from a public-domain ENABLE/TWL-derived word list (same family
the PRD cites), lowercase, filtered to length ≥ 3. No need to cap the upper end — the no-reuse 16-
tile grid already bounds reachable word length to at most 16 letters (a little more with `qu`
expansion); don't bother truncating the source list on length. Target ~80–100k entries (roughly
200–300 KB gzipped is acceptable — fetched once, lazily, cached after).

```js
// Word Hunt dictionary data — reached only via the dynamic import() in
// wordhuntDictionary.js, so this becomes its own lazy-loaded build chunk.
// Source: public-domain ENABLE/TWL-derived word list, 3+ letters, lowercase.
// BUNDLE-LEAK CAVEAT: ships in the client; see wordhuntDictionary.js header.

export const WORDHUNT_WORDS = new Set([
  // ~80-100k lowercase words, 3+ letters
])
```

### 3.4 `src/lib/wordhuntLogic.test.js`

See §7 for the full enumerated case list.

### 3.5 `src/pages/WordHuntGame.jsx`

The room page — a type-C custom page dispatched from `Game.jsx`'s custom ladder (§6.4).

**Props (exact contract — matches every other custom-ladder page verbatim):**

```
WordHuntGame({
  gameId,          // string — games/{gameId} key
  game,            // object — live game node from Game.jsx's Firebase subscription
  mySymbol,        // 'X' | 'O' | null  (null = spectator)
  opponentOnline,  // bool | null — presence of the other seat
  onSwitchGame,    // (newType: string) => void, or null while a proposal is pending
  onPlayAgain,     // () => void, or null — wire the round-continue button to THIS (never onNewMatch)
  onNewMatch,      // () => void, or null — only the match-over "NEW MATCH" button uses this
  proposal,        // object | null — active rematch/switch proposal (ProposalBanner renders upstream in Game.jsx)
})
```

**PLAY AGAIN confirmation:** `Game.jsx`'s `applyPlayAgain` (src/pages/Game.jsx ~line 727) does
`update(ref(db, ...), { ...freshGameState(game.gameType), status: 'playing', winner: null,
winningLine: null, proposal: null, ... })` — i.e. it **re-invokes `freshGameState('wordhunt')`**,
which calls `generateGrid(generateSeed())` again with a fresh `Math.random()` seed. **A new grid
is guaranteed on every PLAY AGAIN**, with no extra code needed in `WordHuntGame.jsx` itself.

**Internal sub-components** (all defined inline in this file, not exported/shared — mirrors
`WordDuelGame.jsx`'s `GameBoard`/`Keyboard`/`WordInput` pattern exactly):

- `Tile({ letter, state })` — one grid cell. `state ∈ { 'idle', 'path', 'valid', 'duplicate',
  'invalid' }`. Renders "QU" when `letter === 'q'`, else the uppercased letter.
- `WordGrid({ grid, disabled, onSubmit, lastResult })` — owns the pointer-drag trace state (§5.2)
  and the physical-keyboard/type-to-submit fallback (§5.3); calls `onSubmit(rawWord)` on
  drag-release or Enter. Renders the 4×4 `Tile` grid, the current trace overlay, and the
  transient floating "+N" score-pop layer (§5.2). `disabled` freezes further input once `myDone`.
- `ScoreBar({ myScore, oppScore, myLabel, oppLabel, mySymbol })` — live score compare, modeled 1:1
  on `MathGame.jsx`'s `ScoreBar`.
- `WordList({ words, emptyHint })` — the player's own found-words list, own list only during play
  (PRD "Feedback" §UI — opponent's list is never rendered until the round ends).
- `EndPanels({ myWords, oppWords, myKey, oppKey, players, myMismatches, oppMismatches })` — the
  end-screen's dual word-list-side-by-side view (§5.5).

**Top-level render phases** (derived every render from `Date.now()` vs. `game.wordhuntStartedAt`,
mirroring Math/Typing exactly — no local phase state):

1. `!dict` (dictionary still loading) → full-screen `<ArcadeLoader variant="inline" />` gate
   (§5.1). This check happens **before** every other phase below, for both players and spectators.
2. `game.status === 'finished'` → end screen (§5.5).
3. Spectator (`!mySymbol`) → `<SpectatorCard game={game} statusOverride={...} />` (Math/Typing
   precedent) + read-only `ScoreBar` once playing.
4. `!wordhuntStartedAt` → "waiting to start" card with a READY button (§4.4).
5. `isCountdown` (`now < startedAt + COUNTDOWN_MS`) → 3-2-1 countdown card.
6. `isPlaying` (`now < startedAt + COUNTDOWN_MS + ROUND_MS`) → live play: timer, `ScoreBar`,
   `WordGrid`, `WordList` (own only), opponent ghost (score + count only, §5.6).

### 3.6 `src/pages/Demo.jsx` — no new file

Adds one function (`WordHuntDemo`) and one `DEMOS` entry. See §6.6 for the exact wiring.

---

## 4. Logic details

### 4.1 `generateGrid(seed)` algorithm

```
function generateGrid(seed):
    diceOrder = seededShuffle(BOGGLE_DICE, seed)   // 16 dice, shuffled; diceOrder[i] -> cell i
    cells = new Array(16)
    for i in 0..15:
        die = diceOrder[i]
        // Derive a per-cell seed so each cell's face pick is independent yet
        // fully reproducible from the single top-level `seed`. 104729 is just
        // a decorrelating prime offset (no cryptographic significance).
        faceOrder = seededShuffle([0,1,2,3,4,5], seed + i * 104729 + 1)
        face = faceOrder[0]
        cells[i] = die[face]
    return cells.join('')
```

Both random draws reuse the single exported `seededShuffle(arr, seed)` from `fibbageLogic.js` —
no new PRNG is introduced, and `fibbageLogic.js`'s private `mulberry32` is never touched or
duplicated. `seed` is expected to be the non-negative integer produced by `mathLogic.js`'s
`generateSeed()` (`Math.floor(Math.random() * 1_000_000_000)`), reused as-is per §0 finding 6 —
`wordhuntLogic.js` does **not** define its own seed generator.

Determinism: `seededShuffle` is a pure Fisher-Yates driven by `mulberry32(seed)`, so the same
`seed` value always yields the same `diceOrder` and the same 16 `faceOrder` picks, hence the same
16-character grid string, forever. (Unit-tested — §7.)

### 4.2 `findPath(grid, word)` algorithm

```
function findPath(grid, word):
    target = canonicalize(word)
    if target is empty: return null
    for start in 0..15:
        path = dfs(grid, target, start, emptySet)
        if path: return path
    return null

function dfs(grid, remaining, index, visited):
    if visited.has(index): return null
    letters = (grid[index] == 'q') ? 'qu' : grid[index]
    if not remaining.startsWith(letters): return null
    rest = remaining.slice(letters.length)
    nextVisited = visited + {index}
    if rest.length == 0: return [index]          // whole word consumed exactly here
    for neighbor in neighborsOf(index):
        sub = dfs(grid, rest, neighbor, nextVisited)
        if sub: return [index, ...sub]
    return null
```

Notes:
- `neighborsOf(index)` is the up-to-8 orthogonal+diagonal, in-bounds cell indices (row/col ±1,
  excluding self) — 8-directional adjacency, per the PRD.
- No tile reuse: `visited` is threaded through the recursion and checked on entry to `dfs`.
- `'q'` tiles consume exactly `'qu'` (2 characters) from `remaining` in one step; a candidate word
  that has `'q'` not immediately followed by `'u'` at that position simply fails the
  `startsWith` check and that branch dies (correct — Boggle's Qu tile cannot spell a bare "Q").
- Worst-case complexity is bounded by the 16-cell grid (branching ≤ 8, depth ≤ 16) — cheap enough
  to run on every drag-release and every typed Enter without debouncing.
- `findPath` does not check `MIN_WORD_LENGTH` or dictionary membership — those are separate gates
  applied by the caller (§4.3) before/instead of running the DFS, cheapest-check-first.

### 4.3 Submission pipeline (used identically by drag-release and type+Enter)

Run in `WordHuntGame.jsx`, in a single synchronous handler so the duplicate-guard can't race a
double-tap (mirrors `WordDuelGame.jsx`'s `processedGuesses = useRef(new Set())` pattern):

```
foundWordsRef = useRef(new Set())   // canonical words already scored this round, synchronous

function handleSubmit(rawWord):
    word = canonicalize(rawWord)
    if word.length < MIN_WORD_LENGTH:
        flash('invalid'); sounds.miss(); return
    if foundWordsRef.current.has(word):
        flash('duplicate'); return                 // no sound escalation, no Firebase write
    if !dict.has(word):
        flash('invalid'); sounds.miss(); return
    path = findPath(grid, word)
    if !path:
        flash('invalid'); sounds.miss(); return

    // Valid new word — optimistic local update, then persist.
    foundWordsRef.current.add(word)
    newWords = [...myWords, word]
    newScore = scoreWords(newWords)
    setMyWords(newWords)                            // local React state, immediate UI feedback
    setMyScore(newScore)
    flash('valid', path); sounds.hit(newWords.length)
    idx = myWords.length
    update(ref(db, `games/${gameId}`), {
      [`wordhuntWords${mySymbol}/${idx}`]: word,
      [`wordhuntScore${mySymbol}`]: newScore,
    }).catch(() => {})   // best-effort; local state already reflects the find either way
```

`flash(kind, path?)` drives the visual feedback (§5.2): `'valid'` flashes the tiles in `path` in
sequence (retro-win) and spawns a floating `+N`; `'duplicate'` shakes the current trace/typed
buffer amber; `'invalid'` shakes it red. All three clear themselves via `setTimeout` (no
persistent state).

Dictionary-check-before-DFS ordering is a performance nicety only (Set lookup is O(1) vs. DFS);
correctness doesn't depend on the order since both must pass.

### 4.4 Round lifecycle (mirrors `MathGame.jsx`'s `mathStartedAt`/`mathEndTime` pattern)

```
now = Date.now()
startedAt = game.wordhuntStartedAt ?? null
isCountdown = !!startedAt && now < startedAt + COUNTDOWN_MS
isPlaying   = !!startedAt && now >= startedAt + COUNTDOWN_MS
                          && now <  startedAt + COUNTDOWN_MS + ROUND_MS
                          && game.status !== 'finished'
deadline    = startedAt + COUNTDOWN_MS + ROUND_MS
timeLeftMs  = deadline ? max(0, deadline - now) : ROUND_MS
```

**Start (READY tap, any player):**

```
async function handleReady():
    if startedAt: return
    await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.wordhuntStartedAt) return   // abort — already started
        return { ...current, wordhuntStartedAt: Date.now() }
    })
```

Exactly `MathGame.jsx`'s `handleStartClick` / `TypingGame.jsx`'s `handleStartClick`, renamed.
Ticked by a `setInterval(100ms)` exactly like Math/Typing, driving re-renders so the derived
booleans above stay current.

**Per-client deadline crossing (each client independently, once):**

```
doneRef = useRef(false)
// inside the 100ms ticker, only when mySymbol is set (not for spectators):
if (isPlayingOrPastDeadline && now >= deadline && !doneRef.current) {
    doneRef.current = true
    update(ref(db, `games/${gameId}`), { [`wordhuntDone${mySymbol}`]: true }).catch(() => {})
    tryFinishGame()
}
```

**`tryFinishGame()` — the winner transaction, gated on the shared clock only (NOT on both done
flags — see §0 finding 4):**

```
async function tryFinishGame():
    try {
        await runTransaction(ref(db, `games/${gameId}`), current => {
            if (!current || current.status === 'finished') return
            if (Date.now() < (current.wordhuntStartedAt + COUNTDOWN_MS + ROUND_MS)) return // not over yet
            sX = current.wordhuntScoreX ?? 0
            sO = current.wordhuntScoreO ?? 0
            winner = sX > sO ? 'X' : sX < sO ? 'O' : 'draw'
            scores = { ...(current.scores || {}) }
            if (winner !== 'draw') scores[winner] = (scores[winner] || 0) + 1
            return { ...current, winner, status: 'finished', scores }
        })
    } catch { /* another client already resolved it — fine */ }
```

This is Math's `tryFinishGame` verbatim, with the score keys swapped. It can be safely called by
either player's client (or re-attempted on mount after a reload past the deadline — see §1 "Reload
mid-round"), any number of times, from any subset of clients present — the `status === 'finished'`
guard makes every call after the first a no-op. `wordhuntDoneX`/`O` are read nowhere in this
function; they exist purely for UI copy ("YOU'RE DONE — WRAPPING UP…", "OPPONENT IS FINISHING…").

**Why not gate on both done flags:** if the opponent's tab is closed, backgrounded (mobile timer
throttling), or its own ticker hasn't fired yet, gating would leave the round stuck at
`status: 'playing'` forever past the deadline. The PRD's own edge case ("Opponent quits: … round
still completes solo") requires exactly the clock-only gate used here.

**Match completion:** identical to every other custom page —
`matchWinner = (game.scores?.X || 0) >= MATCH_WINS ? 'X' : (game.scores?.O || 0) >= MATCH_WINS ?
'O' : null` (Math/Typing/WordDuel all hardcode `3` inline or via a local `MATCH_WINS` import; Word
Hunt imports `MATCH_WINS` from `wordhuntLogic.js`, WordDuel's cleaner pattern).

---

## 5. UI/UX

All colors via `retro-*` Tailwind tokens / `--c-*` vars only — **never hardcoded hex**. Boards are
DOM/CSS, not canvas. Sounds only via the existing `src/lib/sounds.js` API (no new sound file/API —
that file is not modified).

### 5.1 Dictionary-load gate

On mount, `WordHuntGame.jsx` calls `loadDictionary()` once (`useEffect`, empty deps) and stores the
resolved `{ has }` handle in `const [dict, setDict] = useState(null)`. While `!dict` (and no error),
render:

```jsx
<div className="min-h-screen bg-retro-bg flex items-center justify-center">
  <ArcadeLoader variant="inline" />
</div>
```

— identical wrapper to `Game.jsx`'s own `LoadingScreen` (~line 93-98), reusing the exact existing
component with zero new copy/markup invented. This check runs **before** the spectator/waiting/
countdown/playing checks in §3.5's phase list, so both players and spectators wait for it.

On rejection (`.catch` from the `loadDictionary()` call), set an error flag and render the same
wrapper with a small retry affordance below it:

```jsx
<p className="font-pixel text-[9px] text-retro-p2 mt-3">COULDN'T LOAD WORD LIST</p>
<button onClick={retry} className="mt-2 px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95">RETRY</button>
```

`retry` just re-invokes the effect (re-calls `loadDictionary()`, which — per §3.2 — re-attempts the
dynamic import fresh after a prior rejection cleared its cached promise).

The `Demo.jsx` `WordHuntDemo` performs the identical gate independently (its own `useState`/
`useEffect` calling `loadDictionary()`) — the underlying module-level promise cache in
`wordhuntDictionary.js` means a player who visited the real game first gets an instant resolve in
the demo (and vice versa), with no extra plumbing needed.

### 5.2 Grid + drag-trace input (primary, mobile-first)

Layout: `grid grid-cols-4 gap-2` container (mirrors `VisualMemoryBoard.jsx`'s existing 4×4 grid
exactly), each `Tile` an `aspect-square rounded border` button-like `<div>` (not an actual
`<button>`, since `WordGrid` handles pointer events at the container level — see below), sized to
fill a `max-w-xs` (or similar) box centered above the found-words list. `touch-action: none` is set
on the grid **container** (inline `style={{ touchAction: 'none' }}`, since Tailwind's `touch-none`
utility maps to the same property — either is acceptable, prefer the Tailwind class
`touch-none` if present in this project's Tailwind version, else the inline style) so a finger-drag
traces the grid instead of scrolling the page.

**Drag mechanics — container-level hit-testing, not per-tile pointer capture.** Do **not** rely on
per-`Tile` `onPointerEnter` handlers alone: `pointerdown` on mobile browsers implicitly captures
the pointer to the element it started on, so subsequent `pointerenter` events on sibling tiles
will **not** fire once dragging off the initial tile (this is a real, well-known cross-browser gap
— resolving it now so the builder doesn't discover it mid-implementation). Instead:

1. `onPointerDown` on a `Tile` starts a trace: `pathRef.current = [tileIndex]`, set
   `dragging = true`, mark the tile `state = 'path'`.
2. `onPointerMove` is attached to the **grid container**, not individual tiles. On every move
   event (while `dragging`), do `document.elementFromPoint(e.clientX, e.clientY)`, walk up to the
   nearest ancestor carrying a `data-cell-index` attribute (each `Tile` renders
   `data-cell-index={index}`), and if that index is (a) not already the last entry in
   `pathRef.current` and (b) an 8-adjacent neighbor of the last entry (`neighborsOf(last)`
   includes it) and (c) not already visited in `pathRef.current` — append it and mark it
   `state = 'path'`. Otherwise ignore the event (don't break the drag; just don't extend the path
   on a non-adjacent/already-used/off-grid hit).
3. `onPointerUp` (attached at the container level too, so releasing anywhere still ends the drag)
   builds `rawWord` by concatenating each path tile's letters (`'q'` → `'qu'`) in order, calls
   `onSubmit(rawWord)`, then clears the path/`dragging` state (all tiles back to `'idle'`,
   post-flash).

This container-level `elementFromPoint` approach works uniformly for mouse and touch pointer
events and needs no explicit `releasePointerCapture` calls.

**Feedback (per PRD, exact treatments):**
- **Valid new word:** each tile in the path flashes to `retro-win` in sequence (staggered ~40ms
  per tile via `setTimeout`, giving a visible "sweep"), then a floating `+N` pop appears (a small
  absolutely-positioned span near the grid's center, mounted with `opacity-0 translate-y-0`, then
  — after a `requestAnimationFrame` double-tick so the initial style commits first — flipped to
  `opacity-100 -translate-y-4` via a `transition-all duration-700` class, then unmounted via
  `setTimeout` after ~800ms). This is a plain React state-driven CSS-transition animation — **no
  new global `@keyframes` or Tailwind config changes needed** (deliberately avoided so this spec
  requires zero edits to `index.css`/`tailwind.config.js`).
- **Duplicate:** the traced tiles (or typed buffer) shake amber — apply a brief `animate-pulse`-
  style state on the tiles with an amber (`retro-cta`) border/background for ~400ms, no `+N`, no
  Firebase write.
- **Invalid:** same shake treatment but red (`retro-p2`), ~400ms.

Sounds: valid → `sounds.hit(myWords.length)` (rising pitch per additional find, existing API,
matches Math's combo/streak feel); duplicate → no sound (visual-only, avoids over-punishing normal
play); invalid → `sounds.miss()`. No new entries added to `sounds.js`.

### 5.3 Type + Enter fallback (secondary, desktop)

A single-line text input (or a styled buffer display, builder's call on exact markup) sits below
the grid, always rendered (not hidden on mobile — a mobile user can still tap it and use the OS
keyboard). Physical `keydown` listener while `isPlaying && !myDone`, mirroring
`WordDuelGame.jsx`'s exact pattern (`window.addEventListener('keydown', handler)` with
`e.ctrlKey/metaKey/altKey` bail-out, `Enter` → submit, `Backspace` → trim, `/^[a-zA-Z]$/` → append
uppercase to a local buffer).

On Enter: take the buffer, call `handleSubmit(buffer)` (§4.3) — the same pipeline the drag path
uses. If valid, `findPath(grid, canonicalize(buffer))` (already computed inside `handleSubmit`) is
reused to drive the identical tile-flash-in-sequence animation as a drag submission, so typed and
dragged words look the same on success. Clear the buffer after every submit attempt (valid,
duplicate, or invalid).

### 5.4 Own found-words list + ghost (during play)

- `WordList` renders the player's **own** words only, most-recent first, each with its per-word
  point value (e.g. "QUIET · 2"), scrollable if it overflows.
- Opponent "ghost": a compact `ScoreBar`-style line showing **opponent score + word count only**
  (`(normalizeWordList(game.wordhuntWords{opp}) || []).length`) — never the opponent's actual
  words. `normalizeWordList(raw)` is a small local helper defined inline in `WordHuntGame.jsx`
  (same numeric-keyed-object-to-array normalization as `WordDuelGame.jsx`'s local
  `normalizeGuesses`, adapted for a flat `string[]` instead of an array of `{word, marks}`
  objects) — not exported, not shared, page-local exactly like its precedent.
- Timer urgency: last 10 seconds (`timeLeftMs < 10_000`) switch the countdown numerals to
  `text-retro-p2 text-glow-p2` plus a pulse, mirroring the existing urgency-color convention (Math
  uses the same `retro-p2` treatment at its own threshold).

### 5.5 End screen

Once `game.status === 'finished'`:

1. **Score summary** — a 2-column grid of score cards (`ResultsPanel`-style, copy
   `MathGame.jsx`'s `ResultsPanel` layout: name, big score number, `retro-win` highlight on the
   winner).
2. **Word lists side by side** (`EndPanels`) — both players' full word lists, each word tagged
   with its point value. **Unique finds** (words only one player found — i.e. absent from the
   other player's canonicalized list) are highlighted (`retro-win`-tinted background or border).
   The single **highest-scoring word** across both lists is called out above the panels ("BEST
   WORD: QUIXOTIC · 11 · found by {name}" — tie broken by whichever appears first in X's list,
   then O's).
3. **Opponent-word verification** — for each word in the *opponent's* list, re-run
   `dict.has(word) && findPath(grid, word)`; if either check fails, flag that entry (small
   `retro-p2` "⚠" marker + tooltip/inline caption "couldn't verify"). This is informational only
   (honest-client tier, §1 "Timer authority") — a mismatch does not change the score or the
   winner, it's a transparency signal only, consistent with the PRD's "self-limiting" acceptance.
4. **Buttons** — reuse `<GameStatus>` exactly as Math/Typing do:
   ```jsx
   <GameStatus
     status={game.status} winner={game.winner} mySymbol={mySymbol}
     scores={game.scores} players={game.players} gameType={game.gameType}
     onPlayAgain={!matchWinner && !proposal ? onPlayAgain : null}
     onNewMatch={matchWinner && !proposal ? onNewMatch : null}
     onSwitchGame={!proposal ? onSwitchGame : null}
   />
   ```
   This gives PLAY AGAIN / NEW MATCH / SWITCH GAME / SHARE for free, with zero bespoke button
   markup — deliberately not copying `WordDuelGame.jsx`'s fully-custom button block, since
   `GameStatus` already covers everything the PRD asks for and Math/Typing already prove the
   pattern for a seeded-race custom page.

### 5.6 Waiting / countdown cards

Copy `MathGame.jsx`'s "waiting to start" and countdown card markup/structure verbatim (retro-card
bordered box, bullet list of rules, single centered START-equivalent button labeled "READY", then
a 3-2-1 `text-7xl text-retro-win text-glow-win` countdown card). Rule bullets (adapt Math's
4-line style):
```
● SAME GRID FOR BOTH · TRACE ADJACENT TILES
✎ ≥3 LETTERS · NO REUSING A TILE · Qu COUNTS AS 2
⏱ 80-SECOND HUNT · HIGHEST SCORE WINS
```

### 5.7 Mobile/touch summary

- `touch-action: none` on the grid container (see §5.2).
- Tiles sized for comfortable thumb dragging (`aspect-square`, adequate `gap-2`, container capped
  at a sensible max width, e.g. `max-w-xs`, centered).
- The typed-word fallback input remains reachable but is not the primary mobile flow.
- No hover-only affordances — all feedback (flash/shake) is visible without a mouse.

---

## 6. Integration touchpoints

### 6.1 `src/lib/games.js` — registry entry

Add to `GAME_TYPES`, immediately after the existing `wordduel` entry (both are `category: 'word'`,
keeping the two word games adjacent):

```js
  {
    type: 'wordhunt', label: 'WORD HUNT',
    desc: 'race to find the most words', Icon: WordHuntIcon,
    badge: 'WH', maxWidth: 'max-w-md',
    category: 'word',
    addedAt: '2026-07-11',
    durationMin: 2, tags: ['quick', 'thinky'], solo: true,
    custom: true,
  },
```

Add `WordHuntIcon` to the existing `GameIcons.jsx` import block at the top of `games.js` (the
block starting `import { TicTacToeIcon, ... WordDuelIcon } from '../components/GameIcons'`) —
append `WordHuntIcon` to that named-import list.

Add near the top of `games.js`, alongside the existing `import { generateSeed } from
'./mathLogic'` line: `import { generateGrid } from './wordhuntLogic'`.

### 6.2 `src/lib/games.js` — `FIELD_NULLS` additions

Insert immediately after the existing `mathStartedAt: null, mathEndTime: null,` line (before the
`diceScoreX: null, ...` line):

```js
  wordhuntGrid: null, wordhuntStartedAt: null,
  wordhuntWordsX: null, wordhuntWordsO: null,
  wordhuntScoreX: null, wordhuntScoreO: null,
  wordhuntDoneX: null, wordhuntDoneO: null,
```

### 6.3 `src/lib/games.js` — `freshGameState()` branch

Insert a new `if` branch, placed right after the existing `if (gameType === 'wordduel') { ... }`
block (both branches sit together, both are `category: 'word'`):

```js
  if (gameType === 'wordhunt') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      wordhuntGrid: generateGrid(generateSeed()),
      wordhuntScoreX: 0, wordhuntScoreO: 0 }
  }
```

(`wordhuntStartedAt`, `wordhuntWordsX/O`, `wordhuntDoneX/O` are left absent/`null` via the
`FIELD_NULLS` spread — they're populated during play, not at creation, exactly like
`mathStartedAt`/`typingStartedAt` are absent at creation in the existing `'math'`/`'typing'`
branches.)

### 6.4 `src/pages/Game.jsx` — import + custom-ladder dispatch

Add the import next to the existing `import WordDuelGame from './WordDuelGame'` (line 31):

```js
import WordHuntGame from './WordHuntGame'
```

Insert a new branch in the custom ladder (src/pages/Game.jsx, the `isCustom ? ( ... ) : ( ... )`
chain that currently ends `) : game.gameType === 'wordduel' ? ( <WordDuelGame .../> ) : (
<HangmanGame .../> )` around line 1398-1420) — insert the new branch **between** the `wordduel`
branch and the final `HangmanGame` fallback:

```jsx
          ) : game.gameType === 'wordhunt' ? (
            <WordHuntGame
              gameId={gameId}
              game={game}
              mySymbol={mySeat}
              opponentOnline={opponentOnline}
              onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
              onPlayAgain={activeProposal ? null : () => propose('playAgain')}
              onNewMatch={activeProposal ? null : () => propose('newMatch')}
              proposal={activeProposal}
            />
          ) : (
```

(The line immediately after this block in the current file, `<HangmanGame ... />`, is unchanged —
this new branch is spliced in just before it, following the exact prop-wiring pattern every
sibling branch in this ladder already uses — `activeProposal ? null : () => propose(...)` for
every action prop, verbatim.)

### 6.5 `src/components/GameIcons.jsx` — new icon

Append after the existing `WordDuelIcon` function (end of file, ~line 440):

```jsx
export function WordHuntIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* 4×4 letter-tile grid, faint */}
      {[4, 10, 16, 22].map((y) =>
        [4, 10, 16, 22].map((x) => (
          <rect key={`${x}-${y}`} x={x - 2} y={y - 2} width="4" height="4" rx="0.6"
            fill="currentColor" opacity="0.18" />
        ))
      )}
      {/* traced word path across five tiles */}
      <polyline points="4,4 10,4 16,10 22,10 22,16" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx="4" cy="4" r="1.5" fill="currentColor" />
      <circle cx="10" cy="4" r="1.5" fill="currentColor" opacity="0.85" />
      <circle cx="16" cy="10" r="1.5" fill="currentColor" opacity="0.85" />
      <circle cx="22" cy="10" r="1.5" fill="currentColor" opacity="0.85" />
      <circle cx="22" cy="16" r="1.5" fill="currentColor" />
    </svg>
  )
}
```

(Same 24×24 viewBox, `currentColor`/opacity-only styling as every other icon in this file — no
hex, matches the `VisualMemoryIcon`-style grid plus `WordDuelIcon`-style opacity layering.)

### 6.6 `src/pages/Demo.jsx` — demo wiring

1. Add `WordHuntIcon` to the existing `GameIcons` import line (the block starting `TronIcon,
   SumoIcon, SpaceDuelIcon, ChainReactionIcon, WordDuelIcon,`) — append `WordHuntIcon`.
2. Add near the top, alongside the existing `import { markGuess, isValidGuess, getKeyboardState,
   ... } from '../lib/wordduelLogic'` line:
   ```js
   import {
     generateGrid, findPath, scoreWord, scoreWords, canonicalize,
     neighborsOf, COUNTDOWN_MS, ROUND_MS,
   } from '../lib/wordhuntLogic'
   import { loadDictionary } from '../lib/wordhuntDictionary'
   ```
3. Add a `WordHuntDemo()` function, placed near `WordDuelDemo` (e.g. immediately after it, ~line
   466, before `SimonDemo`) — self-contained, own state, **no networking, no Firebase, no shared
   UI code with `WordHuntGame.jsx`** (per §0 finding 7): a local grid (`generateGrid(seed)` with a
   `useState(() => Math.floor(Math.random() * 1_000_000_000))` seed), its own 80-second local
   timer (`setInterval`), its own drag-trace + type+Enter input (same container-level
   `elementFromPoint` technique as §5.2, reimplemented locally — small, acceptable duplication,
   matching the existing precedent that demo components never import page components), and a
   simple canned "bot" final score revealed at the end (a plausible random score, `WordDuelDemo`'s
   "reveal on demand" pattern — e.g. `Math.floor(Math.random() * 40) + 20` bot points shown only
   after the player's own round ends), plus its own `useEffect` calling `loadDictionary()` and
   gating render on it exactly as `WordHuntGame.jsx` does (§5.1).
4. Add to the `DEMOS` array, in the "Solo / hangwoman" grouping, immediately after the existing
   `wordduel` entry:
   ```js
   { type: 'wordhunt', short: 'WORD\nHUNT', Icon: WordHuntIcon, Component: WordHuntDemo },
   ```

### 6.7 `src/lib/rules.js` — new entry

Add after the existing `wordduel` entry:

```js
  wordhunt: {
    objective: 'Trace more valid words than your opponent on a shared 4×4 letter grid before time runs out.',
    howToPlay: [
      'Both players get the identical grid and 80 seconds.',
      'Drag across adjacent tiles (including diagonals) to spell a word, or type it and press Enter.',
      'Words must be 3+ letters and can’t reuse a tile in the same word. The Qu tile counts as two letters.',
      'Both players can score the same word — there’s no penalty for overlapping finds.',
    ],
    win: 'Longer words score more (3–4 letters = 1 point, up to 11 for 8+). Highest total score when time runs out wins; equal scores draw. First to 3 round wins takes the match.',
  },
```

### 6.8 `src/lib/demoBots.js` — no changes

Word Hunt is a custom race page (type C), not a board-family `applyMove`/`getWinner` game — this
file is exclusively for `BotBoardDemo` and is untouched (§0 finding 8).

### 6.9 `database.rules.json` — no changes

`games/$gameId` is already permissive for all non-`players` keys (§0 finding 9).

---

## 7. Unit tests — `src/lib/wordhuntLogic.test.js`

- **`generateGrid`**
  - Same seed twice ⇒ identical 16-character string (determinism).
  - Different seeds ⇒ (very likely) different strings — assert at least one of several seed pairs
    differs, don't assert *all* differ (a collision is astronomically unlikely but not worth a
    flaky test).
  - Output length is always exactly 16.
  - Every character in the output is a lowercase letter or `'q'` (i.e., every character is one of
    the 26 lowercase letters — `'q'` is a valid output meaning the Qu die's Qu face was chosen).
  - **Dice coverage:** for a given seed, the multiset of *dice used* (not letters) — i.e., group
    the 16 output cells back by which die produced them — is exactly the 16 `BOGGLE_DICE` strings,
    each used exactly once. (Test this by re-deriving `seededShuffle(BOGGLE_DICE, seed)` in the
    test and asserting it's a permutation of `BOGGLE_DICE` with no repeats — or, more directly,
    assert that for a given seed, calling `generateGrid` doesn't ever produce two cells whose
    chosen letter could only have come from the same die twice in a way that violates the "each
    die used exactly once" invariant. Simplest concrete assertion: reimplement the die-assignment
    half in the test via the same `seededShuffle(BOGGLE_DICE, seed)` call and confirm it's a
    16-length permutation of `BOGGLE_DICE`.)
  - Exactly one cell's chosen die is `'himnqu'` (the only die containing `'q'`) for any seed, and
    that cell's letter is one of `h,i,m,n,q,u`.
- **`neighborsOf`**
  - Corner cell (e.g. index 0) has exactly 3 neighbors.
  - Edge, non-corner cell (e.g. index 1) has exactly 5 neighbors.
  - Interior cell (e.g. index 5) has exactly 8 neighbors.
  - No returned neighbor equals the input index (no self-neighbor).
- **`findPath`**
  - **Found, simple case:** construct a small fixed grid (not necessarily from `generateGrid`) by
    hand, e.g. a grid where indices 0,1,2 spell `'c','a','t'` and are mutually adjacent — assert
    `findPath(grid, 'cat')` returns `[0,1,2]` (or any valid adjacent path if multiple exist —
    assert the returned path decodes back to "cat" and each consecutive pair is in each other's
    `neighborsOf`).
  - **Not found:** a word whose letters don't appear in the grid at all ⇒ `null`.
  - **Not found — no valid adjacency:** a grid where the letters exist but never adjacently placed
    in the required order ⇒ `null`.
  - **No tile reuse:** a grid engineered so the only way to spell a word letter-by-letter would
    require revisiting a tile (e.g. a word like "ABA" where the only 'A' tile adjacent to 'B' is a
    single tile, forcing reuse) ⇒ `null`.
  - **`qu` handling:** a grid with a `'q'` cell adjacent to tiles spelling out the rest of a word
    like "quiet" (`q`-tile + i,e,t adjacent tiles) ⇒ path found, and the path length (4 tiles) is
    less than the word length (5 letters) because the `'q'` tile contributed 2 characters.
  - **8-direction adjacency:** a grid where a word is only traceable via a diagonal step (not
    reachable through a purely orthogonal path) ⇒ path still found (proves diagonals are honored,
    not just up/down/left/right).
  - Empty/whitespace input ⇒ `null`.
- **`scoreWord`** boundaries: length 2 → 0; length 3 → 1; length 4 → 1; length 5 → 2; length 6 →
  3; length 7 → 5; length 8 → 11; length 9 → 11 (still the 8+ bucket).
- **`scoreWords`**: sums correctly over a mixed-length list; empty list → 0.
- **`canonicalize`**: trims whitespace, lowercases, handles `undefined`/`null` → `''`.

---

## 8. Manual verification script

Requires two browser contexts (same-browser tabs share `playerId` — use a second, private/
incognito window, or a second browser/device, for Player 2, per this repo's standing convention).

1. **Room creation & dictionary gate:** Player 1 creates a Word Hunt room from Home. Confirm a
   brief `<ArcadeLoader variant="inline" />` appears before the waiting/READY screen (throttle
   network in devtools to "Slow 3G" once to make this visible; on a warm cache it may be too fast
   to see). Player 2 joins via the invite link in an incognito window; confirm the same gate shows
   independently there.
2. **Grid parity:** once both are past the dictionary gate and on the "waiting to start" screen,
   confirm (e.g. via each player reading the on-screen grid aloud, or briefly via Firebase console)
   that both clients render the **identical** 16-letter grid.
3. **READY race:** Player 1 taps READY. Confirm Player 2's screen (no action taken) also flips
   into the 3-2-1 countdown at the same moment (via Firebase's realtime push, not a poll).
4. **Drag tracing (mobile or trackpad):** during play, drag across several adjacent tiles on
   Player 1's device; release; confirm: a valid real word flashes green with a `+N` popup and adds
   to the found-words list; re-tracing the same word shows the amber duplicate shake and does not
   change the score; tracing a real word that isn't reachable adjacently on this grid, or a
   non-word, shows the red invalid shake.
5. **Type+Enter (desktop):** type a valid word and press Enter; confirm it auto-traces (tile flash
   sequence plays) and submits identically to a drag.
6. **Ghost display:** confirm Player 1 only ever sees Player 2's **score and word count**, never
   Player 2's actual words, until the round ends.
7. **Timer & urgency:** let the clock run down; confirm the last-10-seconds urgency color/pulse
   kicks in, and confirm neither player can submit new words once their own local timer reaches
   the deadline even if the other player's transaction hasn't landed yet.
8. **Round finish & solo-finish:** let the round expire naturally with both players present;
   confirm the winner transaction fires exactly once (check for duplicate score increments in the
   Firebase console — there should be none) and both clients land on the end screen with matching
   `scores`.
9. **Opponent-quits solo finish:** start a fresh round, then close Player 2's tab entirely mid-
   round (or just before the deadline). Confirm Player 1's client still reaches the end screen at
   the deadline (proves the finish transaction isn't stuck waiting on `wordhuntDoneO`).
10. **Reload mid-round:** mid-round, reload Player 1's tab. Confirm the grid, found-words list,
    score, and remaining time are all correctly restored from Firebase (remaining time should
    reflect real elapsed time, not reset to 80s).
11. **End screen verification:** after a round with both players having found several words,
    confirm the end screen shows both full word lists side by side, unique finds highlighted, the
    single best word called out, and that opponent-word verification doesn't flag any genuinely
    valid words as mismatched (a false-positive here would indicate a `findPath`/dictionary bug).
12. **PLAY AGAIN yields a new grid:** tap PLAY AGAIN (not NEW MATCH) after a round with no match
    winner yet; confirm the score carries over (match score persists) but a **freshly-shuffled
    grid** appears (different from the previous round's grid) for both players.
13. **SWITCH GAME clears state:** switch to a different game type mid-lobby, then switch back to
    Word Hunt; confirm no stale `wordhuntWordsX/O`/`wordhuntScoreX/O`/`wordhuntDoneX/O` leak in
    from the prior Word Hunt round (check Firebase console — all eight keys should be absent right
    after the switch, until a new round starts populating them again).
14. **Demo mode:** visit `/demo` (or `/solo/wordhunt`), select WORD HUNT, confirm the dictionary
    gate appears once, then a fully local practice round plays (grid, timer, drag/type input,
    scoring) with no network calls to Firebase.

---

## 9. Risks and mitigations

- **Dictionary corpus size/quality is entirely on the builder to source and curate** (this spec
  fixes the *shape* — `WORDHUNT_WORDS: Set<string>`, lazy-loaded — but not the actual word list
  content). Risk: a low-quality or too-small corpus makes common real words register as "invalid."
  Mitigation: use a well-established public-domain list (ENABLE/TWL-derived, as the PRD suggests)
  and spot-check a handful of common 3-8 letter English words resolve `true` before shipping.
- **Chunk not precached by the PWA service worker on first deploy.** `vite-plugin-pwa`'s default
  Workbox `globPatterns` typically precache all built JS chunks automatically (confirmed the
  plugin and `runtimeCaching` config already exist in `vite.config.js`), so no config change
  should be needed — but verify post-build that `wordhuntDictionaryData-*.js` actually appears in
  the generated precache manifest; if it doesn't, that's a `vite.config.js` follow-up outside this
  spec's file list.
- **Container-level `elementFromPoint` drag hit-testing has a per-move `document.elementFromPoint`
  call cost.** Cheap in practice (one DOM hit-test per `pointermove`, typically throttled by the
  browser to display refresh rate), but if profiling shows jank on low-end devices, a mitigation
  (not required for v1) would be to cache each tile's bounding rect on drag-start and do
  arithmetic hit-testing instead of `elementFromPoint` on every move.
  - **`findPath` DFS is re-run on every submit**, not on every drag-move — no perf concern in
  practice (bounded 16-cell search, only invoked at drag-release/Enter, not per-frame).
- **Two independent per-client "done" acknowledgements plus a clock-only finish transaction** could
  theoretically both fire in a tight race and both attempt `tryFinishGame()` — this is safe by
  construction (the transaction's `status === 'finished'` guard makes every call after the first a
  no-op), same resilience Math/Typing already rely on in production.
- **Bundle-leak caveat applies** — `wordhuntDictionaryData.js` ships the whole word list to any
  client that loads it; a determined player could read it from the network tab. Accepted, same
  residual-leak tier as every deck file on this platform, arguably lower-stakes here since a
  Boggle word list isn't itself a hidden "answer" (see §3.2 header caveat).
- **Boggle dice list correctness:** the 16-die array in §3.1/§4.1 was hand-verified in this spec
  (each entry checked to be exactly 6 characters, exactly one die containing `'q'`) — the builder
  should still copy it verbatim rather than retype it, to avoid a transcription slip.
