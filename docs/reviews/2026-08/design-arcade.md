# Design review — Real-time arcade: Pong, Snake, Tron, Sumo, Space Duel, PAC MAC, Paint Turf, Mine Race

Scope: pure logic files only (`pongLogic.js`, `snakeLogic.js`, `tronLogic.js`, `sumoLogic.js`, `spaceduelLogic.js`, `pacmacLogic.js`, `paintLogic.js`, `minesweeperLogic.js`). Read-only — no code changed, no build/dev-server/browser used. Correctness findings already logged in `games-review-arcade-s1/report.md` are referenced at most once each, only where they bear directly on a design verdict, then dropped.

## Ranked list — best to worst, as games

1. **Mine Race** — the purest skill test in the set (logical deduction + speed), and the only game genuinely immune to network latency, because moves are computed locally and only aggregate counts are synced. **Keep.**
2. **Tron** — deepest spatial-strategy ceiling of the tick-based games (pure territorial denial, zero RNG). Held back only by a fixable Response gap (no guest-side prediction). **Keep, rework Response.**
3. **Paint Turf** — genuine contact-based area-control duel (enemy-paint slow zone creates real friction), and the one arena game that already solved guest-side prediction correctly. **Keep.**
4. **Pong** — real skill ceiling via spin/angle control and escalating ball speed; guest paddle prediction already solved. Minor Clarity gap on pickup identification. **Keep.**
5. **PAC MAC** — legitimate risk/reward loop (chained ghost-kill combos), capped by identical ghost AI removing the learnable-threat layer the genre depends on. **Keep, rework ghost AI.**
6. **Space Duel** — sound Asteroids-style aim/lead/dodge fundamentals, but a Response-layer flaw (guest fire round-trips before registering, against a 0.35s cooldown) turns the guest seat's experience into a connection-quality test. **Rework Response before calling this a finished skill game.**
7. **Snake** — same missing-guest-prediction gap as Tron, but punished harder because the grid is tick-discrete and instantly fatal; underlying loop (grow vs. collision-avoid) also has a shallower ceiling than Tron's pure denial game. **Rework Response.**
8. **Sumo** — narrowest decision space: auto-lock removes literal aiming, so skill reduces to position + tap-rhythm. Defensible as an intentional design choice, but shallow across repeat sessions. **Keep (narrow), consider adding one aiming axis.**

No cut candidates in this set — every game has a real, salvageable core. The three that most need investment (Tron, Snake, Space Duel) all need the *same* fix: give the guest seat local prediction of its own actor, the pattern Pong and Sumo already use correctly.

---

## Pong

**Player goal:** score 5 points before the opponent by getting the ball past their paddle.

**System rules:** normalized 1×1 court; paddle reflection angle is set by hit offset, paddle motion and edge-offset impart spin that curves the ball in flight (`SPIN_TRANSFER`, `OFFSET_SPIN`), speed ramps each hit (`BALL_SPEEDUP`, capped at `BALL_MAX_SPEED`), and three power-ups (grow/shrink/slow) spawn mid-rally.

### 5-Component evaluation

- **Clarity — weakest component.** Pickups are differentiated only by background tint (`PICKUP_KINDS = ['grow','shrink','slow']`, no shape/icon field in state) — a player can't identify what they're about to grab, even setting the colorblind-accessibility angle (already logged) aside. A new player learns pickup identity only by trial, which undercuts the risk/reward decision the pickup is supposed to create ("do I detour to grab this?").
  - **Single highest-value change:** bake a distinct glyph/shape per pickup kind into the render data, not just color. Per the debugging protocol: "I didn't know that would happen" → Clarity → add a UI indicator, not a numbers change.
