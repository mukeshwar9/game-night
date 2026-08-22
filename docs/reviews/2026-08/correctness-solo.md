# Solo / Reflex / Memory Games — Review

Scope: Simon, Chimp Test, Visual Memory, Number Memory, Reaction Time, Aim Trainer, Typing Race, Mental Math, Pairs, Dice (Pig / Pig Big), plus Daily Challenge and the Leaderboard. Shell/discovery/mobile UX out of scope (already audited elsewhere).

## Ranked findings

| # | Game | Finding | Severity | Effort |
|---|------|---------|----------|--------|
| 1 | Daily Challenge | Puzzle seed keys off the player's **local** calendar date, not UTC — players in different timezones near midnight get different seeds/questions while the UI states "SAME PUZZLE FOR EVERYONE TODAY" | broken | small |
| 2 | Daily Challenge | Score and streak live only in `localStorage`, never synced to Firebase — no way to compare today's result with friends despite "Daily Challenge" framing | weak | medium |
| 3 | Leaderboard | `rankEntries` lumps lifetime wins/losses across every game type into one tally with no per-game breakdown and no time window — a Pig (50%-luck) win counts the same as a Chimp Test (pure skill) win | weak | medium |
| 4 | Mental Math | `mathLogic.js` — the most complex logic module in this set (3-tier seeded generator, `isPower` cadence) — has no test file at all | weak | small–medium |
| 5 | Reaction / Aim / Typing | Final scores (`reactionTimesX`, `aimScoreX` via `increment()`, `typingWpmX`/`typingAccX`) are written straight from client-computed values with no server-side recheck — trivially cheatable via devtools, unlike Math (score recomputed inside the transaction from the shared seed) or Simon/Chimp/VM/NumberMemory (puzzle held server-side, client only reports position) | weak | n/a (assessment) / small to add sanity clamps |
| 6 | Mental Math | `handleSubmit`'s catch comment claims "retry; result will show via firebase update" but nothing retries — a thrown `runTransaction` (offline blip) leaves the UI stuck on "CHECKING..." forever with no toast, unlike every sibling page (Reaction/Aim/Typing all revert state + `toast.error`) | polish | small |
| 7 | Aim Trainer | Target-placement rejection sampling (`randomPos`) gives up after 12 attempts and uses the last position regardless — on a small viewport two targets can end up overlapping/touching | polish | small |

## Detail

**1. Daily Challenge timezone mismatch — `src/lib/daily.js:7-13`, `src/pages/DailyGame.jsx:21-22,154`**
`dateKeyFor()` uses `d.getFullYear()/getMonth()/getDate()` (local time). `todayKey()` calls it with `new Date()`. `seedFromDate(date)` hashes that string into the shared question seed. Two players a few hours apart in timezone are on different calendar dates for part of the day, so they solve different question sequences while the intro copy explicitly promises the same puzzle. Fix: derive the date key from UTC, or from a server/fixed epoch offset, not `Date()` local getters.

**2. Daily Challenge has no leaderboard — `src/lib/daily.js:38-64`, `src/lib/leaderboard.js` (whole file)**
`readBest`/`writeBest`/`bumpStreak` are pure `localStorage`. `fetchFriendsLeaderboard` only reads `users/{uid}/stats` (wins/losses/games from regular matches) — daily scores never touch that path. The entire point of a "daily" format is comparing today's run against friends; right now it's a private per-device counter. This is the single biggest replay-value gap in the set.

**3. Leaderboard mixes game types — `src/lib/leaderboard.js:13-36`, `src/pages/Friends.jsx:363-390`**
`rankEntries` sorts by raw `wins` → `winrate` → `games`, summed across every `gameType` ever played, lifetime, no window. A player who grinds easy wins in one game ranks above someone who only plays harder games well. No per-game or per-period slice exists to make the comparison fair.

**4. `mathLogic.js` untested — `src/lib/mathLogic.js`**
Every sibling logic module in this set (`simonLogic`, `chimpLogic`, `visualMemoryLogic`, `pairsLogic`, `diceLogic`) has a matching `.test.js`; `mathLogic.js` (seeded question generator across 3 difficulty tiers + power-question cadence) has none. Nothing currently pins that `generateQuestion(seed, index)` is deterministic, that `sub`/`sub2` never produce a negative answer, or that `isPower` fires on exactly every 8th index.

