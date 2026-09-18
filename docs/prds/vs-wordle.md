# PRD — Word Race (VS Wordle-style)

**One-liner:** two players race to solve the same hidden 5-letter word; fewer guesses wins, tie breaks by speed.

| | |
|---|---|
| `type` | `wordrace` |
| Label / badge | `WORD RACE` / `WR` |
| Category | `word` |
| Players | 2 |
| Integration | **C** — custom 1v1 simultaneous page |
| Network | RTDB |
| Effort | **M** |
| Priority | P2 — cleaner competitive Wordle than opponent-set Word Duel |

## Relationship to existing Word Duel

The platform already has **WORD DUEL** (`wordduel`): each player secretly picks a word for the other, and both solve different boards.

`WORD RACE` is different:

- Both players solve the **same** answer.
- No setting phase.
- No opponent grading or commit/reveal transcript needed in v1.
- Fairer and faster: same puzzle, simultaneous race.
- Better spectator tension: both boards progress side-by-side on one shared answer.

## Goals

- Add direct VS Wordle-style race.
- Use existing Word Duel marking/dictionary logic.
- Make it visually exciting: split-screen boards, live opponent ghost, race meter.
- Avoid repeated first word on play again/new match.
- Keep implementation smaller than Word Duel by using one shared answer.

## Non-goals for v1

- No player-chosen answers.
- No daily leaderboard.
- No best-of-N setup screen.
- No hard mode.
- No clue/hint economy.
- No anti-cheat beyond honest-client deck-game trust level.

## Game rules

- Both players receive same 5-letter answer.
- Both can guess simultaneously.
- Each player has up to 6 guesses.
- Guesses must be valid dictionary words.
- Feedback follows existing Wordle duplicate-letter rules from `wordduelLogic.markGuess()`.
- Round ends when:
  - both players are done, or
  - one player solves and the other has also either solved or used all guesses, or
  - optional soft timer expires after first solve (`FINISH_GRACE_MS = 30000`) so a stalled opponent cannot freeze.
- Winner:
  1. Player who solves while opponent fails.
  2. If both solve, fewer guesses wins.
  3. If same guess count, faster solve time wins.
  4. If both fail, draw.
- Standard room score increments winner by 1. Draw increments nobody.
- Match target uses existing custom convention: first to 3 round wins unless changed later.

## Timing

- `startedAt` set when round begins.
- Each guess stores `at` timestamp from server-corrected client time.
- `done.at` stores solve/fail time.
- Tie-break uses `done.at - startedAt`.
- Honest-client caveat: a malicious client could lie about timestamps. Accepted v1; same trust tier as other client-driven games.

## Data model

All game state under `round`.

```
round: {
  phase: 'playing' | 'reveal',
  roundNum: number,
  seed: string,
  answerIndex: number,
  startedAt: epochMs,
  guessesX: [ { word: string, marks: 'GYBBG', at: epochMs } ],
  guessesO: [ { word: string, marks: 'GYBBG', at: epochMs } ],
  doneX: null | { solved: boolean, guesses: number, at: epochMs },
  doneO: null | { solved: boolean, guesses: number, at: epochMs },
  result: null | { winner: 'X' | 'O' | 'draw', reason: 'solved' | 'speed' | 'fail' },
  used: number[],
  revealEndsAt: epochMs,
}
```

Top-level:

```
scores: { X: number, O: number }
winner: 'X' | 'O' | 'draw' | null
status: 'waiting' | 'playing' | 'finished'
```

No new top-level keys required.

## Answer selection and trust

- Pick answer by seeded shuffle from existing answer list.
- Store `answerIndex` in Firebase in v1.
- Exclude `round.used` to avoid repeats within match.
- New match/play again uses new seed to avoid same first word.
- Accepted bundle-leak caveat: dictionary ships in JS bundle and answer index is in RTDB. This is okay because the game is casual, fast, and cheating defeats the point.

Optional stronger v2:

- Store `answerCommitment` and reveal index after both done.
- But both clients need answer to mark guesses locally. A real hidden-answer race needs trusted server or precomputed mark oracle; not worth v1 complexity.

## Logic module

File: `src/lib/wordraceLogic.js`

Reuse/import from `wordduelLogic`:

- `markGuess(guess, answer)`
- `isValidGuess(guess)`
- `isSolved(marks)` if available

Pure exports:

```js
export const MAX_GUESSES = 6
export const MATCH_TARGET = 3
export const FINISH_GRACE_MS = 30000

export function pickAnswer(answerList, seed, used = [])
export function applyGuessForPlayer(round, player, guess, answer, at)
export function getDoneState(guesses)
export function compareRace(doneX, doneO)
export function shouldReveal(round, now)
export function nextRound(round, seed, answerIndex)
```

Unit tests:

- answer picking deterministic/excludes used.
- correct guess sets done solved.
- sixth wrong guess sets done failed.
- compareRace: one solves, fewer guesses, same guesses faster, both fail draw.
- shouldReveal waits for both done; honors finish grace.
- duplicate-letter marking fixture through `markGuess` integration.

## UI and visual direction

User wants word games to look nice. VS mode should feel like a race broadcast.

### Overall mood

- Competitive split-screen neon arcade.
- Same familiar tiles as Word Duel, but more kinetic.
- Strong "you vs them" side-by-side identity.

### Layout

Top:

