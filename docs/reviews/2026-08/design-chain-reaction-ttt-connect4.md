# Design review — Chain Reaction, Tic Tac Toe, Connect Four (and variants)

Reviewer scope: `chainReactionLogic.js`/`ChainReactionBoard.jsx` (default 8×10, classic 6×8); `gameLogic.js` + `tictactoe4Logic.js` + `ultimateTttLogic.js`/`UltimateTttBoard.jsx`; `connectFourLogic.js` + `connectFourPopLogic.js` (classic 9×7, 5-in-a-row 9×7, Pop Out 7×6). Read-only: no code changed, no build/dev-server/browser used. Correctness findings already logged in `games-review-strategy-s1/report.md` are not repeated except where they bear directly on a design question.

## Verdict, up front

**Best game of the three: Chain Reaction.** It's the only one of the three that is not solved, has a real skill ceiling, and rewards reading a live position. Keep it.

**Keep all three?** Keep Chain Reaction and Ultimate Tic Tac Toe. Downgrade base Tic Tac Toe and base Connect Four to "on-ramp / familiarity" tier rather than "game" tier — they're fine as a first five minutes on the platform, not as something to return to. Of the shallow-base variants, cut 5-in-a-row Connect Four; keep Pop Out and 4×4 TTT only as curiosities, not flagship content.

Ranked as games, best to worst:

1. **Chain Reaction (8×10 default)** — genuinely chaotic, genuinely readable near the endgame, has a real skill gradient (see below). The one game here where "would you play again" is an honest yes.
2. **Ultimate Tic Tac Toe** — the one TTT variant that adds a real second layer of decision-making (board-sending). Implementation is correct and mostly well-surfaced; one meta-tiebreak choice and one clarity gap for new players (below) are the only real issues.
3. **Chain Reaction (6×8 classic)** — same game, smaller board. Slightly more solvable/tactical, still good, just a notch below the big board because the smaller board caps how deep a plan can run before the whole board is committed.
4. **Connect Four Pop Out** — the only Connect Four variant that actually de-solves the base game (see below). Real, if narrow, addition.
5. **Tic Tac Toe (3×3)** — solved, but its role is honestly "the on-ramp," and it plays that role fine.
6. **Connect Four (9×7, four-in-a-row)** — solved in theory, and unlike TTT the solve isn't common knowledge, so it retains practical replay value against another human of unknown skill. Bigger board than the traditional 7×6 buys a little more room without truly restoring the position, so it sits below TTT's honest on-ramp framing.
7. **Tic Tac Toe 4×4** — makes the same shallow game slightly longer without adding a decision that TTT-3×3 didn't already have. Weakest of the TTT family, and its bot is broken (already logged), which for a "4×4 length isn't a decision" game matters more than for Chain Reaction, since length is the whole selling point.
8. **Connect Four 5-in-a-row (9×7)** — the number of empty cells relative to win length makes the position read as "keep dropping near your own stack," see below. Weakest of the nine games/variants reviewed. Cut candidate.

---

## Chain Reaction — default (8×10) and classic (6×8)

**Player goal:** place your orb in any cell that's empty or already yours; when a cell hits its critical mass (2 for a corner, 3 for an edge, 4 interior — `criticalMass()` in `chainReactionLogic.js:25-33`) it explodes, converting all orthogonal neighbours to your color and possibly triggering further explosions. Eliminate the opponent's orbs from the board.

**System rules:** correct and well-tested per the correctness review (chain/capture logic, `MAX_WAVES` safety cap against runaway cascades). `applyPlacement` (`chainReactionLogic.js:69-114`) resolves wave-by-wave with a settled board plus an ordered `steps` array for animation — that data shape is exactly what a chain-reaction game needs to be legible in replay, and `ChainReactionBoard.jsx` uses it correctly (see Clarity below).

### 5-Component evaluation

