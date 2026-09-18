# Board Game Playability Review

> **Direction: keep the board games' solid logic, fix the paths that never reach the player, and make the boards readable at a glance.**

- **Review date:** September 16, 2026.
- **Status:** GAMEPLAY-01 (including the not-available fallback card), GAMEPLAY-02, GAMEPLAY-03, GAMEPLAY-04, and GAMEPLAY-05 **shipped and verified** (same day — see each finding's *Shipped fix* note). Hex rails + SOS fade additionally swept across all six dark themes (midnight, phosphor, amber, synthwave, grid, mono) with no contrast fixes needed. The P3 bot-depth notes remain proposals. An unrelated pre-existing uncommitted edit in `src/index.css` (paper/matcha CRT-overlay suppression) was present in the working tree before this pass and was left untouched.
- **Scope:** All 19 `category: 'board'` games in `src/lib/games.js`, plus Pig (`dice`) for comparison. Real-time games (Pong, Snake, Tron, Sumo, Space Duel, Paint, Pac Mac, Air Hockey), memory, word, and party games are out of scope.
- **Method:** every board game was played end-to-end vs its demo bot in a scripted Chrome session on `http://localhost:5179` (390×844, midnight theme, reduced motion, Firebase requests blocked so no rooms/profiles were written). Each game's win-detector, move application, pass/stalemate handling, and bot heuristic were also traced in source per the `review-a-game` checklist.
- **Visual companion:** [Interactive review](../.lavish/gameplay-review/index.html) (open via `lavish-axi .lavish/gameplay-review/index.html`).
- **Evidence:** 20 screenshots in `.lavish/gameplay-review/shots/`, scripted-session log in `.lavish/gameplay-review/evidence.json`.

## Contents

1. [Executive assessment](#1-executive-assessment)
2. [P1 findings](#2-p1-findings)
3. [P2 findings](#3-p2-findings)
4. [P3 bot-depth notes](#4-p3-bot-depth-notes)
5. [Per-game verdicts](#5-per-game-verdicts)
6. [What checked out](#6-what-checked-out)
7. [Suggested order of work](#7-suggested-order-of-work)
8. [Not covered](#8-not-covered)
9. [Review artifacts](#9-review-artifacts)

## 1. Executive assessment

The board-game catalog is in good structural shape: **all 19 win-detectors traced correct against their real rules**, pass/stalemate paths exist where they are needed (Reversi, Blockade, Ultimate TTT), every board is built from real keyboard-reachable `<button>` elements, and the persistent last-move ring works everywhere. No game-logic bugs were found this pass.

The problems are in **reachability and readability**, not rules:

- Three solo variants are **advertised in the catalog but silently play a different game** (TTT 4×4 → 3×3 TTT, C4 FIVE → 7×6 C4, DICE BIG → one-die Pig). This is the single worst finding: a player picks a specific game and the app plays another without saying so.
- **Rematches always give the room creator the first move.** In games with a proven first-move advantage (Connect Four and TTT are solved first-player wins; Gomoku and Hex confer a large practical edge), one player structurally wins the rematch series.
- A handful of boards fail their own readability job: Hex's goal edges are 30%-alpha washes (and the goal *is* the ruleset), Gomoku and Checkers identify pieces by **color alone**, and SOS's scored-line overlay becomes noise late-game.
- Bot depth is fine for a friends-and-family product, but two bots miss the core mechanic of their own variant (C4 Pop Out bot never pops) or teach exactly one exploitable technique (Dots & Boxes).

## 2. P1 findings

### GAMEPLAY-01: Solo variants that play the wrong game

**Observed (reproduced live, screenshots):** The catalog's **VS AI** flow (`GamePicker.handleVsAi`) offers every registry variant with `solo: true` and navigates to `/solo/<variant>`. But `DEMOS` in `src/pages/Demo.jsx` has no entry for:

| Variant | What the player picked | What actually loads |
| --- | --- | --- |
| `tictactoe4` (TTT 4×4) | 16-cell, four-in-a-row | 3×3 TTT titled "TTT DEMO" |
| `connectfour5` (C4 FIVE) | 9×7, five-in-a-row | classic 7×6 Connect Four |
| `dice-big` (DICE BIG) | two-dice Pig | one-die Pig |

`DemoHub` falls back to `initialType = 'tictactoe'` when the route type is unknown, so navigation "succeeds" and nothing indicates the wrong game loaded. The demo hub's BOARD tab also shows 17 tiles instead of 19 for the same reason. The three variants are also absent from `/local/<variant>` pass-and-play.

**Why it's cheap to fix:** `BotBoardDemo` is entirely registry-driven. `tictactoe4` and `connectfour5` already ship complete `getMoveIndex` / `getWinner` (or `applyMove`) / `BoardComponent` config — verified by the working `connectfourpop` demo, which uses the identical pattern. Each is a one-line `DEMOS` entry (`{ type: 'tictactoe4', short: 'TTT\n4×4', ... }`). `dice-big` shares the `DiceBoard` component; add the entry after confirming the board's two-dice `boardProps` render correctly outside Firebase play.

**Also worth fixing in the same patch:** when `/solo/:type` receives a registry-valid type with no demo, show an explicit "solo play for this game is not available yet" state instead of silently swapping games.

> **Shipped fix (verified live):** added `DEMOS` entries for `tictactoe4`, `connectfour5`, and `dice-big` in `src/pages/Demo.jsx`. Browser verification: `/solo/tictactoe4` renders "TTT 4×4 DEMO" with a 16-cell board; `/solo/connectfour5` renders "C4 FIVE DEMO" with 9 drop columns (DOM-verified `dropButtons: 9`); `/solo/dice-big` renders "PIG BIG DEMO" with two dice and playable roll/bank. All three appear in the demo hub's category tabs.
>
> **Fallback card also shipped (verified live):** `/solo/:type` with no `DEMOS` entry now renders an explicit "NO SOLO DEMO" card instead of silently swapping games — a registry type shows `"<LABEL> DOESN'T HAVE SOLO PLAY YET."`, a garbage deep link shows `UNKNOWN GAME "ZZZ"`, and both get CREATE A ROOM / ALL DEMOS exits. The guard lives in the hook-free `Demo` dispatcher (DemoHub keeps state across param changes). Screenshot `fix3-notavailable.png`. A registry↔DEMOS audit script confirms zero gaps today — this card is the safety net for future variants.

### GAMEPLAY-02: Rematch always gives the creator the first move

**Observed (source):** `applyPlayAgain` and `applyNewMatch` in `src/pages/Game.jsx` rebuild state via `freshGameState(game.gameType)`, which hardcodes `currentTurn: 'X'` — and the creator is always X. Neither function consults the previous round's outcome or alternates.

**Impact:** in a best-of-3/5 on the same room, the same player opens every game. Against competent opponents this compounds: Connect Four is a proven first-player win; TTT first player never loses with correct play; Gomoku and Hex first-move advantages are large in practice.

**Suggested fix (schema-free):** on play-again, set `currentTurn` to the previous round's loser (the common catch-up house rule), or persist a `nextStarter` field in the room node and flip it each rematch. One change in the two apply functions; no per-game code. Note the remount contract: `Game.jsx` remounts the game tree on `gameType` change only, so an explicit `currentTurn` in the same update is sufficient.

> **Shipped fix (tests + build green):** `applyPlayAgain`/`applyNewMatch` in `src/pages/Game.jsx` now compute the starter as previous-round loser (draw → alternate from the last starter) and persist it in a new `starter` room field, then apply it through the existing `firstMoverUpdates()` helper — so turn-based boards, hangwoman/twotruths (`round/setter`), and bluff (`bluffRound/turn`) all get the right key automatically. `firstMoverUpdates` is a no-op for real-time/simultaneous/n-player games, so those are untouched. Live two-identity verification of the rematch flow is still open (needs two distinct players; same-browser tabs share one uid).

## 3. P2 findings

### GAMEPLAY-03: Hex — goal edges nearly invisible

The four goal edges are painted as `from-retro-p1/30` / `from-retro-p2/30` gradients (`src/components/HexBoard.jsx`), and empty cells sit one brightness step above the page background. On the default midnight theme the board reads as one dark shape; a new player cannot see where they must connect, and in Hex the goal *is* the ruleset. The same 30%-alpha treatment should be re-checked on amber, phosphor, grid, synthwave, and mono (contrast here was eyeballed on midnight only).

**Suggested fix:** solid tinted rails (p1 left/right, p2 top/bottom) with small direction glyphs at the corners; keep glow for occupied stones. Presentation-only.

> **Shipped fix (verified live):** `src/components/HexBoard.jsx` — goal edges now use solid `bg-retro-tint-p1`/`bg-retro-tint-p2` fills with a 60%-alpha side-color border, inward direction arrows (▶/◀ for X, ▼/▲ for O), and each stone carries its side letter (GAMEPLAY-04's glyph). Screenshot `fix2-hex.png`. Per-theme alpha check still open (eyeballed on midnight only).

### GAMEPLAY-04: Gomoku, Checkers & Hex identify pieces by color alone

Both boards render plain discs: Gomoku uses `bg-retro-p1`/`bg-retro-p2` circles; Checkers the same (kings show a ★ glyph — correct — but men are bare discs). Hex stones are also bare color fills. Every other board in the catalog uses a letter/shape glyph (X/O, S/O) — the codebase's own reference pattern for this exact problem. Cyan-vs-pink is unreliable for some color-vision types, and the theme system makes it worse: in **amber** the pair is amber-vs-cream (brightness only), in **mono** white-vs-gray (brightness only).

*(Correction from the initial write-up: Checkers kings were never glyph-less — the ring noted in the first pass coexists with a ★. The real gap was the men.)*

> **Shipped fix (verified live):** Gomoku stones (`GomokuBoard.jsx`), Hex stones (`HexBoard.jsx`), and Checkers men (`CheckersBoard.jsx`) now render their side letter (X/O) inside every piece; Checkers kings keep ★. Screenshots `fix2-gomoku.png`, `fix2-hex.png`, `fix2-checkers.png`.

**Suggested fix:** a small glyph per stone (● vs ○, or X/O) at ~60% stone size; crown glyph for Checkers kings. No logic changes, board components only.

### GAMEPLAY-05: SOS — scored-line overlay turns to noise

Every completed S-O-S draws a persistent highlight. Both players score often (the extra-turn mechanic invites chains), and by ~20 lines the board is a wall of glowing strokes — fresh threats and the running score are both hard to read. The extra-turn snowball (one careless S can hand an opponent 3–4 points in a row) also has only a small "GO AGAIN" pulse as warning.

**Suggested fix:** render only the most recent N lines at full glow (older lines at ~25% alpha) and add per-player score chips to the status bar. Presentation-only; `sosLines` already stores `by` per line.

*(Correction from the initial write-up: the board already renders a persistent X-count / O-count score bar — the score-chip half of this fix was already done; only the line-fade was missing.)*

> **Shipped fix (verified live):** `SosBoard.jsx` keeps the newest `RECENT_LINES = 6` strike lines at full strength (0.85 opacity, 0.08 width); older lines fade to 0.25 / 0.06. DOM-verified in a 31-line endgame: 6 full + 25 faded. Screenshot `fix2-sos.png`. `RECENT_LINES` is a labeled starting value — lower if boards still feel noisy, raise if players can't trace recent scores.

### GAMEPLAY-06: Solo route still buries the board under the catalog

Reconfirmed on every game this pass: `/solo/:type` renders the full category tabs + game grid above the active board (visible in every capture — the game starts roughly 1.5 screens down at 390×844). This is **UX-01** from `docs/README-UX-REVIEW.md`, already selected for the focused playability pass. No new work is proposed here — this review just adds evidence that the issue dominates the solo experience for board games specifically. Shipping the existing UX-01 fix covers it.

## 4. P3 bot-depth notes

All demo bots are intentionally casual (≤1-ply heuristics), which is the right default for a friends-and-family product. The notes below mark where the ceiling is low enough to teach wrong instincts. No numbers were tuned in this review — anything changed should ship as a labeled starting value and be playtested per the Numbers Policy (direction to move: make the bot still lose to a player who knows one technique, but not to a player who knows none).

| Game | Observed | Suggested nudge |
| --- | --- | --- |
| C4 POP OUT | Bot **never pops** (documented in `demoBots.js`). The variant's core mechanic doesn't exist in solo play. | Minimum viable: pop when it avoids an immediate loss or wins outright, reusing `applyConnectFourPopMove` (~15 lines). |
| DOTS & BOXES | Bot takes every available box and never sacrifices a chain (no double-cross), so one technique wins 19–0 every time. | Fine as the easy tier; a chain-aware "hard" tier (all-boxes + double-cross heuristic) would give the game longevity. |
| ORDER & CHAOS | Order-bot extends the single longest run, never builds forks (two simultaneous 5-threats); reliably beatable. Chaos-bot's random-safe play is closer to real Chaos strategy. | Score moves by threats created (runs ≥4 after placement), not current run length. |
| GOMOKU | Win/block + adjacent heuristic; doesn't distinguish open vs closed threes, loses to any double threat. | Add a 3/4-threat-count term (~20 lines), largest difficulty gain per line of code in the set. |
| PIG / MANCALA | Hold-at-20 (scales risk when behind) and 1-ply greedy are reasonable casual baselines. | No change needed. |

## 5. Per-game verdicts

| Game | Played end-to-end | Win logic | Verdict |
| --- | --- | --- | --- |
| TIC TAC TOE | ✅ | ✅ | Works. Bot plays win/block/center — fine. |
| TTT 4×4 | ⚠️ | ✅ | **Solo mode unreachable — plays 3×3 instead** (GAMEPLAY-01). Logic itself correct. |
| ULTIMATE TTT | ✅ | ✅ | Works. Send-to-decided-board → play-anywhere handled; majority tie-break sensible. |
| CONNECT FOUR | ✅ | ✅ | Works. Center-biased bot with 20% jitter. |
| C4 FIVE (9×7) | ⚠️ | ✅ | **Solo mode unreachable** (GAMEPLAY-01). |
| C4 POP OUT | ✅ | ✅ | Works; bot never pops (P3). |
| GOMOKU | ✅ | ✅ | Freestyle rules (overlines count) — a legitimate variant, but the rules sheet should say so. Color-only stones (P2). |
| REVERSI | ✅ | ✅ | Auto-pass + "OPPONENT PASSED" note correct; both-stuck → count end correct. Corner-preferring bot is solid. |
| ORDER & CHAOS | ✅ | ✅ | Works; role labeling clear. Bot notes in P3. |
| SOS | ✅ | ✅ | Extra-turn on completion correct; tie → draw correct. Overlay noise (P2). |
| DOTS & BOXES 6×6 | ✅ | ✅ | Clinch-at-19 correct; extra-turn on box correct. |
| DOTS & BOXES 4×4 | ✅ | ✅ | Same engine, 9-clinch correct. |
| CHAIN REACTION 8×10 | ✅ | ✅ | Works; capture + corner/safety scoring — best bot in the set. |
| CHAIN REACTION 6×8 | ✅ | ✅ | Works; renders especially well on phone. |
| BLOCKADE | ✅ | ✅ | Pathfinding bot with wall-gain heuristic is genuinely strong; lockout fallback prevents soft-locks. |
| HEX 11×11 | ✅ | ✅ | Shortest-path win-check correct. Goal-edge contrast (P2) undermines teaching; bot is weak but acceptable. |
| BATTLESHIP | ✅ | ✅ | Hunt/target bot correct; per-ship placement flow works. |
| MANCALA | ✅ | ✅ | Sow/skip-opponent-store/capture/sweep all traced correct; greedy bot reasonable. |
| CHECKERS | ✅ | ✅ | Forced capture enforced in UI (only movable pieces selectable). Color-only discs (P2). |
| PIG (dice) | ✅ | ✅ | Hold-at-20 bot with behind-scaling. |

## 6. What checked out

- All 19 board win-detectors traced against the real rules — **zero logic bugs found**. (Past review passes in this repo found win-checker bugs; the current state is clean.)
- Pass/stalemate paths verified where the rules need them: Reversi auto-pass and both-stuck end, Blockade lockout fallback chain, Ultimate TTT play-anywhere.
- Ultimate TTT tie-break (majority of decided boards) and SOS/Dots-and-Boxes tie handling are deliberate, documented house rules — not flagged.
- Boards are real `<button>`s with aria-labels (spot-checked on 8 boards; `Cell.jsx` includes position + state in the label).
- Last-move ring (M-47) present on every registry-driven board.
- No console errors in any of the 20 automated sessions.

## 7. Suggested order of work

1. **GAMEPLAY-01:** ✅ **SHIPPED** — `DEMOS` entries added for `tictactoe4`, `connectfour5`, `dice-big`; verified live in the browser. Explicit not-available card shipped for future/demo-less types.
2. **GAMEPLAY-02:** ✅ **SHIPPED** — loser-first rematch starter (draw alternates) in `applyPlayAgain`/`applyNewMatch` via `firstMoverUpdates()`. Remaining: live two-identity verification.
3. **GAMEPLAY-03/04:** ✅ **SHIPPED** — Hex solid goal rails + direction arrows; side-letter glyphs in Hex/Gomoku/Checkers pieces. Theme sweep across all six dark themes: no contrast fixes needed.
4. **GAMEPLAY-05:** ✅ **SHIPPED** (line-fade; the score bar already existed). `RECENT_LINES = 6` starting value. Fade tiers verified in all six dark themes.
5. **GAMEPLAY-06:** ship UX-01 from the existing UX plan (amplifies everything above).
6. P3 bot nudges (C4-pop defense, Gomoku threat counting), optionally behind a difficulty toggle.

Steps 1–2 shipped; steps 3–5 remain presentation or one-line wiring — no Firebase schema changes, no changes inside `src/lib/*Logic.js` modules, so the unit-test surface stays untouched. Verification recorded for the shipped fixes: `npm test` 3214 passed, `npm run build` clean, `npm run lint` unchanged from baseline (42 pre-existing problems, identical with the fixes stashed).

## 8. Not covered

- Live two-player multiplayer (same-browser tabs share one `playerId` here, so two-player flows need separate browser profiles or devices).
- Real-time games (Pong, Snake, Tron, Sumo, Space Duel, Paint, Pac Mac, Air Hockey) — out of scope; board games only.
- Theme contrast was eyeballed on midnight only; the Hex/SOS fixes should be checked across all five themes when implemented.
- Feel/latency on real devices (animations verified visually only).
- The scripted harness played reasonable but not optimal lines; bot strength above "beatable" was assessed from code, not from win-rate measurement.

## 9. Review artifacts

| File | Purpose |
| --- | --- |
| `.lavish/gameplay-review/index.html` | Interactive review companion (open via `lavish-axi`) |
| `.lavish/gameplay-review/shots/solo-*.png` | 20 end-of-game screenshots (one per game played) |
| `.lavish/gameplay-review/evidence.json` | Capture conditions, per-game end-state text, console-error log |
| `.lavish/gameplay-review/capture*.mjs` | Scripted playtest harness (Playwright; review helper, not project tooling) |