- **Motivation** — fine; first-to-5 with escalating speed keeps stakes rising within a round.
- **Response — strong, with one open risk.** The host simulates its own input immediately; the guest predicts its own paddle locally (already solved, per the correctness review). The one thing this pure-logic reading can't rule out: dead-reckoning a **spin-curved** ball (`vy += spin * dt` every tick) from a 30Hz snapshot's velocity is a straight-line extrapolation that will not track a curving ball — the guest's rendered ball position could visibly snap back into alignment right as the trajectory matters most (near paddle contact). This is a plausible Response gap, not a confirmed one — see Playtest Scenarios.
- **Satisfaction** — good; hit sound/spin/speed escalation stack into a real "rally is heating up" feeling by design.
- **Fit** — good; the power-up chaos matches an arcade-Pong identity without breaking the core paddle-and-ball read.

### Dominant strategy?

No. Multiple axes (spin control via paddle velocity, edge-offset placement, power-up denial/timing, speed management) prevent a single forced line. This is a genuine skill ladder.

### Does skill beat reflex-latency?

Mostly yes. Because both paddles are locally predicted, the input side of Response is not latency-bound — the skill test (reading angles, applying spin, managing power-ups) is real. The one latency-adjacent risk is the spin/dead-reckoning interaction above, which would show up as visual mispredicton near contact, not as an actual outcome-deciding lag (the host's own sim is authoritative and correct — only the guest's *rendering* of the ball could be briefly wrong).

### Would you play it twice?

Yes. It's the one game in the set that most resembles a finished competitive arcade Pong: real spin mechanics, real power-up decisions, and the hard Response problem (paddle lag) already solved for both seats.

---

## Snake (Snake Battle)

**Player goal:** be the last snake alive on a 21×21 toroidal grid; grow by eating food.

**System rules:** tick-based (`TICK_MS = 120`, ~8 ticks/sec), simultaneous movement, walls wrap, death on self/opponent-body collision or head-on. Best-of-3 rounds win the match.

### 5-Component evaluation

- **Response — weakest component, and the one that most matters.** The guest renders purely off host snapshots with no local prediction of its own snake (already logged as a correctness gap). On a game whose only "clock" is one 120ms tick, a real-world RTT (even 60–100ms, common on non-ideal connections) can eat close to a full tick before the guest's own move is reflected — on a fatal, discrete grid, that is not a minor rendering nit, it is a structural disadvantage for whichever seat is guest.
  - **Single highest-value change:** add local prediction of the guest's own snake between snapshots, mirroring Pong's/Sumo's already-solved pattern.
- **Motivation** — thin but present: growing lengthens the body, which raises self-collision risk, so there's a real "grow vs. stay nimble" tension. No combo/streak layer beyond that.
- **Clarity** — toroidal wrap could confuse a first-time player (exiting right and reappearing left with no signposting beyond the board edge itself); could not confirm from logic alone whether the board UI telegraphs this (see Could Not Assess).
- **Satisfaction / Fit** — unremarkable, no issues found from logic alone.

### Dominant strategy?

No fixed opening dominates *under equal latency* — area denial (forcing the opponent into a wrap-around collision or a self-trap) is a real, learnable skill. But it is conditional: see below.

### Does skill beat reflex-latency?

Not reliably, as shipped. Because the guest has zero local prediction on a 120ms discrete grid, a better player in the guest seat can lose to a worse player in the host seat purely on connection quality. This is the clearest "connection-quality test wearing a skill game's clothes" case for the guest side in the whole set.

### Would you play it twice?

Honestly: not with confidence, as currently built — the area-control skill layer is real, but the guest-side latency gap means you can't tell whether a loss was a bad read or a bad connection, and that ambiguity is corrosive to wanting a rematch. Fix Response first; the underlying game is worth it after that.

---

## Tron

**Player goal:** be the last light-cycle alive; trails are permanent and never vacate, on a 31×31 toroidal arena.