- **Clarity — the weakest component, and the one thing worth fixing.** The board renders orb count via up-to-3 dots (`OrbDots`, `ChainReactionBoard.jsx:7-36`) and gives a pulse animation once a cell is *already* one orb from critical (`nearCritical`, line 176). That's feedback at the moment of danger, but there is **no static telegraph of a cell's critical mass before you're already near it** — nothing distinguishes a corner cell (explodes at 2) from an edge (3) from an interior cell (4) except position on the grid, which a new player has to work out from board geometry rather than being told. Compare: the explosion replay itself (waves, flash overlay, burst animation) is excellent Clarity *after* a move resolves. The gap is entirely pre-move: predicting the cascade before you commit to it.
  - **Single highest-value change:** show critical mass as a small number/pip-count baked into the cell background even at 0 orbs (e.g. a faint corner/edge/interior tint or a tiny "/2" "/3" "/4" indicator), so a player can read danger zones across the whole board at a glance instead of only once orbs are already stacked there.
  - This is a Clarity fix, not a Response or Satisfaction fix — the debugging protocol table applies directly: "I didn't know that would happen" → Clarity → add a UI indicator, not a numbers change.
- **Motivation** — fine. Elimination win condition is unambiguous and every move visibly changes the board state; no persistent progression layer observed (no XP/rank), which is consistent with the rest of the platform (`durationMin`/`tags` in `games.js` show this is treated as a casual match-based game, not a meta-progression game).
- **Response** — good. Legal-move set is computed live (`legalSet`, `ChainReactionBoard.jsx:148-155`) and disabled during replay so no input races the animation; clicks map directly to placement with no queuing ambiguity.
- **Satisfaction — strong.** Multiple feedback channels fire together on a big cascade: staggered wave timing (140 ms/wave), explosion flash, burst overlay, per-wave sound (`sounds.hit(waveIdx)`), and the OrbDots re-pop animation. A large chain reads as a genuine "moment" rather than a silent board update — this is the best-executed feedback loop of the three games reviewed.
- **Fit** — good. Chaotic, escalating, physical-feeling explosions match a "chain reaction" identity; the pacing (explosions faster than a human can fully track turn-by-turn but slow enough to watch the causality) fits an arcade-adjacent strategy game.

### Dominant strategy?

No single opening or line dominates — this is the correct answer for a chaotic system, and it's what makes the game worth playing more than once. But there is a real skill/luck question the task specifically asks about: **is there enough control for skill to matter, or is a single move's cascade often so large that the outcome feels arbitrary?**

Reading the logic: cascades are **not** globally arbitrary. `applyPlacement` resolves deterministically and orthogonally — a chain only propagates through cells whose orb counts are already near critical, so a skilled player who tracks the board's "load" (which cells are one orb from exploding) can predict multi-wave cascades before triggering them. That's a real, learnable skill. What undermines it is exactly the Clarity gap above: the game *has* the information to plan around, but doesn't surface a cell's threshold clearly enough for a new player to build that mental model quickly. An experienced player (who has memorized corner=2/edge=3/interior=4 from repetition) has a meaningfully higher win rate against a new player than in, say, 3×3 Tic Tac Toe — that's a testable, falsifiable claim (see Numbers below), and it's the strongest evidence this game has real skill depth rather than being reflex/luck wearing a strategy game's clothes.

**Board size and control:** the classic 6×8 board (48 cells) versus default 8×10 (80 cells) doesn't change the rules, only the space. Smaller board → critical-mass thresholds get relevant sooner (fewer safe interior cells relative to total board), so classic mode should read as *more* tactical/immediate and *less* forgiving of a bad early move, while the bigger board gives more room to build up a "loaded" region before committing to a trigger. Both are legitimate difficulty/pace variants of the same well-designed core, not competing designs — this is a case where offering both board sizes earns its place, unlike most of the size variants in the TTT/Connect Four families.

### Bot assessment

