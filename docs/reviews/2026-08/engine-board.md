# Game-engine implementation review — turn-based board games

Scope: `Board.jsx`, `ConnectFourBoard.jsx`, `DotsAndBoxesBoard.jsx`, `SosBoard.jsx`, `GomokuBoard.jsx`, `ReversiBoard.jsx`, `OrderChaosBoard.jsx`, `ChainReactionBoard.jsx`, `BlockadeBoard.jsx`, `HexBoard.jsx`, `UltimateTttBoard.jsx`, `BattleshipBoard.jsx`, `PairsBoard.jsx`, `DiceBoard.jsx`, their `src/lib/` logic modules, `src/pages/Game.jsx`, `src/lib/games.js`. `/game-engine` skill does not exist in this environment — reviewed from the brief's own lens instead. No code run, no build, no browser.

## Ranked findings

| # | Game / area | Finding | Severity | Effort |
|---|---|---|---|---|
| 1 | Shell-wide (`Game.jsx`) | `normalizeBoard(game.board, cfg.boardSize)` reallocates the board array on **every** `Game.jsx` render, not just board-changing ones — emote floats, mute toggle, proposal state, etc. all re-render the full board tree | weak | S |
| 2 | Shell-wide | No board or cell component (`Board.jsx`/`Cell.jsx`, all 14 game boards) is wrapped in `React.memo` | weak | S |
| 3 | Chain Reaction | Replay/mover inference trusts `prevBoardRef` is the immediately-prior settled board; a coalesced/skipped Firebase snapshot (e.g. after a reconnect) desyncs the wave animation from the real owner mapping until the final forced sync | weak | M |
| 4 | Battleship | `BattleshipBoard` is purely presentational and driven by a page (`BattleshipGame.jsx`) outside this review's scope — could not verify its double-submit guard the way `Game.jsx`'s is verified here | n/a (scope gap) | — |
| 5 | Blockade | `legalPawnMoves`/`shortestPathToGoal` (BFS over 81 cells) run on every render via `legalMoveSet`/`isWallMoveLegal` calls in the board — cheap at N=81 but uncached | polish | S |
| 6 | All 14 boards | Hover-preview states (`ConnectFourBoard`, `DotsAndBoxesBoard`, `BlockadeBoard`) rely on `onMouseEnter`/`onMouseLeave`, which never fire on touch — no functional bug, just no pre-commit preview on mobile | polish | S |

Nothing here is **broken**. This set is small, well-behaved DOM UI; the worst issues are unnecessary re-renders, not incorrect behavior.

## Detail

### 1–2. Re-render cost is real but structural, not measured

`Game.jsx:1259` — `const board = isCustom ? [] : normalizeBoard(game.board, cfg.boardSize)` runs unconditionally on every render of `Game`. `normalizeBoard` (`gameLogic.js:21-29`) allocates a new `size`-length array plus an `entries` array every call. `Game.jsx` re-renders on: the emote-float timeout (`setFloats`, fires every ~2s while a reaction is active), `muted` toggle, `showRules`/`showInvite` opens, the abandon-banner timer, and of course every real Firebase snapshot. None of these guard with `useMemo`, and no board component (`Board.jsx`, `Cell.jsx`, and all 14 game-specific boards) is `React.memo`-wrapped, so an unrelated state change walks the whole board subtree and re-evaluates every cell's Tailwind class string.

**Cost, by game:** Blockade is the largest single tree (81 cells + 128 wall slots = 209 elements, `BlockadeBoard.jsx:51-150`), followed by Dots and Boxes (`(2·6+1)² = 169` grid cells, of which 84 are edges, `DotsAndBoxesBoard.jsx:11-13`), Chain Reaction (80 cells), Ultimate TTT (81 + 9 wrapper divs). At these counts this is **not** a frame-budget problem — a full re-render + diff of ~200 DOM nodes is sub-millisecond work for React on any device from the last decade, and none of these games run on a clock, so there's no 16ms budget to blow. The actual cost is aggregate: a long session with active emote spam or frequent rules-modal toggling does more reconciliation work than necessary, all for zero visual change.

