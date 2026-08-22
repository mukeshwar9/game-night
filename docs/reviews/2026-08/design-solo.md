# Design Review — Solo / Reflex / Memory Games

Scope: Simon (`simonLogic.js`), Chimp Test (`chimpLogic.js` + `ChimpGame.jsx`), Visual Memory (`visualMemoryLogic.js`), Number Memory (`NumberMemoryGame.jsx`), Reaction Time (`ReactionGame.jsx`), Aim Trainer (`AimTrainerGame.jsx`), Typing Race (`TypingGame.jsx`), Mental Math (`mathLogic.js` + `MathGame.jsx`), Pairs (`pairsLogic.js`), Dice / Pig / Pig Big (`diceLogic.js`); plus Daily Challenge (`daily.js` + `DailyGame.jsx`) and Leaderboard (`leaderboard.js` + `Friends.jsx`) as retention *features*, not games. Read-only — no code changed, no build/dev-server/browser used.

Calibration note: the prior board-game design pass (`games-design-pass-s1/report.md`) found real cut candidates (TTT 4x4, Connect Four 5-in-a-row) — variants that made an already-shallow, already-solved game longer without adding a decision. **This set doesn't have that failure mode anywhere.** Every one of the 10 games here is a mechanically distinct test (memory span, reflex latency, motor aim, typing throughput, mental arithmetic, push-your-luck banking), so there's no "same game, slower" duplicate to cut. The weaknesses in this set are different in kind: shallow decision depth in a few individual games, and a genuinely broken retention layer (Daily Challenge, Leaderboard) sitting on top of an otherwise sound set. Correctness bugs already logged in `games-review-solo-s1/report.md` are referenced only where they bear on a design question, not repeated.

---

## Ranked, best to worst