`botChainReaction` (`demoBots.js:407-479`) is a **heuristic, not a search**: prioritizes an immediate opponent-wipe, then a highest-immediate-capture move, then a positional tiebreak (prefer corners > edges, avoid feeding a neighbour that's one orb from exploding). It does not read more than one ply ahead into future cascades. Against a human who is deliberately building a multi-cell cascade, this bot will not see it coming until the cascade is one move away — it can be baited. **Would a correctly-playing bot even be worth having here?** Yes, more so than for the solved games: because Chain Reaction's state space doesn't collapse to a known solution, a stronger bot (even simple 2-ply lookahead with cascade-size estimation) would still lose to a strong human sometimes and would give solo players a genuine ceiling to climb toward — unlike a perfect TTT/Connect Four bot, which just becomes "the wall you can't get past." This is the one game in the set where investing in a smarter bot has real payoff.

### Would you play it twice? 

Yes, honestly. The chaos is bounded by learnable rules, the feedback on a big cascade is the best in this set, and two board sizes give it different paces. The single fix that would most improve it is the pre-move critical-mass telegraph — without it, a chunk of the "arbitrary-feeling" complaints a captain might hear are actually a Clarity bug, not a game-design flaw.

---

## Tic Tac Toe family — 3×3 base, 4×4 variant, Ultimate variant

### Why would anyone open 3×3 Tic Tac Toe twice, knowing it's a forced draw?

Two honest reasons, and only two: (1) **on-ramp value** — it's the fastest possible way to teach a new user this platform's whole loop (create room, invite, place, see result) with zero rules explanation needed, and that has real value independent of replay depth; (2) **it isn't actually played at optimal skill by most casual players**, so a mismatched pair (e.g. an adult vs a child, or two people who haven't thought about it) can still produce real wins/losses even though *perfect* play draws. Neither reason is "it's a good repeated game." If the goal is a second session, TTT-3×3 is not the mechanism — it's the front door.

### 5-Component evaluation (TTT 3×3)

- **Clarity** — excellent; nothing to fix. Win line highlights, X/O glyphs, draw detection all correct and immediate (`getWinner`, `gameLogic.js:7-15`).
- **Motivation** — this is the actually-weak component, and it's structural, not fixable by tuning: once a player has seen the draw, there is no reason to expect a different outcome next game against equal skill. The "single change" answer here is honest: **there isn't one that fixes 3×3 itself** — the fix is routing engaged players toward Ultimate TTT (which the platform already treats as a variant of the same type via `variantOf: 'tictactoe'` in `games.js:158-164`), not patching the base game.
- **Response / Satisfaction / Fit** — all fine, unremarkable, no issues.

### Dominant strategy?

Yes, completely — perfect play draws, and the strategy (take center, then corners, block/win priority) is common knowledge. The bot (`botTicTacToe`, `demoBots.js:75-99`) itself is exactly this: win-check → block-check → center → corners → edges, one ply deep, no fork detection. It plays the "obvious" strategy correctly but does not defend against or execute forks beyond immediate win/block — against a human who knows the fork trick (e.g. opposite-corner opening) the bot can lose. That's a bot-quality gap worth noting for solo mode, though it's not the main issue with the base game.

### Does skill change the outcome? 

Only up to a point, then no. Skill matters exactly as far as "does this player know the standard forcing lines" — a coin-flip-adjacent binary, not a spectrum. Below that threshold it's genuinely decided by whether the *opponent* also knows them, which is closer to luck-of-matchup than skill expression.

---

### Tic Tac Toe 4×4 variant

**Does the variant fix the problem?** No. `getTicTacToe4Winner` (`tictactoe4Logic.js`) requires 4-in-a-row on a 16-cell board — this is a strictly larger search space than 3×3 but the *decision structure* is identical: same win/block/fork logic, just with more empty cells to scan. It does not introduce a new mechanic. Making a solved, shallow game longer is not the same as making it deeper.

**Verdict: cut, or redesign, don't keep as-is.** It currently ships with a bot that never blocks or wins correctly (already logged as broken in the correctness review — `botTicTacToe` runs the 3×3 `WINNING_LINES` against a 16-cell board and only ever evaluates the first 9 cells). Setting the bug aside, even a *correctly implemented* 4×4 bot doesn't change the design verdict: this variant earns its place only if 4-in-a-row on 4×4 is meaningfully harder to force than 3-in-a-row on 3×3 for two humans of matched skill — that is an open, testable claim, not something resolved by reading the code.

```
ASSUMPTION: 4×4 tic-tac-toe (4-in-a-row) does not have a known forced-draw
  proof as commonly cited/taught as 3×3's does, so its solved-ness is less
  settled in players' minds even if it is a small enough game to be solved
  by brute force.
IMPACT: if it is in fact a forced win/draw with a known strategy (plausible
  given the tiny state space), this variant carries the same "we both know
  how this ends" problem as 3×3 but takes longer to reach, i.e. it is worse,
  not just redundant.
IF WRONG: keep-3×3-and-cut-4×4 rests on flimsier ground than stated above.
VALIDATE: brute-force solve 4×4-TTT-4-in-a-row (16 cells is a small enough
  state space to fully search offline) and report whether it is a forced
  first-player win, forced draw, or second-player win under optimal play.
  This is a mechanical/computational check, not a playtest.
```