**Fix:** wrap each `*Board` export in `React.memo`, and wrap the `board`/`winningLine` derivations in `Game.jsx` in `useMemo` keyed on `game.board`/`game.winningLine` identity (or a cheap serialization) so unrelated state changes don't even reach the board's props with new array references. Small, mechanical, low-risk — the boards are already pure functions of props.

**What I can't confirm without a profiler:** whether this is ever visible as jank on a real device, or purely a React DevTools Profiler "extra commits" finding. Given the element counts and lack of any per-frame work, I'd bet on "invisible in practice, worth fixing anyway because it's free."

### 3. Chain Reaction's replay pipeline — the interesting one, assessed as an engine problem

`ChainReactionBoard.jsx:48-146`. This is genuinely the best-engineered animation in the set, and the design review already covered its Clarity/Response angles — assessing the mechanism itself:

- **Timing tool is correct.** Cascade waves are discrete, ordered, and bounded (`steps` array from `applyPlacement`, `chainReactionLogic.js:69-114`, itself capped by `MAX_WAVES`). A chain of `setTimeout`s at fixed 140ms offsets (`(waveIdx+1)*140`) is the right tool for "play out N discrete, pre-computed events in sequence" — this is not continuous motion, so `requestAnimationFrame` would be the wrong tool here, and the code correctly doesn't reach for it.
- **Cleanup is correct.** Every effect run clears `timersRef.current` before scheduling new ones (`chainReactionLogic.js` — sorry, `ChainReactionBoard.jsx:52-53`), and the unmount path is implicit in that same guard since the ref is component-scoped. No leaked timers across replays or unmounts.
- **Input during replay is blocked correctly.** `legalSet` (`ChainReactionBoard.jsx:149-155`) is empty whenever `isReplaying` is true, on *both* clients (each client independently replays from the same settled Firebase board), so a move cannot be submitted mid-cascade. Combined with `Game.jsx`'s `moveInFlight` ref and turn-ownership check, this is layered correctly — belt (client-disabled board) and suspenders (server-truth turn check).
- **Backgrounding a tab mid-cascade is a non-issue for this game family**, and worth stating plainly since the brief specifically flags it: `setTimeout` callbacks queued while backgrounded are throttled (per spec, background tabs get ≤1 timer fire/sec) but not skipped — they still fire in order, just possibly bunched together when the tab regains focus. Since every intermediate `displayBoard` state is disposable (only cosmetic — the actual game state lives in Firebase) and the *final* timer (`ChainReactionBoard.jsx:132-137`) unconditionally snaps `displayBoard` back to the real settled `board` prop, a throttled/bunched replay just means the player sees the explosion animate faster (or almost instantly) on refocus — never a stuck or incorrect final state. This is the arena-game failure mode (paused rAF + running timer = jump) *specifically avoided* by not using rAF for something that was never continuous motion to begin with.
- **The one soft spot (#3 above):** the mover-inference (`ChainReactionBoard.jsx:69`, `moverSymbol = currentTurn === 'X' ? 'O' : 'X'`) and the "did the board actually change since last render" check (`prevBoard.join(',') !== board.join(',')`, line 58) both assume `prevBoardRef.current` is the immediately-preceding settled state. Firebase's `onValue` normally delivers every write in order, so in the steady-state this holds. But after a listener re-subscribe (tab wake from long background, reconnect after a drop) the first snapshot delivered is just "current state," and if a second move landed on the *other* client while this one was disconnected, `prevBoard` could be stale by more than one ply. The replay would then diff against the wrong baseline and briefly animate an incorrect/impossible sequence of explosions before the hard final sync overwrites it. Low severity (self-correcting, cosmetic-only, requires a disconnect-during-opponent's-turn window) but worth hardening: track a monotonic `crMoves` (already present in Firebase, `chainReactionLogic.js:139`) delta instead of/alongside the board-diff heuristic, so a >1-move jump can be detected and the replay skipped entirely (snap straight to final) rather than animated wrong.

### DOM vs canvas — assessed per the brief's instruction not to assume

Every board in this set is a discrete, turn-based grid with element counts from 9 (Tic-Tac-Toe-scale) to 209 (Blockade, cells+walls). None of these have continuous motion, particle counts, or anything resembling a simulation loop except Chain Reaction's already-covered discrete replay. DOM is correct for all fourteen — there is no game here whose element count or update frequency would benefit from canvas; canvas would only add complexity (manual hit-testing, manual accessibility, manual theming since the whole app themes via CSS custom properties on DOM nodes per `AGENTS.md`'s "Theming" section). No board in this set has grown past what DOM comfortably handles.

