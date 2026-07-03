# PRD — Word Duel (Wordle-style race)

**One-liner:** each player secretly picks a 5-letter word for the other, then both race to crack
their opponent's word in ≤6 guesses — hangwoman's commit-reveal trust model applied to the
Wordle format. ("Wordle" is an NYT trademark — ship as WORD DUEL.)

| | |
|---|---|
| `type` | `wordduel` |
| Label / badge | `WORD DUEL` / `WD` |
| Category | `word` (2 players + spectators) |
| Integration | **C** — custom page (asymmetric phases, hangwoman's closest sibling) |
| Network | RTDB + commit-reveal |
| Effort | **M** |
| Priority | P2 |

## Game rules

- **Setting:** each player picks a 5-letter word for their opponent. Must be in the curated
  **answer list** (~2.3k common words — no `XYLYL` sadism); client-validated at entry,
  cryptographically enforced at reveal.
- **Guessing (simultaneous, both race at once):** up to 6 guesses; each guess must be in the
  **valid-guess list** (~13k). Marks per Wordle convention: green = right letter right spot,
  yellow = in word wrong spot, gray = absent — with the exact **two-pass duplicate-letter rule**
  (greens consume first, then yellows limited by remaining letter counts; e.g. guessing `GEESE`
  against `THOSE`: only one E marks, as yellow… precisely specified and unit-tested — this
  algorithm is the #1 bug source in Wordle clones).
- **Round result:** solved in fewer guesses wins; equal guesses → faster total solve time (from
  `startedAt` to last guess); both fail (6 misses) → draw. One round = one standard scoreboard
  point via the usual winner transaction.

## Trust model

- At setting, each client runs `commit(word)` → publishes `hash` to `round/commits/{X|O}`;
  `{ word, salt }` goes to **`localStorage[wordduel-word-{gameId}]`** (localStorage, matching
  battleship's rationale: reload shouldn't force a concede; the opponent is on another device).
- **Grading:** guesses are marked by the *setter's* client (it knows the word): guesser pushes
  `{ word }` to `round/guesses<X|O>`, setter's client fills in `marks`. Both players are graders
  for each other, so both must be online — the existing presence UI covers the waiting state.
- **Reveal & verify:** when both are done (solved/failed), both publish `{ word, salt }`. Each
  client: `verifyReveal` against the commitment, answer-list membership check, and **recomputes
  every mark** with the shared pure `markGuess` function. Any mismatch → honest player wins the
  round with reason `'cheat'`.

## Data model

Everything in `round` — **no new top-level keys, no `FIELD_NULLS` changes.**
`freshGameState('wordduel')` → `{ …FIELD_NULLS, board: null, boxes: null, currentTurn: null,
round: { phase: 'setting' } }`.

```
round: {
  phase: 'setting' | 'guessing' | 'reveal' | 'done',
  commits: { X: hash, O: hash },          // both present ⇒ guessing begins
  startedAt: epoch-ms,
  guessesX: [ { word, marks: 'GYBBG'|null } ],   // X's guesses AGAINST O's word; O grades
  guessesO: [ … ],                                // and vice versa
  doneX/doneO: { solved: bool, guesses: n, at: ms },
  reveal: { X: { word, salt }, O: { word, salt } },
  result: { winner: 'X'|'O'|'draw', reason: 'solved'|'cheat'|'forfeit' },
}
```

## UI

- Own board: standard 6×5 tile grid + on-screen keyboard with accumulated letter states.
  Mark colors via theme tokens: green→`retro-win`, yellow→`retro-cta`, gray→`retro-dim`
  (plus symbols ✓/○ on tiles for color-blind safety — free with pixel aesthetics).
- **Opponent ghost:** a mini 6×5 grid showing only mark *colors*, no letters — spoiler-safe and
  properly tense ("they just went 4 greens"). Updates live. Spectators see both ghost grids.
- Setting phase: word input with live validation ("not in word list" shake — same copy Wordle
  users expect); READY state until both commits land.
- Grading latency: guess tiles flip to a "pending" shimmer until marks arrive from the opponent
  client (usually <1 s); if opponent presence is offline, show the standard waiting banner.
- Reveal screen: both words, both full boards, verify status, guess-count comparison.

## Files

| File | Contents |
|---|---|
| `src/lib/dictionary.js` | shared with Word Hunt (see word-hunt.md §Dictionary) — `has()` + `isAnswerWord()` |
| `src/lib/wordduelLogic.js` | `markGuess(guess, answer)` (the two-pass algorithm), `compareResults(doneX, doneO)`, `verifyTranscript(reveal, commit, guesses)` |
| `src/lib/wordduelLogic.test.js` | see Testing |
| `src/pages/WordDuelGame.jsx` | phase machine, both grading effects, keyboard component |
| Registration | registry entry (`custom: true`), icon, ladder case, `freshGameState` branch |

## Edge cases

- Duplicate letters: `markGuess` is the shared source of truth for grader *and* verifier —
  they cannot diverge by construction.
- Guesser submits a valid word the setter's client never grades (setter closed tab):
  presence-driven waiting; the setter reclaims their seat on return (uid-based) and their client
  backfills pending marks from localStorage word. Storage gone → concede button (hangwoman
  convention, now rarer thanks to localStorage).
- Same word both directions (coincidence): fine — boards are independent.
- Guess spam: max 6 enforced client-side and by array length at verify.
- No round timer v1 (presence + concede covers stalls); a 5-min soft cap is stretch.

## Testing

- Unit — `markGuess` is the star: all-green, no-match, duplicate-in-guess vs single-in-answer,
  duplicate-in-answer vs single-in-guess, double-double, green-consumes-yellow priority
  (`SPEED` vs `ERASE` style fixtures), plus a table of known Wordle-community edge fixtures.
- `compareResults`: fewer guesses, tie→time, both-fail draw, one-fail.
- `verifyTranscript`: honest pass; tampered marks fail; non-answer-list word fails; wrong salt fails.
- Manual: full duel two browsers; setter reload mid-guess (localStorage recovery); cheat
  simulation via console edit; spectator ghosts.

## Stretch

Best-of-3 within one room (guess boards reset, scores accumulate — `onPlayAgain` already gives
this); 6-letter variant; head-to-head timer cap; keyboard heatmap stats on profile.
