# PRD — Anagrams Race

**One-liner:** two players race on the same scrambled letters, finding as many valid words as possible before time runs out.

| | |
|---|---|
| `type` | `anagrams` |
| Label / badge | `ANAGRAMS` / `AG` |
| Category | `word` |
| Players | 2 |
| Integration | **C** — custom 1v1 race page |
| Network | RTDB (seeded race) |
| Effort | **M** |
| Priority | P2 — fast replay word game, complements Word Hunt/Word Duel |

## Goals

- Add a fast 2-player word race built around anagrams.
- Both players get the exact same letter rack and timer.
- Players score by finding valid words from the rack.
- Keep words common and fair; avoid obscure dictionary abuse in scoring.
- Make UI visually polished: big letter tiles, live opponent score, found-word bursts.
- Reuse dictionary infrastructure where possible.

## Non-goals for v1

- No solo daily mode.
- No more than 2 players.
- No asynchronous challenge mode.
- No custom racks.
- No definitions/hints.
- No long Boggle-style grid; this is rack anagrams, not path finding.

## Game rules

### Round

- Both players receive the same rack of letters.
- Rack size: `RACK_SIZE = 7`.
- Timer: `ROUND_MS = 90_000`.
- Players type words using only rack letters.
- Each found word can score once per player.
- Minimum word length: `MIN_WORD_LENGTH = 3`.
- Maximum word length: rack size.
- Valid word must be in accepted word list.
- Round ends when timer expires, or both players press `DONE`.

### Match

- Best of 3 rounds by default.
- Round winner gets 1 match point.
- Tied round gives no match point.
- First to 2 match points wins.
- `PLAY AGAIN` starts next rack while keeping match points.
- `NEW MATCH` resets scores and uses a new seed.

### Scoring

Score per found word:

| Word length | Points |
|---:|---:|
| 3 | 1 |
| 4 | 2 |
| 5 | 4 |
| 6 | 7 |
| 7 | 11 |

Bonuses:

- `+5` for using all 7 letters (bingo bonus).
- Optional v2: speed bonus for first player to find a word. Do not include v1; it adds sync complexity.

Winner:

- Higher round score wins.
- If tied score, more total words wins.
- If still tied, round draw.

## Rack generation

Rack quality matters. Random letters can create unfun racks.

### v1 approach

Use curated seed words as rack sources:

1. Pick a 7-letter answer word from an answer list.
2. Shuffle its letters to create rack.
3. Ensure rack has at least `MIN_SOLUTION_COUNT = 12` valid words of length 3+.
4. If not enough solutions, try next seeded candidate.

Example:

- seed word: `PLANETS`
- rack display: `S T A P L E N`
- valid finds: `planet`, `planets`, `plane`, `plate`, `slate`, `least`, `seat`, etc.

### Dictionary requirements

Need two lists:

- `ANAGRAM_RACK_WORDS`: common 7-letter words that make good racks.
- `ANAGRAM_VALID_WORDS`: accepted common words length 3–7.

Could reuse `src/lib/dictionary.js`/Word Hunt dictionary, but scoring should avoid ultra-obscure words. If current dictionary is too broad, add `src/lib/decks/anagrams.js` with curated valid words and rack words.

## Data model

Top-level state mirrors other race games; no sensitive info.

```
round: {
  phase: 'playing' | 'reveal',
  roundNum: number,
  seed: string,
  rack: string[],                 // ['S','T','A','P','L','E','N']
  startedAt: epochMs,
  endsAt: epochMs,
  foundX: { [word]: { at: epochMs, points: number } },
  foundO: { [word]: { at: epochMs, points: number } },
  doneX: boolean,
  doneO: boolean,
  result: null | {
    winner: 'X' | 'O' | 'draw',
    scoreX: number,
    scoreO: number,
    wordsX: number,
    wordsO: number,
  },
  revealEndsAt: epochMs,
}

scores: { X: number, O: number } // match points, not word points
status: 'waiting' | 'playing' | 'finished'
winner: 'X' | 'O' | 'draw' | null
```

No new top-level keys required beyond `round` and existing `scores`.

## Logic module

File: `src/lib/anagramsLogic.js`

Pure exports:

```js
export const RACK_SIZE = 7
export const ROUND_MS = 90_000
export const MIN_WORD_LENGTH = 3
export const MATCH_TARGET = 2

export function normalizeWord(word)
export function canBuildWord(word, rack)
export function scoreWord(word)
export function scoreFound(found)
export function compareRound(foundX, foundO)
export function seededRack({ rackWords, validWords, seed, used = [] })
export function getSolutions(rack, validWords)
export function applyFoundWord(found, word, rack, validWords, at)
export function shouldReveal(round, now)
export function getMatchWinner(scores)
```