### Collision — mostly not applicable, stated plainly

The brief asks which games can "tunnel." None of the fourteen have continuous-motion collision to tunnel through — every interaction is a discrete click/tap on a fixed-position `<button>` (or absolutely-positioned edge/wall hit-target in Dots and Boxes / Blockade). Hit-testing is native DOM event dispatch, not custom geometry math, so there's no continuous-vs-discrete collision question to answer here — that class of bug belongs entirely to the arena/reflex games, not this set.

### Delta time — none of these games get it wrong, and the brief asked to name every one that does

Zero. None of the fourteen drive any motion or state off elapsed wall-clock time or an assumed frame interval. The only thing that resembles "timing" is Chain Reaction's fixed 140ms-per-wave `setTimeout` chain (cosmetic replay only, covered above) and Dice/Pig's turn-scoped `diceRolls` trail (no timing at all — event-driven). The entire game family sidesteps the most common engine defect class by construction: turn-based discrete-state games driven by Firebase listeners have no frame loop to get delta-time wrong in.

### Input handling

- **Double-submission guard is solid and centralized**, not per-board: `Game.jsx:816` (`moveInFlight` ref, checked before any write, cleared only once the next Firebase snapshot lands — `Game.jsx:651-653`) plus the turn-ownership/status checks at `Game.jsx:817-818`. Every board (`ConnectFourBoard`, `DotsAndBoxesBoard`, etc.) also independently disables its clickable elements via the `disabled` prop and per-cell occupancy checks, so a move can't be submitted twice through either the network-race path or the double-click path.
- **Every clickable cell is a real `<button>`** (not a `div` with an `onClick`), across all fourteen boards — correct for a11y (focus, keyboard activation, screen-reader semantics) and gets `:disabled` styling/behavior for free.
- **Blocked-tap feedback** (`Game.jsx:806-812`, `blockedMoveFeedback`) is throttled to ~1/sec specifically so a burst of taps during the opponent's turn doesn't spam toasts — a deliberate, correct choice for touch input, called out in the source comment.
- Touch/mouse are not handled separately anywhere, which is correct here: every interaction is `onClick` (browser-normalized across pointer types) with no drag, multi-touch, or gesture requirement. The only pointer-type-specific code is hover-preview (`onMouseEnter`/`onMouseLeave` in `ConnectFourBoard`, `DotsAndBoxesBoard`, `BlockadeBoard`) which simply doesn't fire on touch — no bug, just a missing "preview before commit" nicety on mobile (polish, #6 above).
- **Blockade's render-time state adjustment** (`BlockadeBoard.jsx:20-25`) — resetting the pending-wall-placement UI when `currentTurn` changes, done via the "adjust state during render" React pattern rather than an effect — is explicitly commented as deliberate and is the *correct* use of that pattern (avoids an extra render pass, avoids the anti-pattern of `setState` inside `useEffect` for a value derivable from props). Worth calling out as a genuinely well-done piece of React, not just working-by-accident.

### Audio

