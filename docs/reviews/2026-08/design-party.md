# Design review — Party, Word & Trivia games

Reviewer scope: Wavelength (`wavelengthLogic.js`), Fibbage (`fibbageLogic.js` + `FibbageGame.jsx`), Spyfair (`SpyfairGame.jsx` + `decks/spyfair.js`), Two Truths (`TwoTruthsGame.jsx`), Bluff Battle (`bluffLogic.js`), Herd Mind (`herdLogic.js`), Trivia Blitz (`triviaLogic.js`), Word Duel (`wordduelLogic.js`), Word Hunt (`wordhuntLogic.js`), Hangwoman (`hangmanLogic.js`), Sketch (`sketchLogic.js`). Read-only: no code changed, no build/dev-server/browser used, nothing pushed.

Correctness bugs already logged in `games-review-party-s1/report.md` are referenced at most once each, where they bear on a design question, and are not re-litigated.

## Verdict, up front — ranked as games, best to worst

1. **Sketch** — the strongest conversation generator in the set. Pictionary's chat-guess format produces genuine laughs, no dominant strategy, and it's the only game here that explicitly tunes its scoring formula for the 2-player case instead of just barely supporting it. **Keep.**
2. **Wavelength** — a clue-giver reads a spectrum clue, everyone else guesses a number; the entire game is the conversation about *why* you picked that clue. No forced line, no solved strategy, scales cleanly 3–8. **Keep.**
3. **Herd Mind** — match-the-majority with a clever anti-runaway "Pink Cow" catch-up mechanic and the healthiest content deck in the set (150+ prompts). Post-round "why did everyone say that" chat is real replay value. **Keep.**
4. **Word Duel** — mutual asymmetric Wordle (you set a word for them, they set one for you); genuine skill expression, a light mean-streak social layer in word choice. Locked to 2 players but that's the honest shape of the mechanic, not a compromise. **Keep.**
5. **Spyfair** — correct, fair, well-guarded Spyfall clone with good content (24 locations) and a good vote mechanic (self-vote blocked, majority-required-to-catch). Docked one rank for a genre-convention gap: no spy-guesses-the-location win path exists at all (see below). **Keep, with the missing win condition as the fix.**
6. **Trivia Blitz** — well-specified speed+streak scoring that gates on correctness before rewarding speed, so it isn't just a reflex race. Weakest link is the 60-question deck (10/match ⇒ repeats after 6 matches, measured). **Keep, content is the whole fix needed.**
7. **Fibbage** — the deception mechanic (anonymized ballot, blocked self-vote, careful reveal timing) is the best-designed hidden-info system in the set. Held back by two content problems that compound: a 26-prompt deck, and — found in this pass, not previously flagged — prompts advance **sequentially, not shuffled**, so every match replays prompts 1, 2, 3… in the identical fixed order. **Keep, but fix the sequencing before the deck size.**
8. **Word Hunt** — solid Boggle engine (correct dice, correct DFS tracing, correct scoring table) undercut by a real, previously-identified dominant strategy: both players score identical common short words independently, rewarding typing speed over vocabulary. Classic 2-player Boggle's overlap-cancellation rule is the right, minimal fix (see below). **Rework the scoring rule, keep the rest.**
9. **Hangwoman** — technically the platform's reference implementation for hidden-info (correct commit-reveal, unlimited self-generated content), but the core guessing loop rewards a well-known, near-mechanical letter-frequency strategy, and most of a round is one person silently working a puzzle rather than a group talking. Reads as the least "party" game in the set despite living in `category: 'party'`... actually `category` isn't set for it in the file I read; treat this as a word-guessing duel, not a party game. **Keep as a solid 2-player filler, not a flagship.**
10. **Bluff Battle** — the dice-bluffing math (Perudo-lite) is correct and the bluffing itself is genuine unsolved-by-code skill, but it is strictly 2-player with no bot, so it can't be practiced solo and can't include a third person even when one is standing right there. **Keep the core, but it needs a bot (practice) and, longer-term, a real multi-player mode to earn "party" billing.**
11. **Two Truths** — the biggest Fit mismatch in the set. "Two Truths and a Lie" is a group icebreaker by cultural convention; this implementation hard-locks to exactly 2 players (one setter, one guesser) with zero path to a group round, no logic module, and no test coverage. Content is infinite (player-generated) so it never goes stale, but the format itself doesn't scale to the "party" the deck of games says it belongs to. **Cut or substantially rework — this is the one entry that shouldn't ship as-is under the party category.**

---

## Wavelength

**Player goal:** the clue-giver sees a hidden target (8–92) on a spectrum between two poles (e.g. "overrated ⟷ underrated") and gives a one-word/phrase clue; everyone else independently guesses a 0–100 number; guesses are scored by closeness.

**System rules:** `scoreGuess` (`wavelengthLogic.js:38-43`) is a clean linear falloff — `WAVELENGTH_MAX_SCORE = 50` at the bullseye, 0 at `WAVELENGTH_MISS_DISTANCE = 50` or beyond. `randomTarget()` keeps the target inside 8–92 so it's always reachable from either pole. Seat rotation for clue-giver (`nextClueGiver`) and the "who must guess before reveal" gate (`onlineGuessers`) are both correctly derived from live presence.

### 5-Component evaluation