Validation:

- Normalize to lowercase A–Z only.
- Reject if length < 3 or > 7.
- Reject if cannot be formed from rack letter counts.
- Reject if not in valid words set.
- Reject duplicate for same player.
- Same word can be found by both players; each scores independently.

Unit tests:

- letter-count validation with duplicates (`letter` rack cases).
- score table + bingo bonus.
- duplicate rejection.
- round comparison tie-breaks.
- seeded rack deterministic and has enough solutions.
- reveal condition: timer expired or both done.

## UI and visual direction

User wants word games to look nice. This should feel tactile and energetic.

### Overall mood

- Neon word arcade meets Scrabble tiles.
- Big draggable/tappable letter tiles.
- Race tension via live score and timer.
- Mobile-first, one-thumb playable.

### Layout

Top:

- Match score rail: `YOU ●` vs `THEM ○`, target 2.
- Timer bar across top; last 10 seconds pulses `retro-p2`.
- Opponent mini score: `OPPONENT 18 · 6 WORDS`.

Center:

- Large rack of 7 letter tiles.
- Tiles use retro card style, thick border, subtle shadow/glow.
- Pressing tile adds it to current word.
- Used tiles shrink/raise into input tray.
- `SHUFFLE` button randomizes tile order locally only.
- `CLEAR` button clears current word.

Input tray:

- Shows selected letters as tiles.
- Physical keyboard typing also works.
- `ENTER` submits.
- Submit feedback:
  - valid: tile burst, `+4`, sounds.hit(streak)
  - duplicate: small shake, `ALREADY FOUND`
  - invalid: shake, `NOT A WORD`
  - cannot build: `USE ONLY RACK LETTERS`

Found words:

- Two-column or tabbed list:
  - `YOUR WORDS` visible with words and points.
  - Opponent list hidden during play except count/score, to avoid giving away words.
- Reveal phase shows both full word lists side by side.
- New words animate into list with score chip.

Reveal:

- Big result banner: `YOU WIN 32–27`, `DRAW`, or `OPPONENT WINS`.
- Show best missed words under `WORDS YOU MISSED` (top 5 by points) to teach players.
- CTA: `NEXT RACK`, `NEW MATCH`, `SWITCH GAME`.

Accessibility:

- Letter tiles are buttons with aria labels.
- All feedback appears as text, not color only.
- Timer has numeric seconds.
- Keyboard-only flow works: type letters, Backspace, Enter.

## Firebase flow

### Initialize round

When `status === 'playing' && !round`:

1. First client transaction creates round.
2. Generate `seed`.
3. Pick rack from seeded rack generator.
4. Set `phase: 'playing'`, `startedAt`, `endsAt`, empty found maps.

### Submit word

Player transaction:

1. Check phase is `playing`.
2. Check not `doneX/O`.
3. Validate word against rack and dictionary.
4. Check not already in own found map.
5. Write `foundX/{word}` or `foundO/{word}` with `{ at, points }`.
6. If time expired after write, reveal may be triggered separately.

Note: local validation should happen before transaction for speed; transaction repeats enough checks to block stale/duplicate writes.

### Done

Player presses `DONE`:

- Set `doneX` or `doneO` true.
- If both done, transaction computes result and enters reveal.

### Timer reveal

Either client observing `now >= endsAt` runs transaction:

1. Confirm phase still `playing`.
2. Compute `scoreX`, `scoreO`, winner.
3. Increment match score for round winner.
4. If match target reached: after reveal, set `status: 'finished'`.
5. Else enter `reveal` with `revealEndsAt`.

### Next rack

After reveal:

- `NEXT RACK` creates next round with new rack and carries used rack seeds/words if tracked.
- If match target reached, show final screen instead.

## Files

| File | Contents |
|---|---|
| `src/lib/decks/anagrams.js` | curated rack words + valid words or references to dictionary |
| `src/lib/anagramsLogic.js` | pure validation/scoring/rack helpers |
| `src/lib/anagramsLogic.test.js` | unit tests |
| `src/pages/AnagramsGame.jsx` | Firebase flow + UI |
| `src/components/AnagramTiles.jsx` | rack/input tile controls |
| `src/components/GameIcons.jsx` | `AnagramsIcon` |
| `src/lib/games.js` | registry + fresh state |
| `src/lib/rules.js` | rules modal copy |
| `src/pages/Game.jsx` | custom ladder case |

## Registry

```js
{
  type: 'anagrams', label: 'ANAGRAMS',
  desc: 'race to find words', Icon: AnagramsIcon,
  badge: 'AG', maxWidth: 'max-w-sm',
  category: 'word',
  custom: true,
}
```

