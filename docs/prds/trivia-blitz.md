# PRD — Trivia Blitz

**One-liner:** Kahoot-style speed trivia — everyone answers the same multiple-choice question at
once, faster correct answers score more. Reuses the fibbage skeleton with a big deck.

| | |
|---|---|
| `type` | `trivia` |
| Label / badge | `TRIVIA BLITZ` / `TQ` |
| Category | `party` — but **`minPlayers: 2`** (trivia is great head-to-head; first party game to allow 2) |
| Integration | **D** — custom party page |
| Network | RTDB |
| Effort | **S/M** |
| Priority | P3 |

## Game rules

- **Match:** 10 questions (constant `MATCH_QUESTIONS`), drawn without repeats from a
  match-seeded shuffle of the deck, ordered easy→hard (sort the drawn 10 by difficulty tier).
- **Question phase (15 s):** prompt + 4 options (A/B/C/D). Everyone answers once, secretly.
  Phase ends at timeout or when all seated players have answered.
- **Scoring:** correct = `500 + round(500 × timeRemaining/15s)` speed bonus; streak bonus
  `+100 × (streak − 1)` capped at `+300`. Wrong/no answer = 0 and streak resets. All constants
  tunable in `triviaLogic.js`.
- **Reveal phase (5 s):** correct answer lit, answer distribution as bars, per-player deltas,
  running top-3 ticker.
- **End:** highest total wins (ties share). Standard party end-screen conventions.

## Data model

Everything in `round` — **no new top-level keys, no `FIELD_NULLS` changes.**

```
round: {
  phase: 'question' | 'reveal' | 'end',
  deckSeed: number,            // set at match start → question order = seededDraw(deck, seed, 10)
  qNum: 0-9,
  qStartAt: epoch-ms,          // written by host at phase entry (corrected clock)
  answers: { uid: { choice: 0-3, at: epoch-ms } },
  scored: true,                // idempotent host application (fibbage pattern)
  streaks: { uid: n },         // carried forward by the scoring step
}
scores/{uid}: number
```

Registry `startRound()` → `{ round: { phase: 'question', qNum: 0, deckSeed: <random>,
qStartAt: <now> } }`. Host advances phases (all-answered early-advance or timeout) and applies
scores once via `scored`.

**Timing integrity:** score is computed from `answers[uid].at − qStartAt` using
server-corrected timestamps; answers with `at > qStartAt + 15000 + 1500ms grace` score 0 at the
scoring step (host-enforced, deterministic). A hacked client lying about `at` is the accepted
honest-client tier — same trust level as every deck game.

**Bundle leak:** answer indices ship in the deck — copy the fibbage caveat verbatim into
`src/lib/decks/trivia.js`. (Looking up answers costs time, which speed scoring punishes — the
leak is partially self-limiting here.)

## Deck — `src/lib/decks/trivia.js`

```js
{ q: 'Which planet has the most moons?', options: ['Saturn','Jupiter','Mars','Neptune'],
  answer: 0, cat: 'science', diff: 1 }
```

- **200+ questions** at launch across ~6 categories (science, history, geography, pop culture,
  sports, wordplay), difficulty tiers 1–3. Write original questions (facts aren't
  copyrightable, but don't lift question text verbatim from existing quiz products).
- Deck curation is honestly the bulk of this game's effort — logic and UI are a week's
  afternoon each; a *good* deck is the product.

## UI

- Question card big and readable at phone distance; 4 option buttons in the classic 2×2 grid,
  each with a distinct pixel glyph (▲■●◆) + theme accents (color alone never distinguishes —
  color-blind rule).
- Locked-in state: your pick outlined, "3/5 ANSWERED" live counter, timer bar draining across
  the top (urgency color shift in last 5 s).
- Reveal: correct option flares `retro-win`; wrong picks dim; distribution bars per option with
  avatar chips; +points float per player; streak flame icon at ≥3.
- Final standings: podium treatment for top 3, full list below, PLAY AGAIN (new seed —
  `onPlayAgain` keeps nothing here since scores reset per match; party pages manage their own
  match lifecycle like fibbage).

## Files

| File | Contents |
|---|---|
| `src/lib/decks/trivia.js` | the deck + caveat comment |
| `src/lib/triviaLogic.js` | `seededDraw(deck, seed, n)` (shuffle + difficulty sort), `scoreAnswer(correct, at, qStartAt, streak)`, `applyRoundScores(answers, question, streaks)` |
| `src/lib/triviaLogic.test.js` | see Testing |
| `src/pages/TriviaGame.jsx` | phase machine — closest existing skeleton is FibbageGame minus the lying phase |
| Registration | registry entry (`nPlayer: true, minPlayers: 2, maxPlayers: 8`), icon, ladder case |

## Edge cases

- All players answer wrong: reveal still shows distribution; no scores; streaks reset.
- Host disconnects between phases: existing party-host conventions apply (whoever the party
  pages treat as host on reconnection — reuse, don't invent).
- Player joins mid-match: spectates until next match (10-question arc shouldn't be joinable
  mid-way; simplest correct rule).
- Clock skew: all comparisons use `.info/serverTimeOffset`-corrected times on the host at
  scoring time — never raw client clocks.
- `minPlayers: 2` is new for the party plumbing — verify the lobby copy ("3–8 players" strings)
  is per-game via `getPlayerTag`, not hardcoded.

## Testing

- Unit: seeded draw determinism + no repeats + difficulty ordering; speed-score boundaries
  (instant, last-moment, post-grace = 0); streak accumulation/reset/cap; idempotent
  `applyRoundScores`.
- Manual: 3 browsers full match; head-to-head 2-player match; late-answer rejection; mid-match
  join → spectator.

## Stretch

Category picker at match start; picture questions; deck expansion packs; per-uid lifetime
accuracy on profile (planned leaderboard tie-in).
