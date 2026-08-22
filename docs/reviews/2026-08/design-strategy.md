# Design review — Gomoku, Reversi, Order and Chaos, Hex, Dots and Boxes (6×6+4×4), SOS, Blockade, Battleship, Mancala

Reviewer scope: the nine games/variants above. Read-only — no code changed, no build/dev-server/browser used. Correctness findings already logged in `games-review-strategy-s1/report.md` are referenced in one line at most where they bear on a design question, never repeated as findings.

## Ranked list — best to worst as games

| # | Game | Verdict | One-line why |
|---|------|---------|---------------|
| 1 | **Blockade** (Quoridor) | Keep | Race + wall-blocking with correct path-preservation checks; deepest, most symmetric, most skill-driven game in the set — no known human-practical solve. |
| 2 | **Battleship** | Keep | The only hidden-information game here; commit-reveal is cryptographically sound and the hunt/target skill layer is real, not cosmetic. |
| 3 | **Reversi** | Keep (fix the freeze first) | Genuine classic depth (mobility, parity, corner control) on par with Blockade — docked one slot because the logged no-pass freeze means it can't always be finished as shipped. |
| 4 | **SOS** | Keep | Real tactical depth (deny/bait an S-O-S, chain extra turns), correctly implemented general variant, no glaring fairness gap. |
| 5 | **Mancala** (uncommitted) | Keep, fix normalization first | Classic Kalah sowing/capture logic is sound by hand-trace; real skill (store-timing, capture setups) survives casual play even though Kalah(6,4) is weakly solved for perfect play. |
| 6 | **Dots and Boxes (6×6)** | Keep | The chain/double-cross endgame is real and rewards mastery hugely — but it's the least *legible* game in the set for a new player (see below). |
| 7 | **Order and Chaos** | Keep, watch balance | Genuinely interesting asymmetric-goal concept and correctly implemented, but the specific ruleset (Order wins on any 5-run, Chaos needs a clean full board) is documented elsewhere as Order-favored on a 6×6 board with no compensating mechanic here. |
| 8 | **Dots and Boxes (4×4)** | Keep as "quick" tier only | Same excellent mechanic, but the smaller board gives the long chains that make 6×6 interesting less room to form — shallower version of #6, not a distinct game. |
| 9 | **Hex** | Rework (add swap) | Real, no-draw, positional depth (best win-detector in the set, BFS not line-scan) undercut by a proven-but-practically-distant first-player win with zero mitigation. |
| 10 | **Gomoku** | Rework (add swap2 or forbidden moves) | Weakest of the set: freestyle rules plus a first-player advantage that, unlike Hex's, is well-documented and executable by a merely strong (not perfect) human. |

No outright cut in this set — every game here has a real mechanic worth keeping. The two "rework" verdicts (Hex, Gomoku) are asking for a known, standard, small addition (a swap rule), not a redesign.

---

## Blockade (Quoridor)

**Player goal:** race your pawn to the opposite edge row before your opponent, using up to 10 walls each to slow them down — but you may never wall either player out of a path entirely.

**System rules:** `legalPawnMoves` correctly implements the three Quoridor pawn-move cases (step, straight jump over an adjacent opponent, diagonal jump when the straight jump is blocked). `isWallMoveLegal` runs a full BFS (`hasPathToGoal`) for **both** players before allowing a wall placement — this is the one rule the task flagged to check closely, and it's right: a wall that would seal either player out is rejected pre-emptively, not detected after the fact.

### 5-Component evaluation

- **Clarity — the weakest component.** Wall-slot indexing (`hSlot`/`vSlot`, 128 total slots) and the jump-adjacency rules (straight jump vs. diagonal-around) are non-obvious geometry for a first-time player. Nothing in the logic layer surfaces *why* a diagonal jump became available (i.e., "your straight jump was blocked, so diagonals opened up") — that's presentation-layer information the pure logic doesn't carry, so I can't confirm from `blockadeLogic.js` alone whether `BlockadeBoard.jsx` telegraphs it. Assume it's an open question (see Assumptions below).
  - **Single highest-value change:** when a legal-move set is computed and a jump is available, distinguish "straight jump" cells from "diagonal jump" cells visually (not just as one undifferentiated set of clickable cells), so a player learns the state-machine (block → jump → diagonal-around) by watching it rather than reverse-engineering it.
- **Motivation** — solid. Race-to-goal is an unambiguous, high-stakes objective every move; wall count is a visible, dwindling resource (`BK_WALLS_PER_PLAYER = 10`) that creates real tension near the end of a wall-heavy game.
- **Response** — good. Moves are validated against a precomputed legal set (`legalPawnMoves`) before being offered, so there's no "I clicked and nothing legal happened" ambiguity once the UI restricts to that set.
- **Satisfaction** — depends on presentation (BFS path/route visualization, wall-placement feedback) which I can't confirm from logic alone; flagged as an assumption below.
- **Fit** — good. Turn-based race + resource-denial matches an abstract-strategy identity; nothing about the pacing (10 walls, 9×9 board) fights the genre.