- **Clarity** — good. The clue-giver sees exactly the number they need to communicate; guessers see the two poles and a 0–100 dial. Nothing ambiguous about what a "good" clue should do.
- **Motivation — the standout component, not the weak one.** The entire game is the social act of the clue-giver deciding what to say and everyone else debating it before locking a guess. Persistent state doesn't matter here; the conversation is the reward, which is exactly what the task brief is asking these games to produce.
- **Response** — fine; a numeric guess is a direct, low-friction input.
- **Satisfaction — the actually weak component.** Scoring is a flat linear ramp with no discrete "bullseye / close / far" tiers the way the physical Wavelength boardgame uses colored zones (4/3/2/0 points). A linear score of, say, 31/50 doesn't read as a category the table can react to together the way "you're in the green!" does.
  - **Single highest-value change:** replace the linear ramp with 3–4 discrete score bands (e.g. exact-ish / close / far / miss) so a reveal produces a legible, shoutable result instead of an arbitrary number. This is a Satisfaction fix per the debugging protocol (add feedback channels), not a rebalance of the max/miss distance.
  - ```
    ASSUMPTION: a banded score (e.g. 4 tiers) reads as more satisfying at reveal than a linear 0-50 number, mirroring the physical game's colored-zone design.
    IMPACT: if untrue, this is cosmetic-only effort with no real Satisfaction payoff.
    IF WRONG: the "weakest component" call above is misattributed — Satisfaction may actually be fine as linear, and the real gap is elsewhere.
    VALIDATE (posture B): after implementing, track self-reported "did the reveal feel exciting" (1-5) across N reveals; if no improvement over the linear baseline, revert.
    ```
- **Fit** — strong. Pacing, guess-then-reveal structure, and the emphasis on interpreting another person's mind is exactly the genre's identity.

### Dominant strategy? No.

There's no forced line — the clue-giver's decision space is language itself, not a solvable mechanic. This is the correct outcome for the genre.

### Does skill change the outcome?

Yes, and it's social skill, not reflex or luck: knowing how a specific group of friends would interpret a clue is a real, learnable, non-mechanical skill that varies by clue-giver and by the makeup of the table.

### Bots

No bot logic found for Wavelength specifically in `partyBots.js` beyond `pickBotClue`/`pickBotGuess`, which draw from a persona-tagged pool rather than reasoning about the actual spectrum pair — fine for filling a solo/demo seat, but a repeat player will notice a bot's clues don't track the pair the way a human's would. Lower priority than Fibbage's bot problem below because Wavelength's guessers (not the bot) drive most of the interesting decisions.

### Would you play it twice? Yes, without qualification.

31 spectrum pairs (measured, 2026-08-22) is enough for several sessions, and because the actual content is *the clue the human gives*, not the deck entry itself, this game resists repetition far better than any deck-driven game in the set.

---

## Fibbage

**Player goal:** everyone but the reader writes a plausible lie for a trivia prompt; the anonymized ballot (real answer + all lies) is voted on; score for finding the truth or fooling someone with your lie.

**System rules:** `fibbageLogic.js` is the best-engineered hidden-info system reviewed in this pass. `buildOptions`/`attributeOptions` deliberately strip author and truth-marker from the public ballot during voting (`fibbageLogic.js:92-138`), `scoreRound` blocks self-fooling credit (`:160`), and the deck's own header comment is honest about the one unfixable leak (the answer ships in the client bundle) rather than pretending it's solved. Self-vote is blocked in the UI (`FibbageGame.jsx:494`, confirmed in the correctness pass).

### 5-Component evaluation

- **Clarity / Response / Satisfaction / Fit** — all solid. The ballot format, anonymized voting, and reveal-with-authorship are legible and match the genre (Fibbage/Jackbox-style deception trivia) closely.
- **Motivation — the weak component, and it's worse than a simple "small deck" problem.** Two things compound:
  1. Deck size: 26 prompts (measured, 2026-08-22), each own comment marked "v1."
  2. **Newly found in this pass:** prompts advance strictly sequentially — `const nextIndex = (round.promptIndex + 1) % FIBBAGE_FACTS.length` (`FibbageGame.jsx:281`) — never shuffled per match. Every sibling deck-driven game in this set (Trivia's `seededDraw`, Herd Mind's `deckSeed`, Sketch's `pickOptions(seed)`, Word Hunt's `generateGrid(seed)`) draws a fresh seeded order per match. Fibbage doesn't. That means two different groups playing today and next week both see prompt 0, then 1, then 2… in the *identical* order — the deck-exhaustion problem isn't just "26 prompts," it's "the same 26 prompts in the same sequence every single time," which is a strictly worse Motivation failure than a shuffled small deck would be.
  - **Single highest-value change:** shuffle `promptIndex` progression with a per-match seed, the same pattern every other deck-driven game in this codebase already uses. This is a small, mechanical, low-risk fix (one function, matching an existing in-house pattern) and it's a bigger lever than growing the deck, because it fixes repeat*-order* predictability immediately, independent of deck size.
  - ```
    ASSUMPTION: sequential (non-shuffled) prompt order is a bigger driver of "this feels stale" than raw deck size, because it means repeat *sessions* (not just repeat *rounds* within one long session) hit identical content in identical order.
    IMPACT: if wrong, and deck size dominates instead, shuffling alone won't move the needle much and deck growth should be prioritized first.
    IF WRONG: effort goes to the lower-leverage fix first.
    VALIDATE (posture B): ship the shuffle only, hold deck size fixed at 26, and track repeat-group session-over-session "this prompt again" complaints/self-reports before vs. after. If complaints don't drop, the assumption is wrong and deck growth is the real lever.
    ```