`freshGameState('anagrams')`:

```js
return { ...FIELD_NULLS, board: null, boxes: null, currentTurn: null, round: null }
```

## Rules modal copy

Objective:

> Build as many words as you can from the same scrambled letters before time runs out.

How to play:

- You and your opponent get the same 7 letters.
- Make words using only those letters.
- Longer words score more points.
- Each word can score once.
- Press DONE if you finish early.

To win:

> Higher score wins the rack. Win enough racks to take the match.

## Edge cases

- Duplicate letters in rack: validation must count letters exactly.
- Same word submitted by both players: allowed; both score.
- Player disconnects: timer continues; offline player can return before timer ends.
- Player submits at deadline: transaction may accept if phase still playing; timer reveal is eventual. This honest-client edge is acceptable.
- Very low-solution rack: seeded generator must reject before use.
- Spectators: see rack and live scores, not players' word lists until reveal.
- Dictionary too obscure: use curated valid list for v1 if broad dictionary feels unfair.

## Manual test plan

1. Two profiles join Anagrams.
2. Both see same rack and timer.
3. Submit valid 3/4/5/7-letter words; points match table.
4. Duplicate word rejected for same player.
5. Word impossible from rack rejected.
6. Opponent score/count updates live; words hidden until reveal.
7. Both press DONE; reveal happens early.
8. Timer expiry reveals if not done.
9. Winner gets match point; first to 2 wins match.
10. Next rack differs from prior rack.
11. Mobile: tile rack/input/found list are easy to use and visually polished.

## Acceptance criteria

- Game appears as `ANAGRAMS`.
- Two players race on same 7-letter rack.
- Valid words score by length with bingo bonus.
- Opponent words hidden during play, shown at reveal.
- Round winner and match winner computed correctly.
- Racks are deterministic, fair, and have enough solutions.
- UI has polished tiles, timer, live score, feedback bursts, reveal lists.
- Unit tests cover validation, scoring, rack generation, and winner logic.

## Proposed improvements — review 2026-09-22

These improvements are pending implementation. Prioritize input reliability, scoring clarity, and early-finish feedback before changing the timer or scoring balance.

### Preserve input during submission

Keyboard input currently remains active while a word submission is pending, but a successful submission clears the selection, including letters entered in the meantime. Keep the submitted word separate from the next draft so its acknowledgement cannot erase subsequent input. Preserve recoverable input on failure and prevent duplicate submissions.

Acceptance: under a delayed response, submitting a word and immediately typing the next word preserves the next draft. Repeated Enter presses do not score the same word twice; a failed submission leaves a clear retry path.

### Explain scoring before play

Show the existing points by word length, the full-rack bingo bonus, and the tie-break rule: equal points are decided by total words found; equal points and word counts produce a draw. Keep the rules and reveal explanation consistent.

Acceptance: a new player can explain how longer words score and why equal point totals can still produce a winner without reading implementation details.

### Clarify finishing early

Rename `DONE` to `FINISH EARLY` and explain that it ends the player's submissions for this round. After confirmation from Firebase, show “Waiting for opponent or timer” instead of leaving an unexplained disabled board. Both players finishing early must still trigger the reveal.

Acceptance: players understand the action before using it, see an explicit waiting state afterward, and cannot submit additional words once finished.

### Keep rejected words editable

Preserve the selected letters when a word is rejected so the player can correct it. Distinguish a word that is too short from a dictionary rejection. Report deadline or closed-round rejection as a round-state message rather than “NOT A WORD.”

Acceptance: an invalid draft remains editable; each rejection explains the actual cause, including a submission racing the deadline.

### Make missed words useful for learning

The accepted dictionary includes obscure entries, and the reveal currently ranks missed words only by points. Prefer familiar words in the teaching reveal and explain the accepted dictionary policy. Familiarity ranking for the reveal must not silently change which words count for scoring.

Acceptance: review sample racks with new players and check whether missed-word suggestions are understandable and useful. If obscure words dominate, revise the reveal selection before changing scoring or the accepted dictionary.

### Keep result ordering consistent

The score rail uses YOU–THEM ordering, while the reveal currently displays unlabeled X–O totals. Use consistent player ordering and label both point totals and word counts. Spectators should see player names rather than a personal perspective.

Acceptance: verify the reveal as X, O, and a spectator; each score and word count clearly belongs to the correct player.

### Validation scope

The review was based on code inspection; all 10 existing pure-logic tests passed. These tests do not verify the UI or multiplayer flow. Manually test delayed submissions with fast typing, submission failures, early finishing, deadline races, and tied scores using distinct browser profiles or devices. No timer or scoring changes are proposed by this review.