1. **Pig / Pig Big (push-your-luck dice)** — the only genuine risk-calibration decision in the set; every roll is a real choice with a live, calculable cost.
2. **Mental Math** — real arithmetic-speed skill plus an actual in-game decision (bank a fast/risky answer vs. a slow/safe one, via the speed-points curve and streak multiplier).
3. **Pairs** — classic head-to-head memory-matching with real shared information and real interaction between the two players' turns.
4. **Chimp Test** — highest skill ceiling of the four "growing shared sequence" memory games; genuinely trainable, well-executed idle-claim safety net.
5. **Aim Trainer** — has a real interaction most of its reflex siblings lack (the opponent's target is a live distractor, not just a parallel scoreboard).
6. **Simon** — good shared-sequence head-to-head design, real but attention-bounded skill ceiling.
7. **Number Memory** — genuinely trainable (digit-span, mnemonics exist) but almost no player will discover the technique that unlocks the real ceiling.
8. **Visual Memory** — same "growing shared sequence" shape as Simon/Chimp but a shallower one: a 16-cell grid caps how differentiating spatial recall can get before the board itself runs out of room.
9. **Typing Race** — an honest, well-known skill test with a nice ghost-marker touch, but zero in-game decision: the outcome is a straight typing-speed comparison.
10. **Reaction Time** — the framework's own textbook case: performance is dominated by a near-fixed human reflex latency, not a learnable strategy; lowest decision depth of the set.

Daily Challenge and Leaderboard are evaluated separately below as retention features, not ranked as games.

## Keep / Rework / Cut

| Game | Verdict | One line |
|---|---|---|
| Pig | **Keep** | Best design in the set — real push-your-luck choice, fair commit-reveal RNG. |
| Pig Big | **Keep** | Legitimate variant — "only snake-eyes busts" changes the risk curve, not just the board. |
| Mental Math | **Keep** | Real skill + real speed/accuracy tradeoff; add a test file (already flagged as a correctness gap). |
| Pairs | **Keep** | Genuine multiplayer memory game, nothing to fix mechanically. |
| Chimp Test | **Keep** | Real trainable ceiling, best-executed idle-claim UX of the memory games. |
| Aim Trainer | **Keep** | The one reflex game with a real interaction (friendly-fire distractor). |
| Simon | **Keep** | Solid shared-sequence design; ceiling is attention-bounded but that's honest, not broken. |
| Number Memory | **Keep** | Sound test; ceiling is theoretical for most players but the game isn't at fault for that. |
| Visual Memory | **Keep** | Fine as-is; shallower sibling of Chimp, not a problem to fix. |
| Typing Race | **Keep (on-ramp/skill-check tier)** | Zero decision depth by design — same honest role TTT-3x3 plays in the board-game set. |
| Reaction Time | **Keep (on-ramp tier)** | Weakest game in the set by design, but costs nothing to keep and plays the same role. |
| Daily Challenge | **Rework** | Timezone-broken date key + zero cross-player comparison undermines its entire premise. |
| Leaderboard | **Rework** | Lumps every game type and all time into one tally; not usable as a skill signal for any single game. |

---

## Cross-cutting: is the "race" frame right, or is this a solo test wearing competitive clothes?

Split cleanly into two groups by *information flow between the two players during the round*, not by genre label:

**Real interaction (the live opponent earns their seat):**
- **Pig** — turn-alternating, shared target score; every bank/roll decision is made *in light of* the opponent's current score. Removing the opponent removes the game.
- **Pairs** — shared deck, shared flip history; my second flip's odds depend on what the opponent has already revealed this round. Removing the opponent just makes it solitaire.
- **Simon / Chimp / Visual Memory** — a single shared sequence that both players attempt each round; whoever breaks first loses that round. This is a real head-to-head structure (spelling-bee shaped), not a parallel race — the stakes are shared even though the *inputs* are simultaneous.
- **Aim Trainer** — the opponent's target sits on *my* screen as a live distractor (clicking it is -1 and a "friendly fire" stat). That's a genuine interaction layer none of the other reflex games have.

**Solo test dressed as competitive (parallel instances, compared at the end, zero interaction during play):**
- **Reaction Time** — both players run an identical 4-round protocol in isolation; the only shared state is the final averages compared after the fact. A single-player "beat your own average" mode with a personal-best leaderboard would lose nothing.
- **Typing Race** — same shape; the ghost-marker on the passage is a nice touch but it's a *display* of the opponent's position, not an interaction with it (typing faster doesn't affect what they see).
- **Number Memory** — same shared-number-shown-to-both-of-you shape as Simon/Chimp on paper, but because there's no possible interference between two players' recall attempts (no shared board, no visible opponent state during the memorize/recall phases beyond a checkmark), it plays like two solo digit-span tests running in parallel rather than a shared-stakes duel.
- **Mental Math** — questions are shared (same seed) but each player advances their own index at their own pace with no way to affect the other's board; the "duel" framing is really "compare two solo speedruns," redeemed only by the in-game speed/streak decision layer, which is why it still ranks well above Reaction/Typing on this list.

None of the "parallel instance" games are *badly designed* for it — Reaction Time in particular can't really be anything else, since human reflex latency isn't a thing two people can meaningfully contest turn-by-turn. The honest conclusion: **Reaction Time, Typing Race, and Number Memory would lose nothing and gain motivation clarity by being framed primarily as solo score attacks with a live opponent as an optional side-by-side comparison, rather than "duels."** Mental Math is close to this line too, but its speed/streak decision layer earns it more of a "duel" claim than the others.

## Motivation: the shared structural problem, and the one concrete fix

Per the framework, Motivation requires the outcome to affect persistent state. Across this entire set, outcome affects exactly one persistent thing: a lifetime `wins`/`losses`/`games` counter in `users/{uid}/stats`, fed into the cross-game Leaderboard (see below) — and that counter is *match* win/loss, which throws away the actual skill signal every one of these games produces (a level reached, an average reaction time, a WPM, a math score). A player can plateau at Chimp level 6 forever and their stats node looks identical to a player who's climbed to level 15, as long as they're matched against similarly-skilled opponents.

**The single concrete fix that would move all nine score-producing games at once:** persist each game's *own* best metric per player — `users/{uid}/pb/{gameType}: { value, achievedAt }` (best chimp level, fastest avg reaction ms, highest WPM x accuracy, highest math score, longest Simon sequence, etc.) — and surface it two places: (1) on the game's own results screen ("NEW PERSONAL BEST" banner, same pattern `DailyGame.jsx` already uses for `readBest`/`writeBest`, just synced instead of local-only), and (2) as a per-game leaderboard tab (see Leaderboard spec below). This is a Motivation fix, not a Response or Satisfaction fix, per the debugging protocol — the mechanics don't need to change, the persistent stakes do.

```
ASSUMPTION: a synced per-game personal-best record, shown immediately on the
  results screen, would measurably increase same-session replay rate for the
  parallel-instance games (Reaction/Typing/NumberMemory/Math) more than any
  mechanical change to the games themselves.
IMPACT: if true, this is the highest-leverage, lowest-risk investment across
  the whole set — it's additive (one new Firebase node + one UI banner per
  game), touches no existing game logic, and directly targets the framework's
  named weak component (Motivation) without risking Response/Clarity/Fit,
  which all already grade well across these games.
IF WRONG: if players don't care about a number going up without a comparison
  to *someone else's* number (i.e. the leaderboard half of the fix matters
  more than the personal-best half), shipping only the PB banner without the
  per-game leaderboard tab wastes the investment.
VALIDATE (posture B): ship the PB banner alone first (cheap), instrument
  "played again within 5 minutes of seeing a NEW PB banner" vs. baseline
  replay rate for the same games without one; if the lift is near zero, the
  leaderboard half of the fix is the one that actually matters and should be
  prioritized instead.
```

---

## Per-Game Evaluation

### Pig / Pig Big (`diceLogic.js`)

**Player goal & context:** bank points across turns; on each turn, keep rolling to add to an at-risk pile or stop and lock it in. First to 100 wins.

**System rules:** correct and unusually well-hardened for a "casual" game — dice are derived from a two-party commit-reveal seed protocol (`generateSeedHex`/`commitSeed`/`deriveSeed`/`rollFaceAsync`), so neither client can bias its own rolls. Pig Big only busts on double-1s (`applyDiceBigMove`), a real house-rule variant that changes bust probability materially, not just cosmetically.

**5-Component evaluation:**
- **Clarity** — strong. Turn score, banked score, and the die face are all always visible; the bust rule (rolled a 1 -> turn pot gone) is simple enough to be self-evident after one bust.
- **Motivation** — weakest, but structurally so: no persistent stakes beyond the match. **Single change:** track a per-player "aggression index" (average turn-score banked before stopping vs. average turn-score lost to a bust) in `users/{uid}/pb/dice` — this is the one game where raw win/loss genuinely is close to the right metric (turn order matters, so wins aren't purely skill), so a *style* stat is a better motivation hook than a score stat here.
- **Response** — good; roll/bank is a binary choice with no ambiguity or missed-input risk.
- **Satisfaction** — good; a bust after a long safe streak reads clearly as "that was the wrong moment to keep rolling," which is the correct feeling for a push-your-luck game.
- **Fit** — good; simple dice, simple stakes, matches a "casual game night" identity.

**Risks & abuse cases:** none beyond what's already logged (the commit-reveal protocol is specifically there to close the obvious "re-roll until I like it" abuse case, and it does).

**Playtest scenarios:** (1) new player — can they infer "stop before you lose it" without being told? Likely yes, within one bust. (2) skill test — does a player who consistently banks at ~20-25 points beat one who always pushes to 30+? This is the actual skill/luck ratio question and needs real play data, not code reading (see Numbers below). (3) abuse test — already covered by the commit-reveal design.

**Dominant strategy?** No single fixed threshold dominates — optimal stopping in Pig-family games is a genuinely studied problem (varies with your score, opponent's score, and target), which is exactly what makes this a real decision game rather than a coin flip with theater. **Does skill change the outcome, or is it luck?** Both, honestly — it's the one game in the set where that's the correct, intended answer rather than a design gap. A player with no stopping discipline (always pushes to 6+ per turn) will lose more over many games than one who scales caution to their score gap, but any single game can go either way. **Would you play it twice?** Yes — it's short, the tension is real every single roll, and the two variants (1-die vs 2-dice) give it real replay variety the way Chain Reaction's two board sizes did in the board-game set.

```
ASSUMPTION: Pig's skill/luck ratio (does disciplined stopping actually beat
  greedy pushing over many games, and by how much) is a solved question in
  the push-your-luck game-theory literature but is not independently derived
  by most casual players, similar to how Connect Four's first-player-win
  proof isn't felt by most players even though it's proven.
IMPACT: if the optimal-stopping edge is small in practice (close to a coin
  flip at casual skill levels), Pig's "real decision" claim in this report
  is weaker than argued and it's closer to dice-with-a-vocabulary.
IF WRONG: this report's #1 ranking rests on shakier ground.
VALIDATE (posture B): log turn-level bank/bust decisions across real games
  (already have the data shape via diceRolls/diceTurnScore) and compare
  win rate for players whose average bank threshold is in the "textbook"
  20-25 range vs. players who consistently push past 30; if the win-rate
  gap is flat, downgrade Pig's skill-ceiling claim.
```

**Is Pig misfiled among reflex/memory games?** No — and this matters for the review brief's framing specifically. In the platform's own registry (`games.js`), Pig/Pig Big carry `category: 'dicebluff'`, the same bucket as Bluff Battle — the codebase already keeps it out of `'reflex'`/`'memory'`. It's only *this review's ownership split* that grouped it with reflex/memory games for convenience. Pig is exactly what it claims to be: a real push-your-luck gambling-style decision game, correctly companioned with a bluffing game in the actual product, not misfiled there.

---

### Mental Math (`mathLogic.js`, `MathGame.jsx`)

**Player goal & context:** answer a shared sequence of arithmetic questions faster and more accurately than the opponent within a 2-minute window; score = speed points x power multiplier x streak multiplier.

**System rules:** deterministic seeded question generator (3 difficulty tiers scaled by question index, `isPower` fires every 8th question for 2x points), per-question time budget that scales with tier (`QUESTION_MS_BY_LEVEL`), streak >=3 doubles the next correct answer's points. Score is recomputed server-side inside the `runTransaction` from the shared seed (not trusted from the client) — the one reflex-tier game with real anti-cheat, per the correctness review.

**5-Component evaluation:**
- **Clarity** — good; the QuestionBar visibly ticks down per-question, SpeedDots show the exact point value available right now, streak badges are visible for both players.
- **Motivation** — weakest, same structural gap as the rest of the set (see cross-cutting section); **single change:** the PB-tracking fix above, keyed on peak score.
- **Response** — good; NumberPad input is immediate, and the per-question timeout has the same visual/audio feedback as a wrong tap rather than silently expiring.
- **Satisfaction** — strong; multiple channels fire on a correct answer (streak sound tier via `sounds.hit(streak)`, point-count animation, color change), and the risk/reward of the speed curve makes a fast correct answer feel meaningfully better than a slow one, not just binary right/wrong.
- **Fit** — good; the urgency of a decaying QuestionBar under a hard countdown matches "mental math under pressure."

**Risks & abuse cases:** already logged (no retry on a failed transaction leaves "CHECKING..." stuck) — a Clarity/Response bug, not a design flaw; not re-litigated here.

**Playtest scenarios:** (1) new player — can they infer the speed/points relationship from the SpeedDots alone without reading a rules blurb? Likely yes, it's visually direct. (2) stress test — does answering just barely under the timeout on a power question meaningfully change the outcome vs. answering fast on a normal one? Yes by construction (2x vs up to 5 base points) — worth confirming in play that power questions don't dominate the score so much that a lucky power-question streak decides the match regardless of overall accuracy. (3) skill test — arithmetic speed at three real difficulty tiers is a genuine, measurable skill.

**Dominant strategy?** No fixed dominant strategy, but there is a real tactical layer: rushing every answer for max speed points risks streak-breaking wrong answers (which cost points, not just zero); playing safe forgoes the 2x streak multiplier. That's an actual risk/reward decision, which is why Math outranks the other reflex games. **Does skill change the outcome, or is it reflex-latency?** Genuinely skill (arithmetic fluency) plus a real pacing decision — this is the strongest "real skill, not just latency" claim among the parallel-instance games. **Would you play it twice?** Yes — the streak/power-question texture gives it a shape beyond "who's faster at 7x8."

---

### Pairs (`pairsLogic.js`)

**Player goal & context:** classic memory-match — flip two cells per turn; a match keeps your turn and claims the pair, a mismatch passes the turn. First to 10 pairs (of 18) wins.

**System rules:** clean, fully tested pure functions (`applyPairsMove`, `getPairsWinner`); the module's own comment honestly documents the one known trust-model leak (the shuffle order is visible in the raw Firebase snapshot to any client that inspects it) rather than hiding it, and correctly distinguishes it from a bundle leak.

**5-Component evaluation:** all five are solid, nothing to flag structurally. Clarity (board state and flip history are always visible), Motivation (weakest, same cross-cutting gap, same PB fix applies — track fewest-flips-to-win), Response (taps are immediate and correctly guarded against re-tapping a held/flipped cell), Satisfaction (a match after tracking cards across several opponent turns is a real "I remembered that" moment), Fit (calm, deliberate pacing matches a memory game rather than a reflex one).

**Dominant strategy?** No — the game has real information asymmetry that shifts every turn (what you've seen vs. what the opponent has revealed), so there's no fixed opening or line that dominates. **Skill vs luck:** genuinely skill — a player who tracks revealed cards across turns will beat one who flips randomly, and the bot's tunable `RECALL_P` (0.45, labelled posture B in the bot's own comment) demonstrates the designers already treat "does this bot remember" as the game's core skill knob. **Would you play it twice?** Yes, it's a legitimate classic that needs no rework.

---

### Chimp Test (`chimpLogic.js`, `ChimpGame.jsx`)

**Player goal & context:** a level's worth of numbered tiles flash briefly then hide; click them in ascending numeric order from memory. Miss one, you lose the round; both players clearing the level advances it.

**System rules:** clean level-generation (`generateChimpLayout`) and move validation (`applyChimpMove`); `ChimpGame.jsx` layers on a well-designed 45-second opponent-idle claim (with a 30-second visible hint countdown) so an opponent who's online but has walked away doesn't leave the other player stuck forever — this is the best-executed piece of UX in the whole memory-game family and the correctness review confirmed it's live, not dead code.

**5-Component evaluation:** Clarity (grid + level number always visible, though numbers vanish after the initial flash by design — that's the whole test, not a Clarity gap), Motivation (weakest, same fix), Response (click validation is immediate and correctly locks after `myDone`), Satisfaction (advancing a level after a near-miss reads clearly), Fit (fits the "recall numbered tiles fast" identity exactly).

**Skill ceiling:** per the task's own calibration — Chimp Test is trainable. Real primates and trained humans reliably outperform untrained humans at this exact task (numeric-position working memory + rapid sequential recall), and the level-scaling design (start at 4, +1 per clear) means a trained player's ceiling is measurably higher than a casual one's, unlike Reaction Time's fixed-latency floor. **Dominant strategy?** No — but there is a learnable technique (peripheral-vision scanning of all tile positions during the flash, rather than sequential reading) that separates skill tiers, which is exactly the kind of learnable strategy Reaction Time and Typing lack. **Would you play it twice?** Yes — it's the standout of the memory-game family for the same reason humanbenchmark.com's version of this test has real staying power: there's always another level to reach.

---

### Simon (`simonLogic.js`)

**Player goal & context:** repeat a growing 4-pad color sequence; the sequence is shared (both players attempt the same growing pattern each round), whoever misses first loses the round.

**System rules:** minimal, correct state machine (`applySimonMove`) — replay phase verifies each tap against the stored sequence, append phase adds one pad and flips the turn. Simple and well-tested.

**5-Component evaluation:** Clarity (good — pad highlight sequencing during playback is unambiguous), Motivation (weakest, same fix, keyed on longest sequence survived), Response (tap-to-pad mapping is direct), Satisfaction (fine, though modest — a 4-pad palette gives less variety of feedback than Chimp's numbered grid or Pairs' match animation), Fit (matches "repeat the growing pattern" cleanly).

**Skill ceiling:** real but attention-bounded rather than technique-bounded. Unlike Chimp Test (where peripheral scanning is a learnable technique that meaningfully raises the ceiling), a 4-symbol sequence mostly taxes serial working memory and sustained attention — chunking helps somewhat (grouping taps into sub-sequences), but there isn't much room for a "trained expert" to develop qualitatively different technique the way Chimp or Number-Memory-with-mnemonics allow. Call it moderate: better than Reaction/Typing, below Chimp/Math. **Dominant strategy?** None — pure recall test, no meta-decision. **Would you play it twice?** Yes, it's short and the shared-sequence stakes structure (both players racing the same growing pattern) is a genuinely good head-to-head shape.

---

### Number Memory (`NumberMemoryGame.jsx`)

**Player goal & context:** a growing digit string flashes for a reveal window that scales with digit count (`SHOW_MS_BASE + SHOW_MS_PER_DIGIT x level`), then both players type what they remember; anyone wrong ends the round.

**System rules:** clean, and the review-flagged "no shared logic module" issue (scoring math lives inline in the page, not `numberMemoryLogic.js`) is a testability gap, not a design one. The reveal-window scaling is a genuinely good fairness fix — a naive flat reveal time would make higher levels disproportionately about screen-reading speed rather than memory.

**5-Component evaluation:** Clarity (good — countdown during memorize phase, checkmarks during recall show both players' submission status without revealing content), Motivation (weakest, same fix, keyed on longest digit string recalled), Response (digit-only input validation is correct), Satisfaction (fine, modest), Fit (matches "memorize the growing number" cleanly).

**Skill ceiling — the honest answer, and where it differs from Chimp:** digit span is a real, well-studied cognitive measure, and mnemonic techniques (chunking, the "major system" of converting digits to words) genuinely raise a trained person's ceiling far above an untrained one's — in principle this game has as real a ceiling as Chimp Test, maybe higher. In practice, almost no casual player on a friends-and-family games platform is going to learn a digit-to-consonant mnemonic system; the *practical* ceiling most players will ever explore is closer to natural working-memory limits (~7+-2 digits) reached within a handful of sessions, after which the game plateaus for them even though the game itself hasn't run out of room. This is a case where the game's design is fine — the ceiling exists — but the platform gives the player zero hint that a technique exists to keep climbing. **Single change, if this is worth chasing:** a one-line tip after 2-3 losses at the same level ("TRY GROUPING DIGITS IN PAIRS") — a Clarity fix to expose the skill ceiling that already exists, not a Motivation or mechanics change.

```
ASSUMPTION: without any in-game hint, the overwhelming majority of casual
  players never discover chunking/mnemonic techniques and plateau at natural
  digit-span limits, so Number Memory's *felt* ceiling is much lower than its
  *theoretical* one.
IMPACT: if true, Number Memory is currently under-delivering on a real skill
  ceiling it already has the mechanical room for — a cheap Clarity fix (a
  technique hint) could meaningfully raise engagement without touching the
  logic at all.
IF WRONG: if a same-page hint doesn't change plateau level in practice
  (players ignore it or find it doesn't help), the game's ceiling is
  functionally capped regardless, and it should be treated the same as
  Simon — moderate, attention-bounded — rather than "high ceiling, poorly
  surfaced."
VALIDATE (posture B): A/B the technique hint against no hint for players who
  plateau at the same level 3+ times; track whether hinted players' plateau
  level shifts upward over the following week. If it doesn't, drop the claim.
```

**Would you play it twice?** Yes — it's a clean, fair implementation of a real cognitive test.

---

### Visual Memory (`visualMemoryLogic.js`)

**Player goal & context:** a spatial pattern of cells lights up on a 4x4 grid, then both players click the cells they remember from the pattern; clicking a wrong cell ends the round.

**System rules:** correct, well-tested, and correctly guards against re-clicking an already-flipped cell.

**5-Component evaluation:** all fine — this is the shallowest sibling of the "growing shared sequence" trio (Simon/Chimp/Visual Memory), and that's a legitimate design position, not a flaw. Clarity/Response/Satisfaction/Fit are unremarkable-in-a-good-way; Motivation is the same cross-cutting gap as everywhere else in the set.

**Skill ceiling:** lower than Chimp Test specifically because the grid is small (16 cells) and there's no ordering constraint — you just need to recall *which* cells lit up, not *in what order*, which is a meaningfully easier cognitive task than Chimp's numbered-sequence recall on a larger 25-cell grid. A 16-cell unordered-set memory task runs out of room to differentiate skill faster than an ordered-sequence one does — there just aren't that many distinct "hard" patterns once level gets high relative to grid size. This isn't a bug, but it's the honest reason Visual Memory ranks below Chimp and Simon on ceiling.

**Would you play it twice?** Yes, briefly and casually — it's a fine quick game, just not one with much room to grow into.

---

### Aim Trainer (`AimTrainerGame.jsx`)

**Player goal & context:** 30 seconds, click your own colored target as fast as possible to score; clicking the *opponent's* colored target costs a point and counts as "friendly fire."

**System rules:** rejection-sampled target placement keeps the two players' targets from overlapping (already logged as imperfect after 12 attempts — a Response-adjacent polish issue, not a design one); score, hits, and friendly-fire are separately tracked stats.

**5-Component evaluation:**
- **Clarity** — good; own-color vs. opponent-color targets are visually distinct, and the -1/friendly-fire penalty is stated up front ("MISS = -1 PT").
- **Motivation** — weakest, same cross-cutting fix, keyed on best net-score-per-30s run.
- **Response** — good; `onPointerDown`-adjacent instant target respawn, no input lag.
- **Satisfaction** — good; the live HITS/FF counter gives immediate, granular feedback beyond just the score number.
- **Fit** — good; fast target cycling matches "click targets fast."

**Why this ranks above the other reflex games:** unlike Reaction Time and Typing (pure parallel instances with zero interaction), Aim Trainer puts both players' targets on the *same shared canvas*. Clicking near your own target under time pressure carries real risk of misclicking the opponent's nearby target — that's a genuine attention/precision tradeoff the other reflex games don't have, and it's the direct product of a real design decision (rendering both targets together) rather than incidental. **Dominant strategy?** No fixed strategy, but there's a real skill/attention tradeoff: play fast and risk friendly-fire penalties, or play more carefully and sacrifice raw hit rate. **Would you play it twice?** Yes — the shared-canvas distraction mechanic gives it more texture than a plain aim trainer would have.

---

### Typing Race (`TypingGame.jsx`)

**Player goal & context:** type a shared passage as fast and accurately as possible; effective score is WPM x accuracy, and a live "ghost" marker shows the opponent's current position in the passage.

**System rules:** correct WPM/accuracy computation (already flagged for missing shared-logic-module test coverage, a correctness/testability note, not a design one); the ghost-marker overlay (`isGhost` rendering the opponent's live position directly in the passage text) is a nice piece of Clarity work — you can see you're being caught up to in real time.

**5-Component evaluation:** Clarity is genuinely good here (the ghost marker is the standout detail — most of this game's siblings only show opponent progress as a separate bar, this one integrates it into the actual text being read). Motivation is the same cross-cutting gap. Response/Satisfaction/Fit are all fine and unremarkable.

**Dominant strategy? Does skill change the outcome?** Skill changes the outcome completely — but the skill in question is raw typing throughput (WPM), a skill that has nothing to do with this game specifically and everything to do with how much someone types day to day outside the app. There is no in-game decision, no risk/reward, no information asymmetry to exploit — it is, honestly, typing speed in a game's clothes, with a well-made scoreboard around it. That's not a flaw exactly (Typing Race doesn't pretend otherwise — its own description is literally "outtype your opponent's ghost"), but it means the *game design* contribution here is entirely in presentation (the ghost marker, the progress bars), not in mechanics. **Would you play it twice?** Only as a warm-up or a check-in on personal WPM progress — which is exactly the "solo test with a side-by-side comparison" framing recommended in the cross-cutting section, not really a repeatable "duel."

---

### Reaction Time (`ReactionGame.jsx`)

**Player goal & context:** 4 rounds; tap as soon as the area turns green after a random 1.5-4s delay; average time across 4 rounds wins.

**System rules:** correct, with a genuinely good implementation detail — the reaction time is captured on `onPointerDown` rather than `onClick` specifically to avoid the touch-to-click event-synthesis latency other custom keypads in the codebase already account for (M-50 comment), so the measurement itself is honest.

**5-Component evaluation:** Clarity is excellent (color-coded phases: waiting/ready/too-early/result are visually unambiguous). Motivation is the same cross-cutting gap. Response is as good as this genre gets — the pointer-down capture point is a real, deliberate design choice to make the number that gets recorded actually mean something. Satisfaction is fine but thin — a fast time and a slow time look almost identical (same UI, different number), there's no escalating feedback for a personal-best time within the round. Fit is exact — nothing about this game pretends to be more than what it is.

**Skill ceiling — explicit per the task's framing:** low, and correctly so. Simple visual-reaction-time performance is close to a fixed human physiological constant (roughly 200-250ms for a healthy adult reacting to a visual go-signal is a widely cited neuroscience range, though this report does not have a checkable citation on hand to back a specific number for *this* implementation, so treat that range as background context, not a value this report is asserting). Practice narrows variance and trims a few tens of milliseconds at best; it does not create the kind of order-of-magnitude skill gap Chimp Test or Mental Math can produce between a novice and an expert. **Dominant strategy?** None — there's no decision to make beyond "tap when it's green, don't tap before." **Does skill change the outcome, or is it reflex-latency?** It's reflex latency, full stop — this is the cleanest example in the whole set of a game whose outcome is dominated by a near-fixed human constant rather than a learnable strategy. **Would you play it twice?** Honestly, no — once you've seen your average, there isn't much reason to expect a materially different number next time, the same way there's no reason to expect a different result replaying a game you've already seen drawn to a forced conclusion. It plays the same on-ramp role TTT-3x3 plays in the board-game set: a fast, zero-friction way to learn the platform's whole match loop, not a game with real return-visit pull on its own mechanical merits.

---

## Daily Challenge — design feature verdict

**Current state (already logged as broken):** `dateKeyFor()` uses local `getFullYear()/getMonth()/getDate()`, so the "puzzle" rolls over at the player's own midnight, not a shared boundary — two friends a few hours apart in timezone can be on different calendar dates (and therefore different seeded question sequences) for part of the day, while the intro copy explicitly promises "SAME PUZZLE FOR EVERYONE TODAY." Streak and best score live only in `localStorage`, so there's no way to compare today's run with a friend at all — the entire point of a "daily" format (a shared, comparable, one-shot event) is currently unimplemented past the shared *seed*.

**What a working Daily Challenge should be, as a design feature:**
1. **A single global day boundary.** Derive the date key from UTC (or a fixed epoch offset agreed platform-wide), not local `Date()` getters — every player worldwide should see the same "DAILY #N" for the same UTC calendar day. This is the one-line fix already identified in the correctness review; naming it here because it's not just a bug, it's the load-bearing premise of the entire feature.
2. **A synced, write-once daily result**, not a `localStorage`-only best: `dailyResults/{dateKey}/{uid}: { score, completedAt }`, written once per day per player (mirroring the write-once pattern the match-result flows already use), so a friend's score is fetchable the same day rather than trapped on their device.
3. **A same-day friends leaderboard**, separate from the lifetime cross-game leaderboard below — literally "who solved the most of today's puzzle," sorted by score desc with completion time as a tiebreak (or, if most completions run the full 60s clock without an early finish, ties can simply share a rank rather than forcing an arbitrary tiebreak). This is the actual retention mechanism a "daily" format is supposed to deliver — right now it's a private per-device counter with a share-card bolted on.
4. **Sync the streak too**, to `users/{uid}/dailyStreak`, so it survives a device change and can be shown on the player's profile — the same way Wordle-style products treat a streak as a visible, cross-device asset rather than a local number that resets the moment someone clears their browser storage.
5. **Consider anchoring the daily game choice, not just the puzzle content, to the calendar** — currently it's always Mental Math. Math is a reasonable anchor (it's already solo-native, quick, and cleanly comparable by a single score), but if the set ever wants to rotate the daily game across the roster (a "Daily Chimp" one week, "Daily Reaction" another), the seed-and-compare infrastructure recommended above needs to be built generically per game type rather than Math-specific — worth deciding now rather than after a second daily-game type gets bolted on ad hoc.

```
ASSUMPTION: Mental Math is a deliberately good permanent anchor for Daily
  Challenge (it's already solo-shaped, fast, and produces one clean
  comparable number) rather than an arbitrary first choice that should
  rotate.
IMPACT: if the intent is eventually to rotate daily games, the fixes above
  (points 2-4) should be built as a generic "daily result" layer keyed by
  gameType from day one, not as Math-specific fields, to avoid a rebuild.
IF WRONG: shipping Math-specific field names now (dailyResults keyed just by
  score) is fine as-is and no generalization work is needed yet.
VALIDATE: ask the captain directly whether daily-game rotation is on the
  roadmap before building the sync layer — this is a five-minute product
  question, not something resolvable by reading code.
```

---

## Leaderboard — design feature verdict

**Current state (already logged as broken):** `rankEntries` sorts by raw lifetime `wins` -> `winrate` -> `games`, summed across every `gameType` a pair of friends has ever played, with no time window. A player who racks up easy wins in one game (or in a 50%-luck game like Pig) outranks someone who plays fewer, harder games well. There is no way to answer "who's actually good at Chimp Test" from this data structure at all — it's structurally incapable of it, not just poorly tuned.

**What a working Leaderboard should be, as a design feature:**
1. **Per-game leaderboards, not one lifetime aggregate.** At minimum, split by `gameType` (or by `category` as a coarser first cut — memory / reflex / dicebluff / board / word / party) so a player can see "who's best at Mental Math" as a distinct question from "who's best at Pig." This is the direct fix for the "a Pig win counts the same as a Chimp Test win" problem already logged.
2. **A per-game metric that actually reflects skill for that game**, not win/loss, for the parallel-instance games specifically. Win/loss is a fine ranking signal for head-to-head games (Pig, Pairs, Simon/Chimp/Visual-Memory's shared-sequence duels) where the opponent's play directly determines the outcome. It's a poor signal for Reaction Time, Typing, Number Memory, and (to a lesser extent) Mental Math, where two closely-matched players can trade wins/losses essentially at random around their true skill level for a long time. For those, rank by the personal-best metric recommended in the cross-cutting Motivation section (fastest avg reaction ms, highest WPM x accuracy, longest digit string, highest math score) instead of win/loss.
3. **A time window**, at least "this week" vs. "all time," so the leaderboard reflects current form rather than rewarding whoever has played the most matches lifetime. This is a smaller fix than #1/#2 but compounds with them — without it, even a correctly per-game-split leaderboard still rewards volume over current skill.
4. **Keep Pig/dice explicitly separate from "skill" rankings**, or label it clearly as a luck-weighted category if it's shown at all in a combined view — mixing a ~50%-luck game's wins into a skill ranking misrepresents the skill ranking, and mixing a skill game's wins into a luck-category ranking misrepresents that too. The platform's own `category: 'dicebluff'` split already gives this the right seam to split along; the leaderboard should follow it.

```
ASSUMPTION: splitting the leaderboard by category (5 buckets: board, word,
  memory, reflex, dicebluff, party) is a good-enough first cut, and full
  per-gameType leaderboards (20+ separate boards) would fragment friend
  groups too thin to ever show a populated leaderboard, since most friend
  groups won't have played every single game type with each other.
IMPACT: if true, category-level splitting is the right MVP scope — it fixes
  the "Pig win = Chimp win" problem without creating 20+ near-empty
  leaderboard screens.
IF WRONG: if players specifically want to compare on individual games (e.g.
  "who's the best Typing Race player in my friend group" as its own
  question, not folded into "reflex"), category-level splitting under-serves
  that and per-gameType is worth the fragmentation risk.
VALIDATE (posture B): ship category-level splitting first (cheaper), then
  check whether players click into a specific gameType filter within a
  category at meaningful rates; if they do, that's the signal to go
  per-gameType.
```

---

## Numbers proposed in this report (index, with posture)

| Value/claim | Posture | Where |
|---|---|---|
| A synced per-game personal-best banner would measurably lift same-session replay for parallel-instance games | **B** — starting hypothesis, explicit A/B test, explicit failure direction | Motivation cross-cutting section |
| Pig's optimal-stopping skill edge over greedy pushing is meaningful at casual skill levels | **B** — labelled assumption, explicit validate step using existing `diceRolls`/`diceTurnScore` data shape | Pig section |
| Most casual players never discover chunking/mnemonic techniques for Number Memory and plateau below its theoretical ceiling | **B** — labelled assumption, A/B'able technique-hint validate step | Number Memory section |
| Healthy-adult visual reaction time is roughly 200-250ms | **Explicitly flagged as unsourced background context, not asserted** | Reaction Time section — stated plainly as a range this report cannot cite, not used to justify any design decision |
| Mental Math is a deliberately durable daily-game anchor vs. an arbitrary first pick | **B** — labelled assumption with a direct validate step (ask the captain) | Daily Challenge section |
| Category-level (not per-gameType) leaderboard splitting is the right MVP scope | **B** — labelled assumption, explicit instrumentation-based validate step | Leaderboard section |

No posture-A (source-backed) numbers are proposed. No posture-C numbers are proposed — nothing in this review was measured on this codebase; every ceiling/skill claim is argued from the logic and UI structure (what the player can learn and how the scoring rewards it), consistent with the "what could not be assessed" section below.

## What could not be assessed by reading

- **Actual game-feel, animation timing, and click/tap responsiveness** — this review was scoped to read-only, no browser. Aim Trainer's target-respawn feel, Typing's ghost-marker legibility in motion, and Math's QuestionBar decay rate are all things that read fine in code but need to be felt to fully confirm.
- **Real skill-gradient data for any game in this set** — every ceiling claim (Chimp trainable vs. Reaction fixed-latency vs. Simon attention-bounded) is argued from what information the game gives a player and when, not from observed match outcomes across real skill tiers. The Numbers Policy table above converts the two most testable claims (Pig's stopping-discipline edge, Number Memory's hint-driven plateau shift) into explicit posture-B proposals rather than presenting them as settled.
- **Whether the reflex-tier games' lack of a demoBots.js bot entry (Simon/Chimp/VisualMemory/NumberMemory/Reaction/Aim/Typing/Math have no case in the bot dispatcher, unlike Pig and Pairs) reflects a deliberate "these need a live human or a dedicated Demo-mode AI, not the generic bot harness" decision, or a gap** — the correctness review noted dedicated `*Demo.jsx` components exist for these games with their own internal AI/pacing logic, but that logic wasn't read in depth for this design pass; whether those demo bots are tuned to give solo players a real practice ceiling (the way the calibration report specifically asked about Chain Reaction's bot) is unverified.
- **Whether players actually read the in-round rule text** (e.g. Math's "SAME QUESTIONS FOR BOTH x SOLVE AT YOUR OWN PACE" intro card) closely enough to understand the parallel-instance framing this report recommends leaning into — that's a comprehension question no amount of code reading resolves.
- **The real-world size of the timezone-mismatch problem for Daily Challenge** (how many friend-group pairs actually span a timezone boundary where this bites) — depends on the platform's actual user distribution, which isn't visible from the repo.