### Dominant strategy?

No. Quoridor (which this is a faithful port of) has no known dominant opening or forced win at 9×9 with 10 walls per side under human-reachable play — it remains an actively studied combinatorial game. The bot here (`computeBotMove`) is a greedy heuristic (walk-shortest-path when ahead, otherwise hunt for the highest-damage wall near the opponent's shortest path) — it does not look more than one wall-placement ahead, so a human who understands *multi-wall* maze-building (using two or three walls in combination to force a long detour) will beat it. That's a real skill gradient, not a bot flaw that caps human-vs-human play.

### Does skill change the outcome?

Yes, clearly. Reading the opponent's shortest path and choosing *which* wall most increases their distance while minimizing damage to your own (exactly the `gain = (Δopp - Δmine)` heuristic the bot itself approximates) is a genuine spatial-reasoning skill that separates novices from experienced players, and it compounds — a well-placed early wall changes the whole rest of the path-finding problem.

### Would you play it twice?

Yes, honestly, on design alone. It's Quoridor, correctly implemented, and Quoridor is a good game. The one caveat is Clarity around the jump state machine, which I could not fully verify without the board component's rendering — worth a quick playtest to confirm new players understand *why* a diagonal jump appeared.

```
ASSUMPTION: BlockadeBoard.jsx visually distinguishes straight-jump destinations
  from diagonal-jump destinations, and gives some feedback on why a wall
  placement was rejected (path-sealing vs. slot-conflict vs. out-of-walls).
IMPACT: if it doesn't, the "block → jump → diagonal" state machine and the
  "why was my wall rejected" moment are both invisible to a new player, which
  would make Clarity the actual biggest problem with this game, not a minor one.
IF WRONG: the single-highest-value-change recommendation above still stands,
  but should be treated as urgent rather than a polish item.
VALIDATE: read BlockadeBoard.jsx (out of this review's file set) or run one
  new-player playtest and ask them to narrate their own jump/wall reasoning
  out loud.
```

---

## Battleship

**Player goal:** place a hidden 5-ship fleet, then alternate calling shots at the opponent's hidden grid until one fleet is fully sunk.

**System rules:** the commit-reveal trust model (`docs/prds/battleship.md`, mirrored in the file header) is sound: `serializeFleet` is canonical-order so identical fleets hash identically; `gradeShot` is the single source of truth shared by both the live defender-side grader and the reveal-time `verifyTranscript`, so they cannot diverge; `verifyTranscript` re-grades every shot **sequentially** against only the shots before it, correctly preventing a hit from retroactively becoming a sunk-ship reveal out of order. Ships may touch (a real, if minor, ruleset choice — worth naming as intentional, not a gap, since "ships may not touch" is a common house-rule variant this implementation didn't pick).

### 5-Component evaluation

- **Clarity** — good. A shot's outcome space is exactly `miss | hit | sunk:<ship>`, which is the standard three-state feedback Battleship needs and nothing more; `remainingShips` gives a live fleet-status readout for the UI to render.
- **Motivation** — good; every shot is a real information-gain event (this is the one game in the set where hidden information itself *is* the core loop) and elimination is unambiguous.
- **Response** — good, with one real gap: `pickShot`'s "live hit" detection is explicitly commented as an *approximation* — it treats every unsunk-ship hit as live rather than tracking which specific hits belong to which not-yet-sunk ship. Against a human player this doesn't matter (the human sees their own board reasoning), but it caps the bot's hunt/target quality once two ships' hit-clusters are adjacent or ambiguous.
- **Satisfaction — the weakest component to name, though it's a hidden-information problem, not a Battleship-specific one.** A `sunk:<ship>` result is a real, earned moment, but the *placement* phase (the game's other half, per the task's specific ask) has no feedback loop at all in the pure logic — `validateFleet`/`randomFleet` are correctness-only. Whether placement *feels* like a meaningful decision (edge-hugging vs. spreading, corner clustering) versus a rote checklist is a presentation-layer question this file can't answer alone.
  - **Single highest-value change:** none proposed at the logic layer — this is a UI-layer question (does placement show anything more than "valid/invalid," e.g. a density heatmap of common opponent clustering) that needs the board component, not the logic.
- **Fit** — good. Commit-reveal cryptography under the hood is invisible to the player, which is correct Fit for a game whose whole identity is "the tension of not knowing" — surfacing the crypto mechanism to players would undermine, not enhance, the fantasy.

### Does hiding actually create tension, or just waiting?

Real tension, not just waiting — because the guessing side has continuous, compounding information (every shot narrows the search space and a `hit` immediately opens a real tactical sub-problem: which direction does the ship run). This is qualitatively different from the rest of this set (all perfect-information), and it's the strongest argument for Battleship's place on this platform: it's mechanically distinct, not a reskin of a placement-then-race pattern already covered elsewhere.

### Is there a dominant strategy?

Partially, on the guessing side: parity/checkerboard hunting (shooting only cells where `(row+col) % 2 === 0` until a hit, then targeting adjacent cells) is a well-known, provably-efficient Battleship strategy, and the bot (`pickShot`) already implements exactly this (70% parity weighting + line-extension targeting). A human who knows this strategy has a real, quantifiable edge over one who hunts randomly — but it doesn't collapse the game to a forced outcome, because placement remains a genuine hidden choice the hunting side must still work around. This is closer to "there's a correct meta" (like Connect Four's center-column bias) than "the game is solved."

### Would you play it twice?

Yes. It's the one game here that isn't perfect-information chess-in-disguise — the fog itself is the mechanic, and the implementation protects that fog honestly (no server, no way for either client to peek, verified only at reveal).

---

## Reversi (Othello)

**Player goal:** end with more discs than your opponent by flanking and flipping their discs in straight lines.

**System rules:** `flippedBy` correctly requires the bracket to close on the mover's own color with at least one opponent disc in between (an empty cell or a same-color, zero-length bracket never flips) — this is the one subtlety that's easy to get wrong in Othello logic and it's right here. **One-line bug reference (already logged, not re-litigated):** the no-pass freeze (`games-review-strategy-s1/report.md` finding 3) matters to this review because it directly determines the honest answer to "would you play it twice" below.

### 5-Component evaluation

- **Clarity** — good; flip animation potential aside (not in this file's scope), the legal-move set (`legalMoves`) is well-defined and the win condition (more discs when neither side can move, or the board fills) is standard and correct.
- **Motivation — the component actually worth naming, independent of the freeze bug.** Othello has a real, well-known "feels bad" moment for new players: having *more* discs mid-game is not correlated with winning (a classic Othello lesson — corner control and mobility matter far more than disc count), and nothing in the pure logic surfaces disc-count-doesn't-matter to a player who hasn't been taught that. This isn't a bug, it's an unaddressed teaching gap that affects whether a new player's *early* motivation (visibly "winning" the disc count, then losing) tracks the *actual* skill signal.
  - **Single highest-value change:** none at the logic layer (this is presentation — e.g. surfacing mobility count or corner-control alongside disc count would help new players build the right mental model), but it's worth naming since it's the actual reason casual players bounce off good Othello more than the rules themselves.
- **Response / Fit** — fine, nothing notable beyond the freeze bug (which is a Response-layer failure by definition: a player literally cannot act) already logged elsewhere.
- **Satisfaction** — good; corner captures and large endgame flips are real, earned, visually distinct moments once the animation renders them (assumed from `flippedBy`'s multi-cell return, not confirmed from the board component).

### Dominant strategy?

No forced win is known for 8×8 Othello (unlike TTT/Connect Four/Hex, Othello at standard size has never been solved, weakly or strongly, as of this writing) — this is a real, durable, replayable game at the ruleset level. The actual skill ceiling (mobility control, parity, corner-adjacent "X-square" avoidance) is deep and well-studied outside this codebase.

### Would you play it twice?

Honestly: **only if the freeze bug is fixed first.** The design underneath is excellent — arguably tied with Blockade for the deepest game in this set — but "would you play it twice" has to account for "will it let you finish the first game," and per the logged finding, a real (if not universally triggered) board state exists where it can't. Once that's fixed, yes, unreservedly.

---

## SOS

**Player goal:** place S or O letters (your choice each turn) into a 7×7 grid; every time you complete an S-O-S line (any of 4 directions) you score it and go again; when the board fills, most completed lines wins.

**System rules:** `findNewSosLines` correctly checks all three positions the just-placed letter could occupy within a triple (start/middle/end), across 4 canonical directions, bounds-checked to prevent wraparound — this is the right approach for an append-only, no-double-count line detector. `applySosMove`'s extra-turn-on-completion is correctly implemented and (per the prior review) tested.

### 5-Component evaluation

- **Clarity** — good. Because a player picks the *letter* as well as the cell each turn, and both S and O are visible on the board (not hidden), the "why did that just score" question always has a directly visible, checkable answer (three specific cells, one direction) — better positioned than Dots and Boxes here, whose scoring trigger is a board-wide edge count, not a local 3-cell pattern.
- **Motivation** — good; every move is a dual decision (which cell, which letter), and the extra-turn mechanic means a strong move visibly compounds (you get to keep threatening).
- **Response** — good; no ambiguity in what a placement does once made.
- **Satisfaction — the weakest component, worth one concrete flag.** The win condition is "most sequences when the board fills" — a fully deterministic endgame with no way to end early even once the outcome is no longer in doubt (unlike Dots and Boxes, which has a `clinch` majority-threshold that can end the game before every box is claimed). A player who is mathematically eliminated with 10+ empty cells still has to keep placing letters to the end. This is a **Satisfaction** gap (the ending doesn't arrive when the outcome is settled), not a Clarity or Motivation one.
  - **Single highest-value change:** add an early-clinch check analogous to Dots and Boxes's — once one side's committed-sequence lead exceeds the maximum number of sequences still possible in the remaining empty cells, end the round immediately. This is a well-defined, computable condition (remaining cells bound the max additional lines either side can complete), not a vague heuristic.
- **Fit** — good; the S-O-S spelling identity is distinct from every other line-forming game in this set (Gomoku/Order-and-Chaos/Connect Four are all "N-in-a-row of one symbol"; SOS is "a specific 3-letter word," which changes what a "threat" looks like — you're hunting a pattern, not extending a run).

### Dominant strategy?

No single dominant opening is evident from the logic (7×7 general SOS is not a well-documented solved game the way TTT/Connect Four are), and the letter-choice dimension (do I place the letter that helps *me* complete a line, or the one that denies my opponent one) adds a real bluff-adjacent tactical layer beyond plain positional play. This is a genuine "no" on dominant strategy, unlike most of the perfect-information games in this set.

```
ASSUMPTION: general-rules SOS (fill-the-whole-board, most-sequences-wins,
  as implemented here) has no known forced-win/forced-draw result for a
  7×7 board the way TTT (3×3) and Connect Four (7×6) do.
IMPACT: if true, SOS's replay value rests on genuinely unresolved skill
  depth, which is a real strength relative to the rest of this set.
IF WRONG: (i.e., if 7×7 general SOS is a known forced result under optimal
  play) SOS should be re-ranked down toward the Gomoku/Hex tier.
VALIDATE: this is a much larger state space than 4×4 TTT (49 cells, 2 letter
  choices per empty cell) — not brute-force-tractable by hand the way the
  4×4 TTT assumption in the s1 report was; would need a literature check
  on "general SOS" (vs. the simple/first-to-one-SOS variant, which is
  better documented) rather than computation.
```

### Would you play it twice?

Yes. The dual (cell + letter) decision per turn, genuine bluff/denial tactics, and extra-turn compounding give it more going on than its simple presentation suggests. The only real ask is trimming the dead endgame once the outcome is locked.

---

## Blockade, Battleship, and SOS are the three "no fixable design gap, just polish" games above. The rest have one real structural issue each.

---

## Mancala (Kalah) — uncommitted, fullest treatment

**Player goal:** sow seeds counterclockwise from your own pits (skipping the opponent's store), capturing the opponent's seeds when your last seed lands in an empty pit of yours opposite a non-empty one, and finishing with more seeds in your store than the opponent once one side's pits empty out.

**System rules, traced by hand against real Kalah(6,4) rules (not re-verifying the already-logged `normalizePits` bug or the red test suite — noted once, moving on):** the sowing loop correctly skips the opponent's store (`if (cursor === oppStore(symbol)) cursor = (cursor + 1) % PIT_COUNT`); the extra-turn rule (last seed in your own store) and the capture rule (last seed lands in your own **previously-empty** pit, `next[cursor] === 1` after adding one, with the opposite pit non-empty) both match standard Kalah exactly, including the "empty opposite pit → no capture" edge case that's easy to get backwards. The end-sweep (whichever side empties out first, the *other* side sweeps all their remaining seeds into their own store) is also correct and runs after every move, not just at a dedicated "is the game over" check — good, since it means the round can't get stuck mid-sweep.

### 5-Component evaluation

- **Clarity — the weakest component.** Two rules that materially change a move's value are entirely invisible on the board unless a player already knows Kalah: (1) which pits, if played, land the last seed in your own store (extra turn) — this requires counting seed-count vs. distance-to-store in your head; (2) which of your pits are captures-in-waiting (empty, with a non-empty opposite pit) — a skilled Kalah player scans for these actively, a new player has no way to see them. Neither is exposed anywhere in the pure logic (which is correct — that's a presentation concern), but nothing here suggests the board highlights either. This is the single most consequential Clarity gap of anything in this set, because unlike Chain Reaction's "corner=2/edge=3" (a static, learnable-once fact), Mancala's extra-turn/capture windows *change every move* — a new player is re-solving a small arithmetic puzzle each turn with no help, while an experienced player has just automated it.
  - **Single highest-value change:** on hover/selection of a legal pit, show a preview of where the last seed will land (this is pure arithmetic from `pits[pit]` and `pit`, already computable client-side without touching the pure logic) and flag it if that lands in your store (extra turn) or in a now-empty own pit with a capturable opposite. This is the exact "telegraph before commitment" fix the debugging protocol calls for — Clarity, not a numbers change.
- **Motivation** — good; the store is a persistent, visible, monotonically-growing scoreboard for the whole round, so "am I ahead" is never ambiguous mid-game the way Reversi's disc-count-doesn't-equal-winning problem is.
- **Response** — good; `legalPits` cleanly gates which pits are playable (own side, non-empty).
- **Satisfaction** — a large multi-seed capture or a chain of extra turns are real, discrete, well-defined events (`captured`, `extraTurn` are both returned distinctly from `applyMancalaMove`) — good raw material for feedback, assuming the board renders them distinctly (unconfirmed, out of scope file).
- **Fit** — good; sowing/capture/extra-turn is exactly what Kalah is, faithfully ported.

### Is Mancala solved?

```
ASSUMPTION: Kalah(6,4) — 6 pits of 4 seeds per side, this exact ruleset —
  is the specific variant computationally solved (Geoffrey Irving et al.,
  2000, widely reported result: second player wins by 4 with optimal play).
IMPACT: if this specific ruleset is the solved one, Mancala shares the
  "theoretically decided" property with Hex/Gomoku/Connect Four, just with
  a far deeper practical skill floor (the solve requires exhaustive search,
  not a memorizable human strategy the way TTT's or even Connect Four's
  opening theory is).
IF WRONG: the solved-game framing above doesn't apply and Mancala's
  replay value has even less of a theoretical ceiling than stated.
VALIDATE: this is a citation check (confirm the Irving/Donkers/Uiterwijk-era
  Kalah(6,4) solve and its declared result), not something re-derivable
  from reading this codebase — flagging as posture-A-if-confirmed rather
  than asserting it outright here, since I have not verified the citation
  in this pass.
```

Practically, this doesn't matter for replay value the way TTT's solve does: no human plays Kalah(6,4) from a memorized forced-win line the way TTT players do "always take the center." The *practical* skill ceiling — timing extra turns, setting up captures, denying the opponent's captures — is real and unteachable-by-rote, which is the actual answer to "does skill change the outcome": yes, meaningfully, for any pair of players who haven't both independently reproduced a 2000-era exhaustive computer search.

### Dominant strategy?

No practical one. The theoretical solve (if the assumption above holds) is inaccessible to human play; the meaningful, learnable skill (extra-turn chaining, capture setup/denial) is real and not reducible to a fixed opening sequence.

### Would you play it twice?

Yes — of everything in this set, Mancala is the clearest case of "old, well-understood game where the only real question is whether this implementation preserves what makes it good," and the sowing/capture/extra-turn core traces out correctly by hand. The Clarity gap above (no preview of where your last seed lands) is worth fixing before ship, since it's the single biggest lever on whether new players ever build the "oh, I get why that was a good move" moment that makes people come back — but it doesn't require touching the pure logic, only the board component, so it's low-risk to add.

---

## Dots and Boxes — 6×6 and 4×4

**Player goal:** draw one edge per turn; completing a box's 4th edge claims it and grants an extra turn; most boxes when the board fills wins (majority-clinch: 19/36 large, 9/16 classic ends the round early once mathematically decided).

**System rules:** `applyEdgeMove` correctly checks all boxes adjacent to the drawn edge (1 or 2, via `boxesOfEdge`) for completion in one pass, and the "no re-flip" turn logic (extra turn on ≥1 completed box) matches the standard rule. `dbConfig`'s parametrized geometry (used for both 6×6 and 4×4) is clean — one function serving two board sizes correctly is good architecture, not just correct rules.

### 5-Component evaluation

- **Clarity — the weakest component, and the one the task specifically asked about.** Dots and Boxes's whole strategic depth (the "double-cross" strategy: deliberately declining a free box, or sacrificing a small chain to force your opponent to open a much longer one) depends entirely on a player perceiving the board as a graph of **chains** — connected runs of boxes sharing undrawn edges — not as 36/16 independent boxes. Nothing in `dotsAndBoxesLogic.js` computes or exposes chain structure at all; it only tracks flat edge/box arrays and a box-completion check. That's correct and sufficient for *legality*, but it means any chain-awareness in the UI (if present) would have to be reconstructed by the board component from scratch, and I have no evidence from this file set that it is. Read literally: the logic layer treats "draw an edge" identically whether it's a meaningless opening move or the exact move that hands your opponent a 14-box chain — the two feel the same until the disaster resolves several moves later.
  - **Single highest-value change:** compute connected-component chain length as a derived, presentational value (walk the graph of boxes-with-3-drawn-edges connected via their shared undrawn edge) and surface it — even just "this move opens a chain of length N" as a warning before commit — so a new player can *see* the concept the expert already reasons about, rather than discovering it only via repeated losses. This is squarely a Clarity fix per the debugging protocol (structural information that exists in the position but isn't shown), not a rules change.
- **Motivation** — good; the extra-turn mechanic keeps a strong player's turn "alive" and visibly compounding, and the majority-clinch (ending the round the moment the outcome is mathematically settled, `Math.floor(boxCount/2)+1`) is a genuinely good Satisfaction-adjacent design choice already in place — it avoids the exact "keep playing a dead game to the end" problem flagged above for SOS.
- **Response / Fit** — fine, no notable gap; edge-drawing as the atomic action matches the genre.

### Is any of the chain structure legible to a new player, or does it look like random line-drawing until suddenly someone wins?

Based on the logic alone: **no, it is not legible**, because the chain concept simply isn't represented anywhere in the data the board would render from. This is the most direct answer to the framing question in the task brief, and it's a real, fixable gap, not a fundamental flaw in the game (Dots and Boxes *itself* is one of the best-regarded "looks trivial, is actually deep" abstract games that exists — the gap is this implementation not teaching the concept, not the concept being bad).

### Dominant strategy?

No forced result — Dots and Boxes end-game theory (Berlekamp et al.) is famously deep specifically *because* there's no simple dominant line; the chain-parity rule ("control who opens the last long chain") is a genuine, learnable, high-ceiling skill, exactly the kind of thing the task asked to check for. It exists in this implementation's rules faithfully; it just isn't shown.

### Does skill actually change the outcome?

Yes, dramatically, once a player learns the chain/double-cross concept — this is one of the largest expert-vs-novice skill gaps of any game in this set, on par with (or larger than) Blockade's. The risk is entirely on the "does a new player ever get the chance to learn it" side, which is the Clarity finding above.

### 6×6 vs 4×4 — same game, or different?

Meaningfully different in practice, even though the rules are identical: chain-strategy depth scales with board size, because the double-cross tactic needs the long chains that a bigger board makes room for. On 4×4 (16 boxes) there simply isn't as much space for the multi-box chains that make the 6×6 endgame rich — it's a real game, just a shallower one, closer to "the on-ramp" than "the deep version," similar in spirit (though not in cause) to how Chain Reaction's classic-vs-default sizing was assessed in the prior report. Keep both, but market 4×4 as the quick/casual tier and 6×6 as where the actual game lives — which the existing `tags: ['quick', 'thinky']` vs `['thinky']` split in `games.js` already does correctly.

### Would you play it twice?

Yes, for 6×6, on the strength of the underlying game — but only once the chain-visibility gap is addressed does that "yes" extend past the first couple of sessions for a genuinely new player. 4×4: a soft yes as a shorter warm-up, not as the main event.

---

## Order and Chaos

**Player goal:** two asymmetric win conditions on a shared 6×6 board where **both players place either letter (X or O) on their turn** — Order (seat X) wins by forming any 5-in-a-row of a single letter (either X's or O's), Chaos (seat O) wins if the board fills with no such run.

**System rules:** `findRun` is a clean, self-contained 4-direction scan (correctly not importing Gomoku's, per its own comment, avoiding an accidental coupling) and correctly checks for a run of the **same letter**, regardless of which player placed which piece — this is the subtle part of Order and Chaos's rules (the run can be made of *either* letter, and can even be built cooperatively across both players' moves) and it's implemented right. `OrderChaosBoard.jsx` (confirmed by reading it) surfaces the letter-picker clearly (both seats get an X/O toggle each turn) and labels the asymmetric roles plainly ("X = ORDER" / "CHAOS = O").

### 5-Component evaluation

- **Clarity** — good, better than I expected going in: the persistent "armed letter" badge and the always-visible role labels mean a new player doesn't have to infer the asymmetric win conditions from an in-game moment — they're stated on-screen every turn.
- **Motivation** — good for Order (build toward a visible run); more interesting for Chaos, whose task is negative (prevent, not build) — this is a real and correctly-implemented asymmetric-goal design, exactly the kind of thing the task asked to evaluate, and it reads as intentional rather than confused.
- **Response / Satisfaction / Fit** — no issues found; a completed run is an unambiguous, visually-highlightable event (`winningLine`), and letter choice each turn keeps every move meaningfully dual (cell + letter, same shape as SOS's decision structure).

### Is either side favoured, and does the weaker role still feel worth playing?

```
ASSUMPTION: this specific ruleset (5-in-a-row of either letter on a 6×6
  board, both players may place either letter, first player is Order) is
  the same one publicly analyzed since the game's original description
  (Stephen Sniderman, credited as the inventor) — under which Order is
  reported to hold a real, non-trivial advantage on 6×6, with larger
  boards (8×8 or bigger) commonly suggested to rebalance it.
IMPACT: if Order is meaningfully favored here with no compensating
  mechanic (no swap rule, no board-size adjustment, no move-count
  handicap for Chaos), the "weaker role" question in the task brief has
  a real answer: Chaos is likely the disadvantaged seat, and repeated
  play will skew win rates toward whoever seats as Order — which,
  because seating here is presumably fixed by join-order (matching the
  X/O convention documented in AGENTS.md — creator is always X), means
  the room CREATOR structurally has the better seat every time, which is
  a worse problem than a coin-flip-assigned advantage would be.
IF WRONG: (i.e., if this codebase's exact ruleset is closer to balanced,
  or Chaos's negative-goal appeal outweighs a modest numeric disadvantage
  for casual players) no action is needed.
VALIDATE (posture B, starting value + test): run N matched-skill games
  with seats swapped every other game and track Order-seat vs. Chaos-seat
  win rate; if Order wins meaningfully more than 50% of the time across a
  reasonable sample, that confirms the imbalance and the fix is either a
  seat-swap-by-default on rematch (already partially supported by the
  platform's `proposal: {action: 'playAgain'...}` rematch handshake, per
  AGENTS.md) or a board-size increase.
```

### Dominant strategy?

Not fully solved from reading alone (6×6 with two placeable letters per cell and asymmetric goals is a larger and structurally different search space than the symmetric N-in-a-row games in this set), but the credible real-world prior above suggests Order has a persistent, non-forced-but-real edge rather than the game being a coin flip.

### Would you play it twice?

Yes, tentatively — it's the most conceptually interesting ruleset in this set (asymmetric win conditions sharing one board and one piece-set is a genuinely uncommon design, and this implementation surfaces it clearly). The caveat is the same one the task explicitly asked to check: if Order's advantage is as real as the outside prior suggests, and if seating is join-order-fixed rather than swapped on rematch, a chunk of "would you play it a second time" answers turn on "did I get to be Order last time."

---

## Hex

**Player goal:** connect your two assigned opposite board edges (X: left-right, O: top-bottom) with a chain of your stones on an 11×11 hex grid before your opponent connects theirs.

**System rules:** `getHexWinner`'s BFS-based connectivity check (not a line scan) is the correct way to detect a Hex win and is the best-implemented win-detector in this whole review pass — genuinely nothing to fix here. **One-line bug reference (already logged, not repeated):** no swap/pie rule exists anywhere in this codebase for Hex.

### 5-Component evaluation

- **Clarity** — good; the hex adjacency (`neighbors`, correctly excluding the two non-adjacent diagonal directions of a square grid and including the two hex-specific diagonals) is geometrically correct, and there's no draw branch because Hex mathematically cannot draw — a fact the implementation correctly relies on rather than defensively coding around.
- **Motivation / Response / Satisfaction / Fit** — no issues found at the logic layer; connectivity-based win conditions are inherently well-suited to a visual, readable endgame (a connected path either exists or doesn't, and `winningLine` gives the exact cells for highlighting).

### Is Hex solved, and does the implementation do anything about it?

Yes and no, respectively — and this is worth being precise about, because it's different from Gomoku's version of the same problem. Hex is **proven** to be a first-player win at every board size (a strategy-stealing argument, not board-size-specific), but it is **not solved in the constructive sense** for an 11×11 board — no known algorithm or memorizable human strategy tells X how to win from move one at this size (the largest board sizes actually solved computationally are smaller than 11×11). So the "first-player win exists" fact is true but practically inert for human play: nobody, including a very strong player, can currently execute a guaranteed win from turn one on this size board. This implementation does nothing about the *theoretical* fact (no swap rule), which is the standard, low-cost remedy precisely because it neutralizes a first-move advantage regardless of whether the winning strategy is known — you don't need to know the forced win to fix the fairness problem, you just let the second player optionally swap into the strong opening.

### Dominant strategy?

No practical one at 11×11. This is a real, deep, actively-played-by-humans game at this board size (Hex has genuine competitive/correspondence play at 11×11 and larger, unlike solved small games) — it belongs in the "keep, genuinely good" tier on pure design merit, with the swap-rule gap as the one correctable fairness issue.

### Does skill change the outcome?

Yes, substantially — connection-game strategy (bridges, ladders, blocking) is deep and well-studied, and this implementation's correct BFS win-check means every one of those tactics resolves exactly as it should.

### Would you play it twice?

Yes — of the two "missing swap rule" games in this set, Hex is the one where I'd play again with real confidence, because the missing swap rule is a fairness *polish* item on a genuinely good, currently-unsolved-at-this-size game, not a mask over a shallow one.

---

## Gomoku

**Player goal:** first to five in a row (orthogonal/diagonal) on a 15×15 board; overlines (6+) still count as a win here (a deliberate, tested freestyle-rules choice, not a bug).

**System rules:** `getGomokuWinner`'s scan is correct and directly reused as the template for Order and Chaos's `findRun` (the comment even says so) — clean, simple, right. **One-line bug reference (already logged, not repeated):** no swap2/opening restriction exists.

### 5-Component evaluation

- **Clarity / Response / Satisfaction / Fit** — all fine; nothing distinguishes Gomoku's execution quality from any other correctly-implemented N-in-a-row scanner in this set.
- **Motivation — the weakest component, and the one actually worth naming plainly.** Unlike Hex, freestyle Gomoku's first-player advantage is **not** merely theoretical — it is well-documented and has been shown to be executable by strong (not perfect, not superhuman) human players on an unrestricted 15×15 board with no opening rule. That's precisely why competitive Gomoku uses swap2 or similar restricted-opening rulesets almost universally at any serious level of play. This platform ships the *one* ruleset (freestyle, no restriction) that the wider Gomoku community treats as the least fair version of the game.
  - **Single highest-value change:** add a minimal opening restriction — even a simple one (e.g., black's first move must be the center cell, and black's second move must be a fixed minimum distance from the first) captures most of the fairness benefit of full swap2 with far less implementation complexity than a true swap/placement-then-choice protocol.

### Is Gomoku solved, and does the implementation do anything about it?

Freestyle Gomoku (no opening restriction, exactly this ruleset) has been proven to be a first-player win via computer-assisted proof, and — critically, unlike Hex at 11×11 — the winning strategy is **well-documented and human-executable** by strong players, which is exactly why the competitive world abandoned freestyle rules for swap2 decades ago. This implementation does nothing about it. Combined with the fact that the underlying game (once the opening-move imbalance is set aside) is also mechanically the shallowest pattern-recognition task in this set — extend or block a line, no secondary decision axis the way SOS's letter-choice or Order and Chaos's asymmetric-goal or Blockade's wall-resource-management add — Gomoku is the weakest entry here on both counts at once.

### Dominant strategy?

Yes, for a sufficiently strong player as black, in a way that's actually reachable (unlike Hex). This is the most concrete "yes, dominant strategy exists and is executable" answer in this entire review.

### Would you play it twice?

Only casually, against an opponent of unknown or lesser skill — same caveat as base Connect Four in the prior report (the solve isn't universally *known* by casual players, so it survives a few sessions before either player looks it up or gets good enough to feel the imbalance). Against a serious opponent, no: the well-documented, human-reachable first-player strategy makes repeat play against an equally-informed opponent close to a coin flip decided at seat assignment, which is a worse position than Hex's "proven but practically inaccessible" gap.

---

## Numbers proposed in this report (index, with posture)

| Value/claim | Posture | Where |
|---|---|---|
| Order-seat win rate vs. Chaos-seat win rate on 6×6, matched skill | **B** — starting hypothesis (Order favored, per outside prior on this exact ruleset); test = N matched-skill games with seats swapped every other game, track win rate by seat; direction on failure = if win rates are statistically flat, the balance concern in this report is wrong and no seat-swap/board-size fix is needed | Order and Chaos |
| Kalah(6,4) is a known solved/weakly-solved second-player win under optimal play | Stated as an **unconfirmed assumption**, not asserted as fact — I have not verified the specific citation (Irving et al., c. 2000) in this pass; flagging it as "if confirmed, posture A; until then, treat as unconfirmed" | Mancala |
| General (fill-the-board) SOS has no known forced result on 7×7 | **B** — labelled assumption; validate step = literature check (state space too large for a quick brute-force the way 4×4 TTT was in the prior report) | SOS |
| BlockadeBoard.jsx visually distinguishes jump types and gives wall-rejection feedback | Labelled **assumption**, not a numeric claim — included per the assumption-labelling format since it materially affects the Clarity verdict | Blockade |

No source-backed (posture A) numbers are asserted outright in this report. Hex's proven-first-player-win and Gomoku's proven-and-human-executable-first-player-win are both well-established, independently reproducible combinatorial-game-theory / competitive-play results that the task brief itself states as given (matching the framing used for TTT/Connect Four in the prior report), not new numbers this report is originating.

## What could not be assessed by reading

- **Actual board-component rendering** for every game in this set (chain-visibility in Dots and Boxes, jump-type distinction in Blockade, extra-turn/capture preview in Mancala, placement-phase feel in Battleship) — all of the "single highest-value change" recommendations above are Clarity fixes that live in the presentation layer, which this review (logic-files-only, no browser) could not directly inspect for most games. Where I did read the board file (Order and Chaos), I noted it explicitly and the evaluation changed as a result (Clarity turned out better than assumed) — this is a caution against assuming the same gaps exist in the other boards without checking.
- **Real win-rate/skill-gradient data** for any game in this set — every skill-depth and balance claim is argued from the logic/UI structure and, where applicable, well-established outside literature (Kalah, Hex, Gomoku, Order and Chaos), not from observed match outcomes on this platform. Converted into explicit posture-B/labelled-assumption items above rather than presented as settled.
- **Whether Reversi's freeze bug is rare or common in practice** — the design evaluation above treats it as a real risk to "would you play it twice" but the actual frequency (how often does a legal-moves-for-one-side-only board state actually arise in casual play) needs live-play data this review couldn't gather.
- **Bot quality for Blockade, SOS, Order and Chaos** beyond what's directly readable in the logic files — `computeBotMove` for Blockade was read in full and assessed as a reasonable greedy heuristic; SOS's and Order and Chaos's bots live in `demoBots.js`, which is outside this review's assigned file set (already flagged as a coverage gap in the correctness review), so their solo-play quality is unassessed here.