### Ultimate Tic Tac Toe — the deserving variant

**Does it earn its place, and is it doing the "send your opponent to a board" mechanic justice?** Yes to both, with one clarity caveat for new players.

The core mechanic — the cell you play in a miniboard dictates which miniboard your opponent must play in next (`applyUltimateMove`, `ultimateTttLogic.js:54-77`) — is a genuinely different decision layer than base TTT: every move is now a *double* decision (win/block locally, *and* choose where to send the opponent), and that second axis has no equivalent in 3×3 or the 4×4 variant. This is the one place in the TTT family where "does skill actually change the outcome" gets a real yes: reading two moves ahead — "if I take this cell, I send them to board X, which is already favorable for them" — is a decision novices reliably miss and stronger players reliably catch. That's exactly the kind of skill expression the base game lacks.

**Surfacing check:** `UltimateTttBoard.jsx` highlights the currently-active board with a colored ring (`activeRing`, `isBoardActive()`, lines 11-12) and dims/disables cells outside it. This correctly answers "where can I play right now," which is the necessary half of the mechanic. It does **not** answer the other half a new player needs: *why* they were sent there — there is no visual link (e.g. a brief highlight/arrow) from the cell just played to the board it activates, so a first-time player experiences "I got sent to board 7" as an opaque rule rather than watching cause and effect. This is the Clarity gap worth fixing, and it's a small, contained one: the mapping is `cellPosition % 9 → activeBoard`, entirely deterministic and already computed — the only missing piece is a one-frame visual connector or a short highlight pulse on the newly-activated board when a move lands.

**Single highest-value change:** on move resolution, briefly pulse/highlight the miniboard that the just-played cell activates, so the causal link ("your position within a miniboard determines your opponent's next miniboard") is *shown*, not just stated in a rules blurb. This is a Clarity fix per the debugging protocol ("I didn't know that would happen" → add a UI indicator), and it's the single most important onboarding moment in the whole TTT family, because it's the one mechanic actually worth learning.

**Meta-tiebreak note (already logged as polish/confirm in the correctness review, restating the design angle only):** when every miniboard is decided with no 3-in-a-row on the meta board, the majority-of-boards-won rule (`getUltimateWinner`, `ultimateTttLogic.js:43-48`) means this Ultimate variant draws *less often* than the traditional ruling would. From a replay-value standpoint this is arguably the right call — fewer draws means more decisive, memorable endings, which works in the variant's favor design-wise even though it diverges from convention. Worth the captain explicitly confirming it's intentional (already flagged), but if it is, it's a good design choice, not just a deviation.

### Would you play it twice?

3×3: no, and that's fine — it isn't trying to be replayed, it's trying to be the front door. 4×4: no, and it should be — it's 3×3's problem with a longer runtime, cut or rework it. Ultimate: yes — it's the one member of this family with a real second decision axis and a skill ceiling a novice can visibly climb toward, once the "why was I sent here" moment is made legible.

---

## Connect Four family — classic (now 9×7, 4-in-a-row), 5-in-a-row (9×7), Pop Out (7×6)

Note for the record: the default/"classic" Connect Four in this codebase is **not** the traditional 7×6 board — it now runs on 9×7 (`CF_BIG`, `connectFourLogic.js:73-76`, wired as the base `connectfour` type in `games.js:203-215`). The 7×6 `DEFAULT_COLS/DEFAULT_ROWS` constants only survive as the board for Pop Out. This matters for the "solved game" framing below: 9×7 four-in-a-row is a bigger board than the position Connect Four's first-player-win proof was established on.

### Why would anyone open Connect Four twice, knowing it's a first-player win?