**5. Client-authoritative scores in Reaction/Aim/Typing — `src/pages/ReactionGame.jsx:170`, `src/pages/AimTrainerGame.jsx:163-167`, `src/pages/TypingGame.jsx:142-146`**
Contrast with the rest of the set: Pig uses a full commit-reveal seed protocol (`src/lib/diceLogic.js`, wired end-to-end in `Game.jsx:709-748,836-837` — confirmed live, not dead code); Simon/Chimp/Visual Memory/Number Memory keep the puzzle server-side and only accept a position index, so a client can't just claim victory. Reaction Time, Aim Trainer, and Typing instead let the client compute and write its own final stat (reaction ms array, `increment()` on hit, wpm/accuracy) with no opponent-side recompute. For a friends-and-family product this is low-stakes, but worth naming plainly since these are exactly the "score-reported-by-client" games the review was asked to flag.

**6. Math submit has no real error recovery — `src/pages/MathGame.jsx:335`**
```js
} catch { /* retry; result will show via firebase update */ }
```
No retry is scheduled and no state is reverted — `submittingRef`/`hasAnswered` stay true, so the question card shows "CHECKING..." indefinitely on a failed transaction. Reaction/Aim/Typing all revert local state and surface `toast.error(...)` on their equivalent write failures; Math should match that pattern.

**7. Aim Trainer overlap edge case — `src/pages/AimTrainerGame.jsx:110-119`**
`randomPos` retries up to 12 times to keep the new target `MIN_DIST` away from the opponent's, then just returns whatever the last attempt was. On a narrow phone viewport with two 48px-diameter targets this can leave them touching, occasionally letting a tap register on the wrong one.

## Games that are genuinely good (looked at, nothing to flag)

- **Simon** (`src/lib/simonLogic.js`) — one growing sequence shared by both players, clean replay/append state machine, full test coverage.
- **Chimp Test** (`src/pages/ChimpGame.jsx`) — same shared-layout design, plus a well-thought-out 45s opponent-idle claim mechanic (with a 30s hint) for an online-but-away opponent.
- **Visual Memory** (`src/lib/visualMemoryLogic.js`) — same shared-pattern pattern, correctly guards re-clicking an already-flipped cell, solid tests.
- **Number Memory** (`src/pages/NumberMemoryGame.jsx`) — shared number, reveal window scales with digit count so higher levels stay fair, same idle-claim safety net as Chimp.
- **Pig / Pig Big** (`src/lib/diceLogic.js`) — the standout of the set: a real commit-reveal coin-flip protocol so neither player's client can bias its own rolls, fully wired into `Game.jsx`, well-documented, thoroughly tested.
- **Pairs** (`src/lib/pairsLogic.js`) — honest in-code trust-model note about the known deck-leak, a bot with a tunable "remembers the twin" probability instead of a flat coin flip, and a genuine fuzz test for move legality.

## Test coverage gaps

- `src/lib/mathLogic.js` has no `.test.js` (see finding #4).
- Reaction Time / Aim Trainer / Typing / Number Memory keep their scoring math (WPM formula, speed-points formula, accuracy calc) inline in the page `.jsx` rather than in a `src/lib/*Logic.js` module, so none of it is unit-testable in isolation — it's only reachable by manually playing the game.

## Could not assess by reading

- Actual game-feel/animation timing and click responsiveness — needs the browser, which was out of scope.
- Bot difficulty tuning for the dedicated `SimonDemo`/`ChimpDemo`/`VisualMemoryDemo`/`NumberMemoryDemo`/`ReactionDemo`/`AimTrainerDemo`/`TypingDemo`/`MathDemo` components (`src/pages/Demo.jsx`) — these exist and are wired up, but their internal AI/pacing logic wasn't read in depth given the game-page and lib-logic focus of this pass.
- Whether the Daily timezone mismatch (#1) is actually noticed by real users — depends on device clock/locale distribution.
- Mobile layout specifics for Aim Trainer's target hit-boxes on very small screens.