- Deck growth itself is still worth doing, just second: `ASSUMPTION: 26 prompts is undersized relative to Herd Mind's 150+. IMPACT: a group playing 3+ matches in one sitting exhausts the deck even with shuffling. VALIDATE (posture B): target ≥100 prompts as a starting value, matching the order-of-magnitude gap to Herd Mind; test by tracking matches-to-first-repeat post-shuffle-fix, move target up if repeats still land inside a typical one-evening session (undefined session length — needs its own measurement).`

### Dominant strategy? No — deception games don't solve this way.

Writing a believable lie and reading who wrote which lie is a social-reasoning skill, not a mechanical one.

### Bots — the sharpest instance of the task's "does a bot ruin this" question.

`pickBotLie` (`partyBots.js:121`) draws only from each prompt's fixed 2–3 `decoys` entries — confirmed in the correctness pass. Combined with the sequential-order bug above, a repeat group doesn't just eventually recognize "the bot always lies X here" — they'll recognize it on a predictable schedule, because the same prompt reliably reappears at the same point in the rotation. This is the one game in the set where the bot problem and the content-pipeline problem actively reinforce each other. Fixing the sequencing (above) doesn't fix the bot, but it removes the "predictable schedule" amplifier — worth doing first because it's cheap and independent.

### Would you play it twice? Yes, but with a ceiling that arrives faster than it should.

The deception mechanic itself is excellent and would sustain many sessions on its own. The content pipeline (order + volume) is what caps it, and it caps it sooner than the "26 prompts" number alone would suggest.

---

## Spyfair

**Player goal:** classic Spyfall — everyone but the spy secretly knows a shared location and has a flavor role; players question each other out of band (chat/voice, not modeled by the app) for 4 minutes; a vote decides who's the spy.

**System rules:** honestly documented info-leak model (`SpyfairGame.jsx:16-30`) — the app defends against casual/spectator leakage via commit-reveal on the location, and is explicit that a determined player reading `round.private` can unmask things a trusted server would be needed to hide. `tallyVotes` requires a clear majority to catch the spy (`spyCaught = !tied && top === spyId`, ties favor the spy) — a real, intentional design choice, not an oversight. Self-vote is disabled in the UI (`isMe` check, `SpyfairGame.jsx:583`).

### 5-Component evaluation