Similar answer to TTT, with one real difference worth stating plainly: **the first-player-win proof for Connect Four is not common knowledge the way TTT's draw is.** Almost every adult has independently rediscovered that TTT is drawish; almost nobody has independently derived Connect Four's opening theory (columns 1,3,5,7 win for the first player under perfect play — a computer-search result, not something a player over-the-board reasons out). So in practice, two humans playing 9×7 Connect Four are not playing a "known dead" game the way two humans playing 3×3 TTT are — the *theoretical* solve exists, but it isn't *felt* the same way, and the bigger-than-standard board makes casual near-perfect play even less likely. This is a legitimate, if fragile, source of replay value: it survives until a player looks it up, at which point it collapses the same way TTT did. Worth being honest that this is a *weaker* position than "genuinely unsolved," not a refutation of the "these are solved games" framing.

### 5-Component evaluation (Connect Four base)

- **Clarity / Response / Satisfaction / Fit** — all solid; drop mechanic and gravity are self-evident, win-scan (`getWinnerWithConfig`, `connectFourLogic.js:12-32`) is correct and tested.
- **Motivation — weakest, same structural issue as TTT:** no persistent stakes beyond the single match, and (per above) the "solved" ceiling caps how much a repeat player can improve before the game becomes uninteresting to them specifically, even if it isn't uninteresting to the platform's broader casual audience.
- **Single change:** none that meaningfully fixes the base game's Motivation ceiling — same conclusion as TTT-3×3: route engaged players to Pop Out (the variant that actually changes the decision space) rather than trying to patch the base game.

### Does the bot make it worth playing solo?

`botConnectFour` (`demoBots.js:115-145`) is 1-ply win/block plus a center-biased random pick (80% from the top-3 center columns). It does not detect multi-move forks (the classic "double threat" tactic that decides most real Connect Four games between two decent players). A human who has read *any* Connect Four strategy guide will beat this bot consistently by setting up a fork the bot doesn't see coming until it's already lost. **Is a correctly-playing bot worth having at all here?** Marginally, and only as a practice tool below the level of "beats a Connect Four solver" — a genuinely perfect bot would make solo Connect Four exactly as replay-dead as solo TTT against a perfect bot (always the same forced outcome), so the *right* investment is a bot with a tunable skill dial (imperfect on purpose, several tiers), not a stronger single bot. That's a Motivation-layer recommendation, not a Response one.

### Variant-by-variant

