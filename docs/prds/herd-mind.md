# PRD — Herd Mind (majority game)

**One-liner:** "name a pizza topping" — everyone answers simultaneously and you score by matching
the majority. The lightest possible party add: fibbage's skeleton with a new deck and a twist
(the Pink Cow).

| | |
|---|---|
| `type` | `herd` |
| Label / badge | `HERD MIND` / `HD` |
| Category | `party` (3–8 players) |
| Integration | **D** — custom party page |
| Network | RTDB |
| Effort | **S** — smallest party add; reuses the fibbage flow almost verbatim |
| Priority | P2 |

## Game rules

- **Round:**
  1. **Answering (45 s):** prompt shown ("Name a food you eat with your hands"); every player
     submits one free-text answer. Answers hidden until reveal.
  2. **Reveal:** answers grouped by normalized text. Every member of the **largest group** scores
     1 point (ties → all tied groups score). Groups displayed biggest-first with member avatars.
  3. **The Pink Cow 🐄:** if **exactly one player** matched nobody (a single singleton while all
     other answers grouped), that player takes the Cow. The Cow holder **cannot win**. The Cow
     moves only when a new sole odd-one-out appears (then it transfers) — otherwise it stays.
  4. Host taps NEXT → next prompt.
- **Match:** first player to reach **8 points while not holding the Cow** wins. Reaching 8 with
  the Cow means you keep playing until you shed it — this is the game's signature comedy beat;
  the UI must milk it (cow parked on your avatar, "CAN'T WIN WITH THE COW").

## Grouping

`normalizeAnswer()`: lowercase, trim, collapse whitespace, strip punctuation, strip a trailing
`s` when length > 3 (naive plural fold: "tacos" == "taco"; "chess" is safe at 4+… no — guard the
fold with a vowel check or minimum stem length 4 to avoid "chess"→"ches"; exact heuristic is
unit-tested and easy to tune). Grouping is **exact match on the normalized form** — deterministic,
so any client computes identical groups; the host applies scores once via `round.scored`
(fibbage pattern).

Fuzzy merge ("peperoni" → "pepperoni") is a **stretch**: host-only UI to tap two groups and merge
before scoring, written as `round.merges` so all clients re-derive identically.

## Data model

One new top-level key (must persist across rounds → added to `FIELD_NULLS`):

```
herdCow: uid | null          // current Pink Cow holder
```

Everything else in `round`:

```
round: {
  phase: 'answering' | 'reveal',
  promptIndex: number,          // sequential through a match-seeded shuffle of the deck
  deckSeed: number,             // set at match start; prompt order = seededShuffle(deck, seed)
  answers: { uid: string },     // plaintext; hidden by UI until reveal — accepted casual leak
  scored: true,                 // idempotent host application
}
scores/{uid}: number
```

`freshGameState('herd')` → party branch; registry `startRound()` →
`{ round: { phase: 'answering', promptIndex: 0, deckSeed: <random> } }`.

Timer: 45 s from phase entry, corrected clock; host advances to reveal early when all seated
players have answered (the common case).

## Deck — `src/lib/decks/herd.js`

~150 prompts. Selection criteria: **many valid answers with 2–4 obvious ones** ("name a
superpower", "a two-letter word", "something you'd bring camping"). Avoid prompts with one
canonical answer (no herd to find) or infinite spread (no matches ever). Include the fibbage
bundle-leak caveat comment — though for Herd Mind reading the deck gains you nothing, since the
target is other players' heads, which is also the pitch for why this game's trust model is the
strongest on the platform.

## UI

- Answering: big prompt card, single text input, LOCKED IN state showing who's still typing
  (presence-style dots per avatar).
- Reveal: groups as stacked cards, biggest first, avatars on each; +1 badges rain on the winning
  group; Cow transfer gets a dedicated full-width moment with sound.
- Scoreboard rail: per-uid scores with the Cow emoji parked on its holder; first-to-8 target
  shown.
- Mobile-first layouts throughout (party games are couch/phone games).

## Files

| File | Contents |
|---|---|
| `src/lib/decks/herd.js` | prompts + caveat comment |
| `src/lib/herdLogic.js` | `normalizeAnswer`, `groupAnswers`, `scoreGroups`, `nextCow(groups, currentCow)`, `getMatchWinner(scores, cow)`, `seededShuffle` |
| `src/lib/herdLogic.test.js` | see Testing |
| `src/pages/HerdGame.jsx` | two-phase machine (simplest party page yet — start from FibbageGame, delete) |
| Registration | registry entry (`nPlayer: true, minPlayers: 3, maxPlayers: 8`), icon, ladder case |

## Edge cases

- All answers unique: nobody scores, **no Cow** (rule requires exactly one singleton).
- Two singletons: no Cow transfer.
- Everyone matches: everyone scores; no Cow change.
- Player joins mid-match: scores from 0, eligible for Cow immediately.
- Answer timeout with missing answers: absent players just don't group; they can't take the Cow
  that round (empty ≠ singleton — exclude non-answers from grouping and Cow logic).
- Cow holder disconnects/leaves: Cow stays with them (they may return); if they're removed from
  seats, host's next `scored` application clears `herdCow` if holder no longer seated.

## Testing

- Unit: normalization (plural fold guards!), grouping determinism, largest-group ties, Cow
  assignment matrix (one singleton / several / none / non-answer excluded), win-blocked-by-Cow,
  seeded prompt order.
- Manual: 3 browsers, full match including a Cow transfer and a blocked win at 8.