- Score rail: `YOU 1` vs `OPPONENT 2`, target dots (`●●○`).
- Center race badge: `WORD RACE` / `ROUND 2`.
- Small timer from `startedAt` while playing.

Center:

- Two boards:
  - Your full 6×5 board with letters.
  - Opponent ghost board with marks only (letters hidden until reveal).
- On narrow phones:
  - Your board large.
  - Opponent board compact above/below as mini grid.
- On wider screens:
  - Boards side-by-side.

Race meter:

- Horizontal progress strip with two avatar tokens.
- Token position = solved progress heuristic:
  - number of submitted guesses plus bonus for green/yellow count.
- Purely visual; does not affect scoring.

Input:

- Word input + on-screen keyboard.
- Keyboard color state from your guesses.
- Submit button: `GUESS`.
- After done: input locks and copy says `WAITING FOR OPPONENT…`.

Opponent events:

- When opponent submits a guess, their ghost row flips without letters.
- If opponent solves, show `OPPONENT SOLVED` pulse but do not reveal word until round reveal.
- If you solve first, show `YOU SOLVED — OPPONENT HAS 30S` if finish grace is active.

Reveal:

- Show answer big in center.
- Reveal both boards with letters.
- Winner banner:
  - `YOU WIN — 4 GUESSES`
  - `OPPONENT WINS — FASTER`
  - `DRAW — BOTH MISSED`
- CTA: `PLAY AGAIN`, `NEW MATCH`, `SWITCH GAME`.

Animation/sound:

- Tile flips on each guess.
- Opponent ghost rows flip from their side.
- Correct solve: `sounds.win()` for solver, `sounds.lose()` if opponent wins later.
- Opponent guess: subtle `sounds.bell()` or `sounds.move('O')`.
- Reveal winner: use existing match/round sounds.

Accessibility:

- Marks have non-color symbols (`✓`, `•`, `×`) like Word Duel.
- Opponent board has aria labels: `opponent row 3: two green, one yellow`.
- Timer is text, not color-only.

## Firebase flow

### Initialize round

When `status === 'playing' && !round`:

1. First client transaction creates round.
2. Generate seed.
3. Pick answer excluding used.
4. Set `phase: 'playing'`, `startedAt`, empty guess arrays.

### Submit guess

Player writes through transaction:

1. Check phase `playing`.
2. Check player's guesses length < 6 and not done.
3. Validate dictionary.
4. Mark guess locally in transaction body.
5. Append to `guessesX` or `guessesO`.
6. Update `doneX`/`doneO` if solved or out of guesses.
7. If `shouldReveal` now true, compute result, increment score, set reveal.

### Finish grace

Effect on both clients checks:

- If one player solved and other not done, and `now >= solvedAt + FINISH_GRACE_MS`, run reveal transaction.

This prevents griefing/stalls after one solve while still giving opponent a comeback window.

### Next round / match end

After reveal:

- If either score reaches `MATCH_TARGET`, set `status: 'finished'`, `winner`.
- Else `PLAY AGAIN` creates next round with new seed and carries used list.

## Files

| File | Contents |
|---|---|
| `src/lib/wordraceLogic.js` | race helpers |
| `src/lib/wordraceLogic.test.js` | unit tests |
| `src/pages/WordRaceGame.jsx` | custom page and transactions |
| `src/components/WordRaceBoards.jsx` | polished board/ghost layout |
| `src/components/GameIcons.jsx` | `WordRaceIcon` |
| `src/lib/games.js` | registry + fresh state |
| `src/lib/rules.js` | rules modal copy |
| `src/pages/Game.jsx` | custom ladder case |

## Reuse/refactor note

Prefer reusing Word Duel's tile and keyboard rendering. If current components are embedded inside `WordDuelGame.jsx`, extract only if low risk. Keep `markGuess` and dictionary reuse mandatory; UI extraction optional.

## Rules modal copy

Objective:

> Race your opponent to solve the same secret word.

How to play:

- You both guess the same 5-letter word.
- Green means right letter and spot.
- Yellow means the letter is in the word but elsewhere.
- Gray means the letter is not in the word.
- Solve in fewer guesses, or solve faster on a tie.

To win:

> Win rounds to reach the match target first.

## Edge cases

- Both solve on same guess count at nearly same time: lower `done.at` wins; exact tie = draw.
- Opponent disconnects before finishing: finish grace can reveal after one player solves; otherwise existing offline notice applies.
- Player reloads: guesses live in Firebase; resume input if not done.
- Both clients reveal at same time: transaction guards phase/result.
- Spectator: sees both ghost boards during play, full boards at reveal.
- Existing Word Duel remains unchanged; do not replace it.

## Manual test plan

1. Two profiles join Word Race.
2. Both see same blank puzzle.
3. X submits guess; O sees ghost row only.
4. O submits guess; X sees ghost row only.
5. X solves in 3, O solves in 4; X wins.
6. Both solve in same guess count; faster one wins.
7. Both fail; draw.
8. One solves, other stalls; finish grace reveals.
9. Play again picks different answer.
10. Mobile layout looks polished, with opponent compact board readable.

## Acceptance criteria

- Game appears as `WORD RACE`.
- Both players solve same answer.
- Opponent letters hidden during play.
- Winner logic uses solve/fail, guesses, then speed.
- Finish grace prevents solved-player waiting forever.
- Play again/new match changes starting word.
- UI includes split/ghost boards, race meter, score rail, tile flips, and reveal banner.
- Logic tests cover race comparison and phase completion.