**5-in-a-row (9×7, `connectfour5`) — cut.** Board is 9×7 (63 cells) and requires 5-in-a-row instead of 4. The ratio of board size to win-length barely moves relative to base (9×7 board fits a 5-run about as comfortably as 9×7 fits a 4-run — there's ample room either way), so this doesn't change the *character* of play the way, say, doubling win-length relative to a fixed small board would. It reads as "the same game, marginally harder to complete," not a new decision space. Of everything reviewed, this is the clearest "makes the same shallow game longer" case in the brief's own framing, and the weakest entry in the whole set.

```
ASSUMPTION: on a 9×7 board, 5-in-a-row does not meaningfully change fork
  structure/threat density relative to 4-in-a-row on the same board, so the
  variant is additive complexity in board size only, not in decision depth.
IMPACT: if this assumption is wrong (i.e. 5-in-a-row on 9×7 actually
  produces meaningfully different multi-threat patterns than 4-in-a-row
  does), the cut recommendation above is too aggressive.
IF WRONG: a legitimate variant gets cut for the wrong reason.
VALIDATE (posture B, starting value + test): have 6+ playtest pairs of
  roughly matched skill play both connectfour (4-in-a-row/9×7) and
  connectfour5 (5-in-a-row/9×7), and compare average move count to decisive
  win and self-reported "did you see forced threats coming." If move-count
  and threat-legibility profiles are statistically indistinguishable between
  the two, that confirms the cut; if 5-in-a-row shows meaningfully different
  threat patterns, keep it and say why in the variant blurb.
```

**Pop Out (7×6, `connectfourpop`) — keep, it's the one that earns its place.** Popping your own bottom disc (`popColumn`, `connectFourPopLogic.js:49-56`) genuinely changes the game's information structure: a "settled," seemingly safe stack can be reshuffled by either player on any turn, so positions that would be static/dead in base Connect Four stay live. The house rule ("if both complete a four on the same pop, the mover wins," `popWinner`, `connectFourPopLogic.js:62-70`) is a real, if minor, new tactical wrinkle (a pop that completes your opponent's line while also completing yours is not automatically bad for you). This is the actual answer to "do the variants restore meaningful choice" for the Connect Four family — Pop Out does, 5-in-a-row doesn't.

One caveat: the bot only ever drops, never pops (`botConnectFourPop`, `demoBots.js:483-486`, explicitly commented as intentional/"good enough for casual solo practice"). Against a human who pops aggressively, this bot cannot defend the one mechanic that makes the variant interesting — solo Pop Out is meaningfully weaker than multiplayer Pop Out as a result. Not a bug (it's documented as a deliberate simplification), but worth flagging as the ceiling on solo-mode value for this specific variant.

### Would you play it twice?

Base Connect Four (9×7): a soft yes, for now — the solve isn't common knowledge the way TTT's is, so it survives a few sessions against varied opponents before it collapses the same way. 5-in-a-row: no, it's the same game slightly slower. Pop Out: yes — it's the one variant in this whole review that changes what a "safe" position even means.

---

## Cross-cutting: does the platform show players *why* a move was good?

No, not directly, in any of the three games. None of the boards annotate threat cells, near-critical cells (beyond Chain Reaction's post-hoc pulse), fork opportunities, or forced-move situations. The gap is consistent across the set, which suggests it's a platform-level Clarity choice (keep boards visually clean, no hint overlays) rather than a per-game oversight — worth naming as a deliberate trade-off the captain should own, not an accidental omission repeated three times. If the captain wants to invest in "novice can see why a move mattered," Chain Reaction's pre-move critical-mass telegraph and Ultimate TTT's send-target highlight (both named above) are the two highest-leverage places to start, because both games actually have a skill gradient worth illuminating — TTT-3×3, TTT-4×4, and base Connect Four don't have enough depth left to make the investment pay off.

## Numbers proposed in this report (index, with posture)

| Value/claim | Posture | Where |
|---|---|---|
| Experienced Chain Reaction players have a meaningfully higher win rate vs. new players than in 3×3 TTT | **B** — starting hypothesis; test = play N matched pairs, track win rate by self-reported experience tier; direction on failure = if win rate is statistically flat across experience tiers, the "real skill depth" claim in this report is wrong and Chain Reaction should be re-evaluated as closer to arbitrary | Chain Reaction, dominant-strategy section |
| 4×4 TTT (4-in-a-row) solved-ness is unproven from reading alone | **B** — labelled assumption with a concrete validate step (brute-force solve, 16 cells is tractable) | TTT 4×4 section |
| 5-in-a-row on 9×7 doesn't meaningfully change fork structure vs. 4-in-a-row on the same board | **B** — labelled assumption with a 6-pair playtest validate step | Connect Four 5-in-a-row section |

No source-backed (posture A) numbers are proposed — nothing in this report claims an external citation. The only two facts stated as settled (Tic Tac Toe is a forced draw under perfect play; Connect Four is a first-player win under perfect play) are the well-established, independently-reproducible combinatorial-game-theory results the task brief itself states as given, not values this report is asserting new numbers for.

## What could not be assessed by reading

- **Actual play pacing/feel** — animation timing (Chain Reaction's 140ms/wave, Ultimate TTT's `place-pop` animation), whether the Chain Reaction critical-mass telegraph gap *actually* confuses new players or whether the OrbDots visual is more legible in motion than it reads in static code — all require running the app in a browser, which this review was told not to do.
- **Real win-rate/skill-gradient data** for any of the three games — every skill-depth claim above is argued from the logic/UI structure (what information is available to a player and when), not from observed match outcomes. The Numbers Policy table above converts the two testable ones into explicit posture-B proposals rather than presenting them as settled.
- **Whether the platform's bots are tuned deliberately weak for casual play** (a legitimate design choice) versus accidentally weak (an oversight) — the code reads as intentionally simple/heuristic across all bots reviewed (Chain Reaction, TTT, Connect Four, Pop Out), and Pop Out's bot has an explicit comment confirming intent, but there's no equivalent comment for the others, so this is an assumption, not a confirmed fact.
- **Actual novice comprehension of Ultimate TTT's send-mechanic** without the suggested highlight — the report treats this as a Clarity gap on structural grounds (no visual causal link exists in the code), not from observing a real new player's confusion.