- **Clarity / Response / Fit** — good. 24 locations (measured, 2026-08-22) each with 7 flavor roles give every non-spy player a distinct interrogation angle, matching the genre.
- **Motivation** — good structurally (majority-required-to-catch keeps tension high, ties favor the underdog spy), but see the missing win condition below — it's incomplete relative to the genre it's modeling.
- **Satisfaction — the weak component, and it's a missing mechanic, not a tuning issue.** I found no `spyGuess`/`guessLocation` code path anywhere in `SpyfairGame.jsx`. Classic Spyfall gives the spy a *second* win condition: if never voted out, the spy can win outright by correctly naming the location before time runs out. This implementation only lets the spy win passively, by surviving the vote (`spyWon = !spyCaught`) — there's no active "I've figured it out, I'll declare the location" moment for the spy to seize. That's a real loss of tension: in the genre this is modeled on, a sharp spy has agency to end the round on their terms instead of just waiting out the clock.
  - **Single highest-value change:** add a `spyGuess(locationIndex)` action available to the spy during questioning, that ends the round immediately — correct guess wins the round for the spy outright, wrong guess auto-loses it (raising the stakes of guessing rather than staying passive). This is a Satisfaction/Response fix (giving the spy a real lever, not just a wait state) and it directly targets the "does skill matter for the spy" question — right now spy skill is purely social (blend in, don't get caught), with no informational payoff for actually deducing the location.
  - ```
    ASSUMPTION: adding a spy-guess win path increases perceived tension/agency for the spy role without measurably reducing the non-spy team's win rate, since a wrong guess is an instant loss for the spy.
    IMPACT: if the guess is too easy to land correctly (e.g. spies deduce it often from question phrasing), it could make the spy role too strong.
    IF WRONG: spy win rate rises past a healthy point and the vote mechanic becomes less relevant.
    VALIDATE (posture B): starting value = spy can only guess after some minimum elapsed questioning time (label a value, e.g. half the 240s window, as the starting gate) so early lucky guesses aren't free; track spy win rate with vs. without the guess option across N rounds; if spy win rate exceeds ~60% (labelled target — the base 3-scores-to-win match structure assumes rough parity), tighten the gate or remove.
    ```

### Dominant strategy? No — reading people and bluffing don't reduce to a fixed line.

### Group size

`minPlayers: 3, maxPlayers: 8` — the vote-needs-a-majority structure scales naturally: more players means more questioning cross-talk (good, more conversation) and a spy has more people to blend into. This is one of the better-scaling games in the set; no break observed at either extreme by reading the logic.

### Bots

`generateBotStatement`/`pickBotSpyVote` exist (`partyBots.js:169,190`) but I could not assess actual chat-response plausibility by reading code alone — see "what could not be assessed" below.

### Would you play it twice? Yes — the vote/majority tension and good location variety earn it. Add the spy-guess win condition and it earns the top tier instead of the middle.

---

## Two Truths

**Player goal:** ostensibly "Two Truths and a Lie" — a setter states three things, a guesser picks the lie.

**System rules:** commit-reveal on which of the (implicitly 3, though I could not confirm the exact statement count from the page's inline logic without deeper reading) options is the lie; `TwoTruthsGame.jsx` scores via `MATCH_WINS` best-of-X between exactly X and O (`scoreX = game.scores?.X`, `matchWinner = scoreX >= MATCH_WINS ? 'X' : ...`, lines 165-167). It is **not** registered as `nPlayer` in `games.js` (unlike Wavelength/Fibbage/Spyfair/Herd/Trivia/Sketch) — it is a fixed two-seat X/O game, same shape as Word Duel or base Tic-Tac-Toe.

### 5-Component evaluation

- **Clarity / Response** — fine, no issues found by reading the round machinery.
- **Fit — the decisive failure, and it's structural, not a numbers problem.** "Two Truths and a Lie" as a cultural object is a group icebreaker: the value is in a room of people each taking a turn, and everyone else — not just one designated guesser — reacting and guessing together. This implementation removes the group entirely: one setter, one guesser, repeat. The mechanic that gives the real game its identity (a room reacting together, guesses compared aloud, "wait, REALLY?" as a group beat) cannot happen with two people, because the entire second half of the intended experience (an audience) doesn't exist in this shape.
  - **Single highest-value change:** if this is meant to be a party-scale game, it needs an actual n-player mode — one rotating setter, all other seats guess simultaneously and are scored/ranked by accuracy, the same shape Wavelength and Herd Mind already use for a single-decider/many-guessers round. If it's meant to stay a 2-player format, it should be recategorized and marketed as an icebreaker-for-two (e.g. a first-date/get-to-know-you duel), not implied to be a party game, because right now it neither delivers the party-icebreaker experience nor is honest about being something narrower.
- **Motivation** — works fine for exactly the 2-person case it supports (a personal, one-on-one guessing game has its own appeal), but that's a different game than the one its name promises.

### Dominant strategy? No — reading a specific person's believable-lie style isn't mechanically solvable.

### Does skill change the outcome? Yes, but it's relationship/social-read skill specific to the other player — same category as Fibbage/Wavelength, just narrower (one specific dyad instead of a table).

### Would you play it twice? Only with the same one other person, repeatedly — which is a legitimate but much narrower use case than "party game." As a party game, the honest answer is **no**: it structurally cannot include a group, which is the entire premise the name sets up.

**Also worth restating from the correctness pass, because it bears on confidence in any of the above:** no dedicated logic module and zero test coverage (`TwoTruthsGame.jsx`, 535 lines, all commit/reveal/score logic inline) — every other hidden-info game in this set has this extracted and tested. That's a process/quality gap, not a design one, but it means less confidence that the mechanics I read are exhaustively correct compared to the other ten games' pure, tested modules.

---

## Bluff Battle

**Player goal:** Perudo-lite — each player has a hidden dice cup, bids escalate on how many dice (across both cups) show a given face, calling "liar" resolves the current bid.

**System rules:** correct and minimal. `isBidHigher` (`bluffLogic.js:19-25`) enforces strict escalation (more dice, or same quantity at a higher face); `resolveChallenge` (`:41-47`) correctly assigns the loser (caller loses if the bid was met, bidder loses otherwise); `countFace` implements the standard "ones are wild" rule. Documented simplification: no switch-to-ones special rule from full Perudo.

### 5-Component evaluation

- **Clarity / Response / Satisfaction / Fit** — all solid for what's implemented; a correct, minimal Liar's Dice core.
- **Motivation — the weak component, and it's a scope problem, not a numbers problem.** The game is hard-locked to exactly 2 players (`bluff` entry in `games.js` has no `nPlayer`/`minPlayers`/`maxPlayers` — confirmed in the correctness pass as strictly 2-player, no bot, no demo). Two consequences: (1) it can't be practiced solo, so a new player's very first game is against a live human with no ramp-up; (2) real Liar's Dice/Perudo is designed as a multi-player elimination game where the *number of total dice left on the table* across 3+ players is itself the read — collapsing to 1v1 removes that whole informational layer, leaving pure "10 dice total, guess the split" math, which is a real but noticeably smaller game than the genre's usual shape.
  - **Single highest-value change:** add a bot opponent (even a simple EV-threshold bidder — bid while expected count for the current face exceeds actual count by some margin, call otherwise) so the game is at least practiceable solo. This is the higher-leverage first step over full multiplayer, since it's a much smaller build and directly answers "can a solo player even try this."
  - ```
    ASSUMPTION: an EV-threshold bot (bid up while E[count] > current bid by a margin, otherwise call) is a reasonable difficulty floor for a first bot pass.
    IMPACT: too weak a bot teaches bad habits (players learn to always push); too strong feels unbeatable on a 1v1 pure-math game with no bluffing tell to read from code.
    IF WRONG: the practice-mode goal backfires either way.
    VALIDATE (posture B): starting margin = call when actual bid quantity exceeds statistical expectation by more than 1 die (labelled starting threshold); track bot win rate against a few informal human playtesters; if it's landing outside roughly 40-60%, adjust the margin up or down.
    ```

### Dominant strategy? Partially — the bidding math is well-trodden (public Perudo strategy exists for expected-value bidding), so a player who's read any strategy guide has a real, if not absolute, edge; bluffing timing (deliberately over/under-bidding to mislead) is the part that stays unsolved and keeps a knowledgeable opponent honest.

### Does skill change the outcome? Yes — both EV math and bluff-reading are real, learnable skills, genuinely present here, unlike Word Hunt's typing-speed issue.

### Would you play it twice? Yes, if you have exactly one other person and both understand it's a 1v1 dice-math duel rather than a party game (it's correctly categorized `dicebluff`, not `party`, so the platform isn't over-promising here the way Two Truths is). It just can't currently be anyone's *first* exposure to the mechanic, since there's no bot to learn against.

---

## Herd Mind

**Player goal:** everyone privately answers an open prompt ("name a fruit," etc.); scoring rewards matching the majority's normalized answer; a "Pink Cow" penalty/catch-up token passes to a lone singleton when everyone else grouped.

**System rules:** `groupAnswers`/`scoreGroups` (`herdLogic.js:66-94`) are clean, deterministic, and tie-aware (all tied top groups score). `nextCow` (`:108-119`) is a genuinely clever design touch: the Cow only transfers on an *exact* single-singleton case, and `getMatchWinner` explicitly blocks a Cow-holder from winning even at target score (`:128-134`) — a real catch-up/anti-runaway mechanic, not just cosmetic flavor.

### 5-Component evaluation

- **Clarity / Response / Fit** — good; the concept ("what would everyone else say") is immediately graspable, and normalization (`normalizeAnswer`, `:47-56`) handles plurals/punctuation sensibly so near-miss answers still group.
- **Motivation — strong, not weak.** The post-reveal "wait, you also said pancakes?" moment is exactly the conversation-generating beat the task is asking these games to produce, and the Cow mechanic adds a running subplot across the whole match (who's currently cursed) that a single-round game like Trivia or Wavelength doesn't have.
- **Satisfaction** — good; scoring and Cow transfer are both visible and immediate at reveal.
- If anything is worth naming as a soft spot, it's that content is a fixed 150+ prompt pool (measured indirectly via the correctness report, not independently recounted here) — healthy relative to Fibbage/Trivia, but still finite; not urgent enough to be the "weakest component."

**One line carried over from the correctness pass because it bears directly on this game's core premise:** answers are written to Firebase in plaintext the instant a player submits, before the round closes (`games-review-party-s1/report.md` #2) — this doesn't just leak information, it undermines the entire "guess the majority independently" premise if exploited, since Herd Mind's whole design assumes simultaneous, blind answering. Worth the captain treating this as higher priority than a typical correctness bug specifically because of that overlap with the design premise.

### Dominant strategy? No — predicting a specific group's Schelling point is inherently social and shifts per table/prompt.

### Does skill change the outcome? Yes — "reading the room" (what would *these* people say) is real and non-mechanical, closer to Fibbage/Wavelength's skill category than to a knowledge or reflex game.

### Bots

`HerdDemo.jsx` deliberately scripts bots to converge 60% of the time on round-favored pool entries (`:85-101`) specifically so a solo player experiences herds forming — a reasonable, honest simplification for solo practice, not a bot pretending to reason.

### Would you play it twice? Yes, clearly — best content volume, a genuine anti-runaway mechanic, and a scoring model built entirely around producing "wait, really?" conversation.

---

## Trivia Blitz

**Player goal:** Kahoot-style — 10 questions per match, answer within a 15s window, faster-and-correct scores more, consecutive correct answers build a streak bonus.

**System rules:** `scoreAnswer`/`applyRoundScores` (`triviaLogic.js:55-93`) are well-specified: wrong or late (beyond `QUESTION_MS + GRACE_MS`) always scores 0 and resets streak; correct answers get `BASE_POINTS (500) + speed component + streak bonus (capped at STREAK_CAP=300)`. `seededDraw` shuffles the deck per match seed then sorts by difficulty tier (`:39-46`) so a match ramps easy→hard rather than presenting difficulty in random order — a nice, deliberate pacing choice.

### 5-Component evaluation

- **Clarity / Response / Fit** — good; correctness gates scoring before speed ever matters, so this isn't purely a reflex race — you have to actually know the answer first.
- **Satisfaction** — good; the streak mechanic gives a visible, escalating reward for consecutive correct answers, which is a real second feedback channel beyond the raw score.
- **Motivation — the weak component, purely a content-volume problem, and a simple one.** 60 questions at 10/match means a deck exhausts in **6 matches** (measured: 60 ÷ 10, 2026-08-22) — for a casual one-off group that's fine, but for a repeat group, that's a low ceiling, especially with `seededShuffle` meaning the exact same 60 questions eventually resurface in a different order rather than being replaced.
  - **Single highest-value change:** grow the deck. Unlike Fibbage, there's no compounding sequencing bug here — `seededDraw` already re-shuffles per match, so this is a pure content-volume fix, not a logic fix.
  - `ASSUMPTION: 60 questions is undersized for a platform meant for repeat play. IMPACT: groups doing more than one trivia session per week hit content fatigue quickly. VALIDATE (posture B): target ≥200 questions as a starting value (this deck's own header comment already says "expand toward 200+ later," per the correctness pass — i.e. this isn't a new target, just restating the team's own stated goal); test by tracking matches-to-first-repeat per group and raising the target if repeats still land inside a typical session.`

### Dominant strategy? No forced line, but there's a real design question the task specifically raises: does skill or speed decide the outcome?

**Answer:** mostly skill, with speed as a tiebreaker layered on top, and that's the correct design for this genre. A wrong answer always scores 0 regardless of reaction time (`applyRoundScores`, `:82-86`), so knowledge is the gate; only among players who already know the answer does typing/tapping speed decide the margin. This is meaningfully different from Word Hunt's problem below, where speed decides the *entire* outcome on shared content, not just the margin between two correct answers.

### Would you play it twice? Yes, until the deck runs dry — which, per the measured math above, happens faster than it should for a genuinely repeat-playing group.

---

## Word Duel

**Player goal:** each player privately sets a 5-letter secret word (commit-reveal) for the other to guess; both race the other's word simultaneously; fewer guesses wins, tie broken by speed; best of 3 (`MATCH_WINS = 3`).

**System rules:** confirmed via `WordDuelGame.jsx:270` (`handleSetWord`) that **each** player sets their own word — this is not a shared-word race like Word Hunt, it's a mutual, asymmetric duel. `markGuess` (`wordduelLogic.js:11-43`) correctly implements Wordle's two-pass green/yellow algorithm including duplicate-letter handling. `compareResults` (`:46-67`) correctly ranks fewer-guesses-wins, then faster-time, then draw.

### 5-Component evaluation

- **Clarity / Response / Satisfaction / Fit** — all solid; this is a faithful, correctly-implemented competitive Wordle with a real commit-reveal integrity check (`verifyTranscript`, `:73-115`) that even validates every recorded guess mark server-side-equivalent, which is more rigorous than most of the other games' verification.
- **Motivation** — reasonable: because each player sets a word for the *other*, there's a small social layer (pick something mean-but-fair for your opponent, same design space as Hangwoman) layered on top of the pure Wordle-solving skill.

### Dominant strategy? No forced line — word selection (as setter) and deduction speed/accuracy (as guesser) are both genuine, separable skills.

### Does skill change the outcome? Yes, primarily — Wordle-solving is a real deduction skill (which starter words maximize information, how to use yellow/green feedback), with typing speed as a minor tiebreaker only when both players solve in the same number of guesses.

### Group size

Fixed at exactly 2 (`custom: true, simultaneous: true`, no `nPlayer`). That's the honest shape of a mutual 1v1 duel — unlike Two Truths, this isn't pretending to be something bigger than it is; it's filed under `category: 'word'`, not `party`.

### Would you play it twice? Yes — real skill, low content-repetition risk since the answer word pool is large (Google-20k ∩ 5-letter, not a small curated deck), and the social layer of choosing your opponent's word adds a little personality each match.

---

## Word Hunt

**Player goal:** both players trace words simultaneously on an identical seeded 4×4 Boggle grid for 80 seconds; classic Boggle scoring by word length; best of 3.

**System rules:** correct Boggle mechanics — the 16 classic dice with fixed face distributions are preserved verbatim (`BOGGLE_DICE`, `wordhuntLogic.js:23-27`), `generateGrid` is properly seeded/reproducible, `findPath`'s DFS correctly handles the Qu tile as a 2-letter consumer (`:96`), and `scoreWord`'s length table matches the standard Boggle scoring curve.

### 5-Component evaluation

- **Clarity / Response / Fit** — good; nothing ambiguous about tracing tiles or the scoring curve.
- **Satisfaction — the weak component, and this is the task's own named example.** Both players score every word they each independently find, with zero interaction between the two players' word lists (`scoreWords`, `:123-125`, is a plain per-player sum). This produces the dominant strategy the task flags: since both players share the identical grid, the fastest way to rack up points is blitzing every common 3-4-letter word you can see (worth only 1 point each per `scoreWord`, but there are dozens of them and both players get full credit for the same ones), rather than hunting for longer, rarer words. Vocabulary breadth stops mattering once "type fast" already gets you most of the achievable score.
  - **Single highest-value change — and the task's suggested fix is the right one:** adopt classic 2-player Boggle's overlap-cancellation rule — a word found by *both* players in the round scores 0 for both. This is a pure scoring-time computation (both players' word lists are presumably only revealed at round end, so this requires no new gameplay information exposure, just a different reduce over both lists) and it directly targets the failure mode: it makes "find something they won't" the winning strategy instead of "type what they'll also type, but faster."
  - ```
    ASSUMPTION: overlap-cancellation, applied exactly as in classic 2-player Boggle (any word found by both players scores 0 for both), is the correct fix for THIS game's specific problem (both players seeing the identical grid, unlike free-form Boggle where boards can differ) — I have not verified this against a citable published rules text, so this is a starting rule, not a sourced one.
    IMPACT: if the cancellation rule is applied but players still gravitate to short common words because the marginal point value of length-3/4 words (1 point flat) is still "safe enough" even at a lower expected value post-cancellation, the fix only partially works.
    IF WRONG: a second lever (e.g. raising the point value gap between short and long words, or raising MIN_WORD_LENGTH) may be needed alongside cancellation.
    VALIDATE (posture B): starting rule = full overlap-cancellation as described; test by comparing average found-word length and score-per-match between pre- and post-change matches (needs instrumentation — not available from reading code alone); direction on failure = if average word length doesn't rise, pair cancellation with a steeper length/score curve rather than reverting it, since cancellation alone directly fixes the "same word, both credited" problem even if it doesn't fully fix "everyone still types short words first."
    ```

### Dominant strategy? Yes, as flagged by the task and confirmed by reading `scoreWords` — speed at common short words currently dominates. The cancellation fix above targets this directly.

### Does skill change the outcome, or is it typing speed wearing Boggle's clothes? Currently, mostly the latter for the marginal outcome — vocabulary matters (you still need to *know* the word), but because both players credit for the same finds, raw input speed on the easy, high-overlap words decides close matches more than it should.

### Group size

Fixed at exactly 2 (`simultaneous: true`, no `nPlayer`) — this is a duel, not a party-scale game, despite being reviewed here under the party/word/trivia umbrella. Filed under `category: 'word'`, consistent with that scope.

### Would you play it twice? As shipped, only mildly — it's fast and low-friction but the dominant strategy caps its depth. With the overlap-cancellation fix, yes, meaningfully more so, since it would reward the thing vocabulary games are supposed to reward.

---

## Hangwoman

**Player goal:** classic Hangman — a setter secretly picks a word/phrase (commit-reveal, unlimited length via free text), the guesser calls letters, 6 wrong guesses (`MAX_WRONG = 6`) ends the round in a loss.

**System rules:** described in the project's own `CLAUDE.md` as the reference pattern for hidden-info in this codebase, and reading `hangmanLogic.js` bears that out — `validateWord`, `applyGuess`, `isWordGuessed`, and `deriveRoundResult` (`:67-75`) are all small, pure, and unambiguous, with `verifyRoundConsistency` (`:47-61`) giving a genuine server-side-equivalent integrity check on every recorded guess.

### 5-Component evaluation

- **Clarity / Response / Satisfaction / Fit** — all fine; classic Hangman is a known quantity and this implementation doesn't do anything to undermine it.
- **Motivation — the weak component, and it's a genre-identity issue more than a numbers one.** Content is effectively infinite (any setter-typed word/phrase, 3-30 letters, `validateWord`), which fully solves the repetition problem every deck-driven game in this set struggles with. But most of a round is one player silently guessing letters while the other watches — there's comparatively little of the "table talking" the task explicitly asks these games to produce, compared to Sketch (chat-guessing, visible to everyone), Wavelength (clue debate), or Herd Mind (post-reveal reactions). The interesting social moment is almost entirely front-loaded into the setter's word choice, not sustained through the round.
  - **Single highest-value change:** none that fixes this without changing the genre — Hangman is fundamentally a solitaire-against-a-puzzle-someone-else-built game, and that's fine as a filler, not as a flagship "does this create conversation" pick. If the goal is more table talk, the lever isn't a mechanic change here; it's steering repeat groups toward Sketch/Wavelength/Herd Mind for that specific need, the same conclusion the earlier Tic-Tac-Toe/Connect Four report reached for solved games — route engaged players elsewhere rather than patch the base game.

### Dominant strategy? Partially — the guesser's optimal opening (standard English letter-frequency order: E, A, R, I, O, T, N, S…) is well-known and close to mechanical, similar in spirit to Tic-Tac-Toe's memorized forcing lines, though it doesn't guarantee a win the way TTT's does, since the setter can pick short/obscure/phrase words specifically to defeat frequency guessing.

### Does skill change the outcome? Yes, on both sides — the guesser's vocabulary and letter-frequency instinct, and the setter's ability to pick something hard-but-fair, are both real and separable skills.

### Group size

Fixed at exactly 2 (setter/guesser), no path to more players — an honest limitation for a game whose entire mechanic is one hidden secret and one solver, unlike Sketch's guess-in-chat model which naturally extends to a crowd.

### Would you play it twice? Mildly yes — the infinite content is a genuine strength no other game in this set has, but the core solving loop is close enough to a known strategy that repeat value comes mostly from the setter's word choice, not from the puzzle itself getting harder to solve with practice.

---

## Sketch

**Player goal:** an artist is offered 3 tiered candidate words (easy/medium/hard) each round, picks one, draws it; everyone else guesses via chat; scoring rewards speed and rank among correct guessers, with a distinct formula when there's exactly one guesser (2-player games).

**System rules:** `sketchLogic.js` is thorough — `pickOptions` (`:90-119`) guarantees one word per difficulty tier with sane fallbacks if a tier's pool is exhausted; `roundDeltas` (`:202-225`) explicitly branches for the 1-guesser case (2-player match) versus 2+ guessers, rather than degrading gracefully/badly the way some multiplayer games do at their player-count extremes.

### 5-Component evaluation

- **Clarity / Response / Fit** — good; drawing-and-guessing is self-evident, and the tiered word-difficulty choice gives the artist a real, meaningful decision every round (easy = safer but lower ceiling, hard = riskier but presumably worth more to a good guesser — though I did not find an explicit point *bonus* tied to tier choice in `roundDeltas`, which is worth flagging: tier currently affects only draw-ability, not payout, so "hard" mode is pure risk with no scoring upside).
  ```
  ASSUMPTION: tier choice currently carries no scoring bonus (roundDeltas pays flat regardless of which tier was drawn) — verified by reading roundDeltas, which takes no tier parameter at all.
  IMPACT: an artist has no game-theoretic reason to ever pick tier 3 over tier 1 beyond personal challenge-seeking, which undercuts the interest of offering three tiers in the first place.
  IF WRONG: if tier does factor into scoring elsewhere (e.g. in the page component, outside sketchLogic.js), this finding is void — I did not read SketchGame.jsx's full scoring call site to confirm the absence, only sketchLogic.js's exported functions.
  VALIDATE: read SketchGame.jsx's round-scoring call site to confirm whether tier is threaded into points at all before treating this as a real gap.
  ```
- **Motivation / Satisfaction — the strongest pairing in the whole set.** Wrong guesses land in a shared chat visible to everyone (`chat: { [pushId]: { uid, text } }`), which is exactly the mechanism that turns a drawing game into a comedy generator — bad guesses are public and funny, not private and wasted. This is the single best "does the game create a conversation" answer in this review.
- The explicit 2-player scoring branch (`SOLO_GUESSER_BASE_PTS`, `SOLO_ARTIST_DIVISOR`) is worth calling out as good design practice on its own: most draw-and-guess games degrade badly at exactly 2 players (one artist, one guesser, no crowd) — this one was deliberately tuned for that case instead of just technically allowing it.

### Content

Deck is ~112 words across 3 tiers (measured, 2026-08-22 — the in-code comment claims "~250-word deck," which appears to be stale documentation, not the actual current count; worth a quick correction pass on the comment regardless of whether the deck itself needs growing). At roughly 37 words per tier, a long session will start recognizing tier-1 "easy" words first, since they're drawn most often relative to pool size if tier selection frequency isn't otherwise balanced.

### Dominant strategy? No — drawing/guessing skill and vocabulary don't reduce to a fixed line.

### Bots

None, and none expected — drawing can't be meaningfully automated for a solo/practice mode, so this is an honest genre limitation, not a design gap.

### Would you play it twice? Yes, clearly the strongest pick in the set — real laughs, real skill variance (both drawing and guessing), and the only game reviewed here that explicitly designs around its own 2-player edge case instead of just allowing it.

---

## Cross-cutting notes

### Content pipelines: shuffled vs. sequential

Every deck-driven game in this set draws from a per-match seed **except Fibbage**, which advances `promptIndex` by simple modular increment (`FibbageGame.jsx:281`). This is worth the captain's attention as a one-line, low-risk, high-leverage fix, independent of any deck-size growth — see the Fibbage section above.

### Bots and honesty

Herd Mind's solo bots are honestly scripted to converge (not to "reason"), which is the right call for a majority-matching game — a bot that reasoned about the prompt the way a human does would be over-engineering something a simple convergence rig already solves believably. Fibbage's bots are the opposite case: they're meant to *deceive*, and a fixed small decoy pool undermines that goal specifically for repeat groups, compounded by the sequential-prompt bug. Trivia's speed-scoring design doesn't create a "does the bot feel robotic" problem the way a lying/bluffing game does, since correctness is objective — nothing to assess there.

### Group-size fragility, gathered

- **Breaks below 3, hard-capped at exactly 2, with no group path at all:** Two Truths (the one genuine Fit failure in the set — the format's whole cultural identity assumes a group), Bluff Battle (honest about being 2-player, just needs a bot), Word Duel, Word Hunt, Hangwoman (all three correctly filed under `category: 'word'`, not oversold as party games).
- **Scale cleanly 3–8:** Wavelength, Fibbage, Spyfair, Herd Mind, Trivia (2–8).
- **Explicitly tuned for its own 2-player edge case rather than just allowing it:** Sketch — worth calling out as the one game that treated "what happens at the group-size floor" as a real design question rather than an edge case to tolerate.

### What could not be assessed by reading

- **Actual bot conversational plausibility** — Spyfair's `generateBotStatement`/`renderSpyReply` and Fibbage's lie phrasing were inspected as code paths, not as rendered text, so whether a bot's chat output actually reads as robotic in live play (the task's specific concern) is unconfirmed. This needs a browser session, which this review was told not to use.
- **Real pacing/feel** — Sketch's draw timing (75s), Trivia's 15s question window, Spyfair's 4-minute questioning phase: all plausible as numbers but untested against actual group behavior (does 4 minutes of questioning drag or fly by at 8 players vs. 3?).
- **Whether Sketch's tier-3 "hard" words are actually meaningfully harder to draw/guess than tier-1**, beyond the deck's own self-labelling — no independent verification possible from static content alone.
- **Live group-size behavior at the configured maximums** (8 players for Wavelength/Fibbage/Spyfair/Herd/Trivia) — whether UI crowding or pacing (e.g. 8 people's chat scrolling in Sketch, 8 simultaneous votes in Spyfair) creates a *different* kind of break than the "too few players" failures analyzed above.
- **Whether Sketch's tier choice truly carries no scoring bonus** — flagged as an open assumption above; needs `SketchGame.jsx`'s scoring call site, not just `sketchLogic.js`.

## Numbers proposed in this report (index, with posture)

| Value/claim | Posture | Where |
|---|---|---|
| Fibbage deck: 26 prompts | **C** — measured directly from `decks/fibbage.js`, 2026-08-22 | Fibbage |
| Trivia deck: 60 questions, 10/match ⇒ 6 matches to first repeat | **C** — measured/computed directly, 2026-08-22 | Trivia Blitz |
| Sketch deck: ~112 words (not ~250 as the in-code comment claims) | **C** — measured directly from `decks/sketch.js`, 2026-08-22 | Sketch |
| Wavelength deck: 31 pairs | **C** — measured (carried from correctness report, spot-checked consistent) | Wavelength |
| Spyfair: 24 locations | **C** — measured directly from `decks/spyfair.js`, 2026-08-22 | Spyfair |
| Banded (tiered) Wavelength scoring reads as more satisfying than the current linear ramp | **B** — starting hypothesis with a stated test and revert condition | Wavelength |
| Sequential (non-shuffled) Fibbage prompt order is a bigger Motivation driver than raw deck size | **B** — starting hypothesis, test = ship shuffle only, hold deck size fixed, measure | Fibbage |
| Target ≥100 Fibbage prompts (order-of-magnitude match to Herd Mind) | **B** — labelled starting target with a test | Fibbage |
| Target ≥200 Trivia questions | **B** — restates the deck's own documented target, with a test to confirm it's still the right number | Trivia Blitz |
| Classic 2-player Boggle overlap-cancellation fixes Word Hunt's dominant strategy | **B** — labelled starting rule, not sourced to a citable text; explicit test and a fallback lever if it only partially works | Word Hunt |
| EV-threshold Bluff Battle bot as a practice-mode starting point | **B** — labelled starting heuristic with a threshold and a test | Bluff Battle |
| Spy-guess-location win condition, gated behind a minimum elapsed time | **B** — labelled starting mechanic + starting gate value, with a win-rate test | Spyfair |

No source-backed (posture A) numbers are proposed in this report — I did not have search access to produce a checkable citation for any of the above (e.g. the physical Wavelength game's actual scoring bands, or a citable text for Boggle's overlap-cancellation house rule), so claims that might otherwise be sourceable are deliberately downgraded to posture B rather than dressed as posture A.