`sounds.js` — genuinely well built, worth stating plainly rather than filing findings:
- Single lazily-created `AudioContext` singleton (`ctx()`, `sounds.js:1-7`), resumed on `suspended` rather than recreated — correct pattern, avoids the common bug of instantiating a new context per sound (which leaks contexts and can hit the browser's context limit).
- Context creation is lazy and only happens from inside a `sounds.*()` call, which in this codebase is always invoked from a click/tap handler (`Game.jsx`'s `handleMove`, `sendEmote`, etc.) — satisfies the browser's user-activation requirement for audio unlock without any explicit "tap to enable sound" step.
- Every sound is synthesized (oscillators/noise buffers), not sample playback, so there's nothing to "pool" — oscillators are correctly one-shot (`start`/`stop` once, per Web Audio's actual API contract) rather than incorrectly reused across calls.
- Failure is defensive (`try/catch` around every context operation) so a browser without Web Audio, or a context creation failure, degrades to silent rather than throwing into the render path.

### Tab visibility / backgrounding

No `visibilitychange` listener and no `requestAnimationFrame` anywhere in this game set (confirmed by grep across all fourteen boards, `Game.jsx`, and `games.js`) — and correctly so, since nothing here runs a frame loop. The one place a background tab could matter (Chain Reaction's replay timers) was assessed above and found safe: `setTimeout` throttling degrades gracefully to "animation plays out faster/bunched on refocus," never to a stuck or incorrect final state, because the final state is always re-synced from the Firebase-authoritative `board` prop regardless of how the intermediate timers were scheduled.

### The shared shell — `Game.jsx` remounting on game-type switch

`key={game.gameType}` (`Game.jsx:1191` for n-player, `:1331` for 2-player) forces React to unmount and rebuild the entire board subtree when a room switches games via `handleSwitchGame`. Assessed as an architecture choice, not a bug:

- **Cost:** one full subtree teardown/rebuild — at most ~200 DOM nodes (Blockade-scale) — plus whatever local component state each board holds (hover state, selected-letter state in SOS/Order&Chaos, mode toggle in Blockade) is correctly discarded rather than carried over into an incompatible game type.
- **Why it's the right call here, not just "clean":** `AGENTS.md`'s own description of `freshGameState()`/`GAME_TYPES` confirms every game's Firebase shape is structurally different (`board` length, presence/absence of `boxes`/`walls`/`sosLines`/`diceScoreX`, etc.). A patch-based update across a game-type switch would require every board component to defensively handle props from the *previous* game type mid-transition (e.g. `DotsAndBoxesBoard` receiving a `board` sized for Reversi for one render) — remounting sidesteps an entire class of transient-prop-mismatch bugs for a cost that only pays once per explicit "SWITCH GAME" action (an infrequent, deliberate, end-of-round user action, never per-move). The Firebase listeners themselves are keyed off `gameId`, not `gameType` (top-level effect, `Game.jsx:265-444`), so the subscription isn't torn down and re-established on a switch — only the rendered tree is, which is the minimum necessary cost for this architecture.

## Genuinely well-built (one line each)

- **Audio system** (`sounds.js`) — singleton `AudioContext`, correctly one-shot oscillators, gesture-unlocked by construction. See Audio above.
- **Chain Reaction's replay pipeline** — right tool (chained timers, not rAF) for discrete pre-computed wave data, correct cleanup, correct input-blocking during replay, correctly resilient to tab backgrounding.
- **Blockade's render-time state sync** (`BlockadeBoard.jsx:20-25`) — the "adjust state during render" pattern is used correctly and deliberately, not accidentally.
- **Move double-submission guard** (`Game.jsx`'s `moveInFlight` + per-board `disabled`) — layered correctly across the async Firebase-write gap.
- **Real `<button>` elements everywhere** — a11y and touch/mouse normalization comes for free across all fourteen boards, no custom hit-testing anywhere it isn't needed.
- **DOM-over-canvas choice** — correct for every game in this set at these object counts; no board has grown past what DOM comfortably handles.

## Structural vs profiler-dependent claims

**Structural certainties (from reading, no profiler needed):**
- `normalizeBoard` reallocates on every `Game.jsx` render regardless of cause (verified: no `useMemo`, traced every state setter that would trigger it).
- No board/cell component uses `React.memo` (verified by grep across all fourteen files + `Cell.jsx`/`Board.jsx`).
- Chain Reaction's timer cleanup, input-blocking, and final-state resync are all correct as written (traced the full effect).
- No `visibilitychange`/`requestAnimationFrame` usage anywhere in this game set.
- Element counts per board (Blockade 209, Dots & Boxes 169 grid positions, Chain Reaction 80, Ultimate TTT 90) computed directly from the grid math in each logic file.

**Would need a profiler to confirm:**
- Whether the extra re-renders (finding #1/#2) are ever perceptible as jank, dropped input, or battery cost on a real low-end device, versus purely a React DevTools "extra commit" that has zero user-visible effect. My structural read says the latter (element counts are too small to matter), but I did not and could not measure it.
- Actual wall-clock cost of Blockade's per-render BFS (`shortestPathToGoal`, 81-node graph) — trivially cheap in Big-O terms, but I didn't measure real device timing.