**System rules:** simultaneous tick movement (`TICK_MS = 100`), no RNG anywhere (contrast Snake's food/Sumo's nothing/PAC MAC's ghost rand) — pure deterministic space-denial. Single round decides the match.

### 5-Component evaluation

- **Response — weakest component, same class of gap as Snake.** No local prediction of the guest's own cycle (already logged). The punishment profile is different from Snake's, though: Tron has no food-driven urgency, so a cautious player has more room to "play it safe" against felt lag by avoiding close calls — the gap is real but slightly more survivable than Snake's.
  - **Single highest-value change:** identical fix — local prediction of the guest's own cycle between snapshots.
- **Clarity** — one already-logged issue (both cycles render the same head color when alive) bears directly here: the single most important cell on the board — your own head, the thing you're steering — is not visually distinguished from the opponent's head except by trail color, which is a bigger Clarity cost in a game whose entire skill expression is spatial reading.
- **Motivation** — strong for what it is: no RNG, no food, the only lever is territory, so every early move commits board space and every late move is a genuine life-or-death read.
- **Satisfaction / Fit** — good; permanent trails make the endgame a readable maze the players built themselves.

### Dominant strategy?

None found. This is the deepest tick-based skill game of the set: walling off the opponent into a shrinking pocket, timing turns to deny the largest remaining area, and reading the endgame trail-maze are all real, learnable skills with no shortcut. This is structurally the same kind of "chaotic but learnable" result the prior review gave Chain Reaction — comparable tier.

### Does skill beat reflex-latency?

In principle yes — more than Snake, because there's no food-timing pressure forcing risky moves, so a skilled player has more slack to play around felt lag. In practice, still capped by the same missing-guest-prediction gap.

### Would you play it twice?

Yes, and it's the strongest "worth saving" case in this set — fix Response and Tron is arguably the best real-time duel here, on par with the prior review's Chain Reaction verdict.

---

## Sumo Arena

**Player goal:** be the last blob still inside the shrinking circular platform.

**System rules:** a tap applies a fixed impulse (`PUSH_IMPULSE = 0.42`) directed straight at the opponent's current position — there is no independent aim vector. Platform radius shrinks after `SHRINK_START = 8s` at `SHRINK_RATE = 0.04`/s down to `MIN_RADIUS = 0.16`, forcing engagement over time. Blob-vs-blob collision uses proper restitution physics (`RESTITUTION = 0.85`).

### 5-Component evaluation

- **Motivation / depth — weakest component, the one the task specifically asks about.** Auto-locking the push vector to "toward opponent" removes literal aiming, but it does **not** remove all strategy: because the impulse direction is a function of *where you are standing relative to the opponent and the center*, positioning is an implicit aiming mechanic — a player who maneuvers to a shallow angle relative to the platform edge, then pushes, sends the opponent tangentially toward the boundary; a player who pushes head-on from the center trades momentum less efficiently. That's real, if narrow, depth. What's genuinely missing is a **second independent axis** — nothing lets a skilled player add lateral influence to a push once impulse direction is locked to the opponent vector, so the entire skill ceiling is "get your position right, then time the tap," with no way to convert superior positioning into more than the same fixed-magnitude shove everyone gets.
  - **Single highest-value change:** blend a small fraction of the pusher's own held movement/last-input direction into the impulse vector alongside the toward-opponent component (e.g. `finalVec = normalize(towardOpp * (1 - mix) + heldDir * mix)`), giving a skilled player a genuine, learnable way to curve a push without fully decoupling it from the auto-lock's accessibility.
    ```
    Value proposed: mix = 0.3 (starting ratio, POSTURE B)
    Test: playtest N=6 matched-skill-tier pairs pre/post change; measure whether
      win-rate separation between self-reported "experienced" vs "new" players
      widens (more separation = more skill expression added).
    Direction on failure: if separation is flat, raise mix toward 0.5; if it makes
      the game feel like aim-then-shove and undermines the auto-lock's
      accessibility, roll back and try a smaller mix (0.15) instead.
    ```
- **Clarity** — good; blob positions and the shrinking boundary are both directly visible, no hidden state.
- **Response** — good; tap-to-impulse is immediate and legible, matches expectations for the mechanic as designed.
- **Satisfaction** — physics-based knockout (restitution bounce, ring-out) should read as satisfying; no issues found in the pure sim.
- **Fit** — the shrinking platform (forcing an ending) and auto-lock push (mirrors literal sumo — you don't aim your opponent's fall trajectory, you just shove and let physics and position decide) both genuinely fit a "sumo" identity. This isn't a lazy simplification, it's a coherent design choice.

### Is the missing aim a defensible design, or the game missing its main decision?

**Defensible, but under-leveraged.** The choice fits the sumo theme and keeps the input model dead simple (one button), which is right for an arcade game. The problem isn't that aiming is auto-locked — it's that positioning, the mechanic that's supposed to substitute for aiming, currently caps out at a binary "push or don't," so there is exactly one skill dimension (position + timing) carrying the entire game, and it plateaus fast. The mix-in change above is the cheapest way to add a second, genuinely learnable layer without abandoning the accessible one-button design.

### Dominant strategy?

No forced win, but the strategy space is thin: stay off-center early (avoid the shrink), close distance and push from a favorable angle as the platform tightens. Once a player learns "position first, tap on approach," there isn't much more to discover — this is the practical meaning of "shallow," distinct from "solved."

### Does skill beat reflex-latency?

Yes for tap timing and positioning read, but the *ceiling* on how much skill can separate two players is low because there's only one axis to master.

### Would you play it twice?

For a handful of rounds, yes — the physics and shrink-timer create real short-burst tension. As a long-term game, honestly no: once position+timing is learned there's nothing left to get better at, which is the definition of a shallow repeat-play case per this framework.

---

## Space Duel

**Player goal:** destroy the opponent's ship (3 HP) or land more bullet hits than them before the 60-second cap.

**System rules:** Asteroids-style inertial movement (thrust/rotate/friction), ships bounce off walls but bullets wrap toroidally, `FIRE_COOLDOWN = 0.35s`, `HITS_WIN_MARGIN = 1` decides ties at the time cap.

### 5-Component evaluation

- **Response — weakest component, and it's a structural one.** The correctness review already established that guest-fired shots round-trip over the network before the host's authoritative sim registers them (referenced once here because it's central to this verdict, not repeated in depth). Layered onto a 0.35s cooldown, that round-trip delay is not a cosmetic nit — it eats a meaningful fraction of the time between shots a guest-seat player can land, on a mechanic (aim + fire timing) that is otherwise the entire skill test of the game.
  - **Single highest-value change:** give the guest local prediction/immediate local registration of its own fire input (matching the pattern Pong and Sumo already use for paddle/blob movement), with host reconciliation on the authoritative tick.
    ```
    Test: measure host-seat vs. guest-seat win rate across N=8 matched-skill-tier
      pairs, both before and after adding guest-side fire prediction.
    Direction on failure: if the win-rate gap (posture B starting target: within 5
      percentage points) doesn't close, the round-trip cost is dominated by raw
      network RTT rather than missing prediction, and the fix needs server-style
      reconciliation/rollback, not just optimistic local fire.
    ```
- **Clarity** — sound; ship heading, thrust, and bullet paths are all directly visible with no hidden state.
- **Motivation** — the HP-3 (rather than one-hit-kill) model is a good design choice: it lets a single lucky/unlucky exchange be absorbed rather than deciding the whole round, which keeps stakes proportional to sustained skill rather than one coin-flip hit.
- **Satisfaction** — plausible given hit/kill events are distinct and HP-based, but full moment-to-moment feel (thruster response, bullet-wrap visibility) could not be assessed from logic alone.
- **Fit** — good; inertial movement, toroidal bullets, and a hard time cap all match a "space duel" identity.

### Does skill beat reflex-latency?

This is the clearest "no, not for the guest seat" case in the whole set. The underlying skill fundamentals (leading a shot against a moving, inertial target; managing thrust vs. control; dodging while wrapping) are real and comparable in depth to the correctness review's read of Pong — but unlike Pong, the fix for guest-side lag (local prediction) is not yet in place for the mechanic that decides duels: firing. Until it is, an equally-or-more skilled guest-seat player is fighting the architecture as much as the opponent.

### Dominant strategy?

None evident from the physics/rules themselves — circle-and-snipe vs. aggressive close-range trading are both viable in principle. The practical "dominant strategy," as shipped, is closer to "be the host."

### Would you play it twice?

Yes, once guest-side fire prediction ships — the aim/lead/dodge/HP-margin fundamentals are sound and comparably deep to Pong's. As currently built, the honest answer for the guest seat specifically is "not confidently" — you can't tell a loss-to-skill from a loss-to-latency.

---

## PAC MAC

**Player goal:** score more points than the rival muncher by the 90-second match cap, racing for shared pellets while four ghosts hunt both.

**System rules:** buffered-input tile-turning (a `want` direction is recorded continuously and only applied at tile centers — a well-designed input model, see Response below), scatter/chase phase cycling (7s/20s), power pellets frighten all ghosts for 6s with an escalating eat-combo (`GHOST_PTS = [200,400,800,1600]`).

### 5-Component evaluation

- **Motivation / depth — weakest component, and the one the task specifically asks about.** All four ghosts use identical `pickGhostDir` targeting in chase mode (`nearestMuncher`) — the only real per-ghost differentiation is scatter-mode corner and eaten/frightened state, not chase-mode *behavior*. The original Pac-Man's four personalities (direct chase, ambush-ahead, flank-via-partner, shy-retreat) exist specifically so a player can learn readable, exploitable patterns per ghost — mastery in the original comes from learning **four** behaviors, not one. Here, mastery caps at learning one behavior and the maze layout. A secondary, concrete cost: because all four ghosts greedily path toward the same nearest-muncher target, they tend to convoy onto the same route instead of converging from multiple vectors — easier to lose in a loop than a genuinely surrounding pack would be.
  - **Single highest-value change:** differentiate at least two of the four ghosts' chase-mode targeting — cheapest, highest-legibility version is one "direct chaser" (current behavior, keep as-is) and one "shy retreater" (flees to its corner whenever within some radius of a muncher, otherwise chases) — giving players a "safe ghost / dangerous ghost" read to build a mental model around, without needing all four Pac-Man-original variants at once.
    ```
    Value proposed: shy-retreat trigger radius = 4 tiles (starting value, POSTURE B)
    Test: playtest, ask players "did any ghost feel more predictable or learnable
      than the others?" pre/post change.
    Direction on failure: if players still report ghosts as interchangeable, either
      the radius is too small to matter in practice (widen it) or one differentiated
      ghost isn't a strong enough signal (add a second, e.g. an ambush-ahead
      variant using the prey's current heading).
    ```
- **Response — good, worth calling out as a positive.** `advanceActor`'s buffered-`want` + tile-center-turn model is exactly the right pattern for a maze game: it lets a player queue a turn before reaching the intersection rather than punishing exact-pixel timing, which is a textbook Response-layer input-buffering solution.
- **Clarity** — could not fully assess ghost-mode telegraphing (frightened/eaten color state) without the board component; the pure logic itself carries the necessary state cleanly.
- **Satisfaction** — the escalating ghost-eat combo (200→400→800→1600 across one power window) is a strong, legible risk/reward hook: routing through multiple frightened ghosts before the 6-second timer expires is a real, masterable skill with an escalating payoff, and is one of the better-designed Satisfaction loops in this whole set.
- **Fit** — good; shared pellets + shared hazard (rather than one muncher per pellet or private ghosts) makes the score race genuinely competitive rather than two solo playthroughs happening to share a screen.

### Dominant strategy?

No degenerate line found. The closest thing to an "optimal" strategy is power-pellet-chaining for combo score, but pulling it off (routing through multiple frightened ghosts before the timer runs out) is itself the skill being tested, not a shortcut around one.

### Does skill beat reflex-latency?

Yes, this one holds up well — the buffered-turn input model means precise timing at network-tick granularity isn't the bottleneck; route-planning and risk management are.

### Would you play it twice?

Yes, cautiously — the pellet-race-plus-combo-chase core loop is legitimately compelling. The flat ghost AI is the main thing currently capping how much better a second or third session can get, and it's a moderate, well-scoped fix rather than a redesign.

---

## Paint Turf

**Player goal:** own more of a 20×20 grid than the opponent when the 60-second clock expires.

**System rules:** paint-on-**exit** (a deliberate, documented deviation from the more obvious paint-on-entry — the cell you *leave* converts, not the one you enter), standing on unconverted enemy paint slows you to `ENEMY_SLOW_MULT = 0.7`, and the final 10 seconds is when the AI (at least) switches to actively routing toward the opponent's largest contiguous region to steal it.

### 5-Component evaluation

- **Response — already solved, worth calling out.** Per the codebase's own comment, the guest predicts its own movement locally between snapshots (unlike Snake/Tron) — this is the correct pattern, and it means Paint doesn't have the guest-seat latency problem the two tick-grid games do.
- **Motivation — the closest thing to a weak point, but a mild one.** The core loop (grab neutral territory, avoid/contest enemy-slowed cells, snipe in the final 10s) is real but has a single obvious shape each round: expand efficiently, then convert to steal-mode near the clock. There isn't yet a mid-round swing mechanic (a pickup, a temporary speed boost, a contested "supply point") the way Pong's power-ups or PAC MAC's power pellets create variance.
  - **Single highest-value change (lower priority than the Response fixes elsewhere in this set):** a single mid-round comeback lever — e.g. a rare tile that temporarily removes the enemy-slow penalty for the player who paints it — would give a losing player a concrete tactical option beyond "route better," without touching the well-designed paint-on-exit/slow-zone core.
- **Clarity** — the paint-on-exit rule is subtle (a player watching a single frame could reasonably expect paint-on-entry); whether this reads clearly in motion could not be assessed without a live view (see Could Not Assess).
- **Satisfaction / Fit** — sound on paper: contact-based slowing when contesting enemy territory creates real moment-to-moment friction rather than two players simply drawing separate paths on a shared board.

### Does racing create real tension when you can't fully see the opponent?

This is less true for Paint than the "race" framing suggests: both players occupy the **same visible grid simultaneously**, and the enemy-slow mechanic is a direct, felt interaction (crossing into contested territory costs you speed) — it is closer to a contact duel than a blind race. The final-10-seconds steal mechanic adds a real comeback window. The "race, not duel" concern in the task brief lands much harder on Mine Race than on Paint.

### Dominant strategy?

No degenerate line evident — efficient early expansion plus a well-timed late steal is the shape of good play, but *executing* it (routing around slow zones, correctly judging which enemy region is worth stealing) is itself the skill, not a shortcut past one.

### Would you play it twice?

Yes — of the two "race" games named in the brief, this is the one that's actually a duel in disguise, and it already has the hardest infrastructure problem (guest-side prediction) solved.

---

## Mine Race

**Player goal:** be the first to reveal all 122 safe cells on an identical, seed-shared 12×12/22-mine board; tapping a mine ends your run.

**System rules:** both clients derive the identical board locally from a shared seed (anti-leak: the board itself never touches Firebase, only revealed-cell **counts** are mirrored) — classic flood-fill on zero cells, chording on satisfied numbers, first-open-region generation for fairness.

### 5-Component evaluation

- **Motivation — the closest thing to a weak point.** Unlike every other game in this set, there is no match clock or round timer in the pure logic (`MATCH_SECONDS` doesn't exist here the way it does for Paint/PAC MAC) — the round ends only on completion (or, presumably, a mine tap at the page level). Combined with the correctness review's finding that there's no forfeit path if an opponent abandons (referenced once, not re-litigated), a round has no built-in mechanism to keep tension escalating if one side is slow or stalls out.
  - **Single highest-value change:** surface (or add, if not already present) a live head-to-head comparison — "opponent has revealed 40% more of the board than you" — as continuous tension, not just a finish-line result. The correctness review's mention of an existing `RaceBar`/`GhostRow` HUD suggests some version of this may already exist at the page level; if so, the remaining gap is purely the missing time-pressure device.
    ```
    Value proposed: add a soft sudden-death/pressure mechanic if median round
      duration exceeds 3 minutes (starting threshold, POSTURE B).
    Test: log round duration across N matches, take the median.
    Direction on failure: if rounds already resolve well under 3 minutes in
      practice, no pressure mechanic is needed and this recommendation should be
      dropped rather than added speculatively.
    ```
- **Response — a genuine strength, not a gap.** This is the only game in the set that is structurally immune to the network-latency problems affecting the others: because each player's moves are computed entirely client-side against an identical, deterministically-generated board, and only aggregate revealed-cell counts (not positions or timing) need to sync, there is no host/guest asymmetry to fix here at all.
- **Clarity** — the anti-leak model (share counts, not positions) is a clever, well-reasoned compromise: it gives genuine competitive information ("they're moving fast" / "they're deep in one corner" via count deltas) without fully exposing the opponent's board state, which would turn the puzzle into a lookup.
- **Satisfaction / Fit** — the deduction-plus-speed loop, if the correctness review's keyboard-access and idle-forfeit bugs are fixed (referenced once, not repeated), is a legitimate and well-regarded genre (competitive speed-minesweeper) — the categorization as a "reflex/simultaneous" game alongside typing/math games is apt.

### Is this a race that lacks real tension because you can't see the opponent?

Partially true, but for a different reason than Paint: you genuinely *can't* see the opponent's board (by design — that's the anti-leak model, and it's the right call for a minesweeper race, since full visibility would just let you copy their solved cells). The tension gap isn't "can't see the opponent," it's "no clock to keep tension climbing throughout the round" — see Motivation above.

### Dominant strategy?

None — this is a genuine logic-deduction race with no forced line. Both boards are identical and fair by construction (first-open-region generation guarantees a safe start for both), so outcome differences trace to real skill (deduction speed and accuracy), not luck of mine placement.

### Does skill beat reflex-latency?

Yes, more cleanly than any other game in this set — there is no real-time synchronization dependency at all in the core loop, so this is pure skill (pattern recognition + speed), not connection quality wearing a game's clothes.

### Would you play it twice?

Yes — once the already-logged keyboard-access and idle-forfeit bugs are fixed, this is the strongest "worth saving" core in the whole set: a genuinely fair, skill-driven race with a clever anti-leak design nobody else in this review has to solve.

---

## Cross-cutting: the Response pattern that repeats three times

Pong and Sumo both give the guest local prediction of its own actor; Snake, Tron, and Space Duel don't. This is the single highest-leverage, most repeatable fix available across this game set — the same engineering pattern, applied three times, would take three "connection-quality tests wearing a skill game's costume" (or, for Space Duel, "partially") and turn them into fair skill tests. Worth the captain treating this as one infrastructure investment rather than three separate feature requests.

## Numbers proposed in this report (index, with posture)

| Value/claim | Posture | Where |
|---|---|---|
| Sumo push-vector mix ratio = 0.3 (blend held-direction into auto-lock impulse) | **B** — starting value; test = matched-pair playtest measuring skill-tier win-rate separation; direction on failure = raise toward 0.5, or lower to 0.15 if it undermines the auto-lock's accessibility | Sumo, Motivation section |
| PAC MAC shy-retreat ghost trigger radius = 4 tiles | **B** — starting value; test = ask players whether any ghost felt learnable/predictable pre/post; direction on failure = widen radius or add a second differentiated ghost | PAC MAC, Motivation section |
| Space Duel guest-vs-host win-rate gap target ≤ 5 percentage points after adding fire prediction | **B** — starting target; test = N=8 matched-skill-tier pairs, measure win-rate delta before/after; direction on failure = the gap is RTT-dominated, not prediction-dominated, and needs reconciliation/rollback instead | Space Duel, Response section |
| Mine Race soft-pressure-mechanic threshold = 3 minutes median round duration | **B** — starting threshold; test = log N round durations, take median; direction on failure = if already under threshold, drop the recommendation | Mine Race, Motivation section |

No source-backed (posture A) numbers are proposed — nothing in this report claims an external citation. Existing engine constants quoted directly from source (`WIN_SCORE = 5`, `TICK_MS = 120`, `FIRE_COOLDOWN = 0.35`, etc.) are cited as measured facts about the current implementation, not new proposed values, so the Numbers Policy does not apply to them individually — only to the four new values this report is introducing, above.

## Assumptions

```
ASSUMPTION: Space Duel has no local prediction of the guest's own fired shots
  (i.e. the guest must wait for the host's next authoritative tick to see its
  own bullet appear/register a hit), based on the correctness review's finding
  that guest shots "round-trip before registering."
IMPACT: this is the load-bearing fact behind ranking Space Duel below Pong and
  marking Response as its weakest component.
IF WRONG: if some partial local prediction already exists (e.g. optimistic
  bullet rendering without hit registration), the gap is smaller than stated
  and Space Duel should move up toward Pong's tier.
VALIDATE: read SpaceDuelGame.jsx / useRealtimeHost.js / useRealtimePeer.js for
  the guest-side fire-input handling path.
```

```
ASSUMPTION: Mine Race's page-level UI already surfaces some live opponent-
  progress comparison (a "RaceBar"), per the correctness review's mention of
  a RaceBar/GhostRow HUD, and the remaining Motivation gap is purely the
  missing time-pressure device, not the comparison itself.
IMPACT: changes what "single highest-value change" means for Mine Race — if
  no live comparison exists, that (not a soft timer) would be the higher-
  priority fix.
IF WRONG: if RaceBar only shows own progress or is a static endstate summary,
  add the live head-to-head comparison first, before any timer mechanic.
VALIDATE: read MineRaceGame.jsx's RaceBar/GhostRow implementation.
```

## What could not be assessed by reading

- **Actual felt lag and prediction quality across all six real-time games** — whether Pong's/Sumo's/Paint's "already solved" guest prediction actually feels seamless under real-world RTT, and how bad Snake/Tron/Space Duel's gaps feel in practice, all require live two-network testing, which this review was told not to do.
- **Pong's spin/dead-reckoning interaction** — whether a guest's straight-line extrapolation of a spin-curved ball produces a visible rendering mispredict near paddle contact is a plausible read from the code, not a confirmed observation.
- **PAC MAC's mode-telegraphing** (frightened/eaten ghost color changes, whether players can read danger at a glance) — the pure logic carries the state correctly; whether the board component surfaces it legibly needs a live view.
- **Paint Turf's paint-on-exit clarity in motion** — whether players correctly perceive "the cell I just left changes color" versus expecting paint-on-entry needs eyes-on observation, not just code reading.
- **Sumo's felt shallowness** — the "one skill axis" conclusion is argued from the mechanic's structure (auto-lock leaves only position+timing to master), not from observed repeat-session engagement data.
- **Mine Race's actual median round duration and whether a live opponent-progress comparison already exists** — both are stated as explicit assumptions above, pending a page-level read.
- **Mobile touch/swipe feel** across Snake, Tron, PAC MAC, and Paint — geometry reads as reasonable in the logic layer, but feel was out of scope for a read-only, no-browser review.
