# Arrows Puzzle — Review and Improvement Plan

> **Direction: keep the shared-board tap duel and mockup look; close the match correctly, make traps readable, and tighten feel under lag before adding more levels.**

- **Review date:** September 19, 2026.
- **Status:** Review and proposed improvement backlog; application changes have **not** been implemented (unless noted elsewhere).
- **Live:** https://game-night-91464.web.app — pick **ARROWS PUZZLE** in a room.
- **PRD:** [docs/prds/arrows-puzzle.md](prds/arrows-puzzle.md)
- **Also listed in:** [README.md Improvement backlog](../README.md#improvement-backlog)

This document preserves the findings and prioritized improvements from the September 19 play/source review. It is a dated snapshot, not proof that the recommendations have shipped.

## Contents

1. [Verdict](#1-verdict)
2. [What’s working](#2-whats-working)
3. [Prioritized improvements](#3-prioritized-improvements)
4. [Suggested ship slices](#4-suggested-ship-slices)
5. [Source map](#5-source-map)
6. [Not covered](#6-not-covered)

## 1. Verdict

Solid first ship: shared-board tap duel feels distinct, the mockup look lands, and the core loop (clear vs trap, lives, best-of-3 tiers) is clear. The biggest gaps are **match end rules**, **trap readability**, and a few **feel/fairness** issues under lag.

## 2. What’s working

- **Identity** — One shared board both players race is a clean pitch vs turn-based puzzles.
- **Visual craft** — Dot grid, rounded snakes, outline heads, flow-out, blocked shake match the approved Lavish look.
- **Fair arbitration** — Taps go through a Firebase transaction so same-arrow races resolve cleanly.
- **Match shape** — Easy → medium → hard with first to 2 round wins is easy to explain.
- **Safety net** — Levels are validated (counts, one trap each, no overlaps); logic is well unit-tested.

## 3. Prioritized improvements

### High

#### ARROWS-A — Match closure after 3 rounds

**PRD:** After 3 rounds, if nobody has 2 wins, **the match is a draw**.

**Issue:** “Play again” after the hard round can fall through into a **new easy board while match scores keep climbing** — so a 1–1 or 1–0 after three rounds doesn’t cleanly end as a drawn (or decided) match.

**Fix:** After round 3, if neither side has 2 wins, force match draw (or declare the higher score the winner if that house rule is preferred), and only then show New Match / Share — never a 4th tier-less rematch mid-score.

#### ARROWS-B — Trap readability

Blocked arrows look like every other snake until you tap them. That makes the game “memory of pain” more than “read the board.”

**Options (pick one tone):**

- Soft tell: slightly darker tip, dashed stroke, or tiny “X” at the head
- Hard tell: only after first trap of the match (teach once, then hide)
- Skill tell: blocked heads that point into a wall / another body (geometry as clue) — bigger design lift, best long-term

Also add a first-match tip: “One arrow is a trap — three lives.”

### Medium

#### ARROWS-C — Feel under lag (audio + hit targets)

Hit/miss audio fires **before** the tap is confirmed. On a failed or raced tap you can hear a clear that didn’t stick.

**Fix:** Play sound from the transaction result (or a confirmed local echo), and optionally flash a brief “stolen” state when the opponent took that arrow first.

Hit area is a thick stroke on the path only. Short stubs and crowded hard boards feel unfair on phones.

**Fix:** Slightly larger invisible hit pad (or pad around head + last segment); optional brief press scale so feedback isn’t only audio.

#### ARROWS-D — Round rhythm / coaching

Round banner is only `ROUND N · EASY`. No level name, no “first to 2,” no beat between rounds.

**Add:**

- Level label under the round line (e.g. `TIGHT PACK`)
- Short interstitial: “MEDIUM — 10 arrows · 1 trap” for ~1s on round start
- First-match tip (see ARROWS-B)

#### ARROWS-E — Spectator / out-of-lives experience

Spectators get clears but not lives or who’s still hunting. Out-of-lives players only get a text line while the board keeps racing.

**Fix:** Keep the full HUD for spectators and KO’d players; dim their side and label `OUT`.

### Product / v2

#### ARROWS-F — Depth of the trap system

Static one-trap-per-level is fine for v1; it will get predictable once people learn the roster.

**Next content levers:**

- 0–2 traps on hard
- Dynamic unblock (“clear me to free that head”) — already noted in the PRD
- Ban recently played level ids in a room so rematches feel fresh

#### ARROWS-G — Solo / teach mode

No demo bot means discovery is “find a friend or bounce.” A short solo practice board (same rules, no match score) would teach traps without social friction.

### Low / ongoing

#### ARROWS-H — Accessibility polish

- Prefer `pointerdown` / touch with `touch-action: manipulation` to cut tap delay
- Announce clears/lives to screen readers beyond `Arrow N`
- Hearts are tiny (~10px) — enlarge slightly for glanceability

#### ARROWS-I — Hard-tier balance

Easy = 5, medium = 10, hard = 16 with **exactly one** trap each. Hard is mostly density, not new decisions.

**Try:** more traps on hard, or fewer clearable arrows but messier routing so reading exit direction matters more than raw click speed.

## 4. Suggested ship slices

| Slice | Outcome |
|--------|---------|
| **A. Match closure** | After 3 rounds, force match result; no accidental 4th round |
| **B. Trap readability** | Soft visual tell + first-round tip |
| **C. Feel under lag** | Confirm-before-sound + better hit targets |
| **D. Solo practice** | One demo board for learning |

Do **A → B → C** before more levels. Content without match closure and trap readability will feel unfinished even if the boards look great.

## 5. Source map

| Area | Path |
|------|------|
| Logic | `src/lib/arrowsLogic.js` |
| Levels (15) | `src/lib/levels/arrows/index.js` |
| Tests | `src/lib/arrowsLogic.test.js` |
| Board UI | `src/components/ArrowsBoard.jsx` |
| Page / HUD | `src/pages/ArrowsGame.jsx` |
| Registry | `src/lib/games.js` (`type: 'arrows'`) |
| Rules copy | `src/lib/rules.js` |
| Shake CSS | `src/index.css` (`.arrows-group.blocked-shake`) |
| PRD | `docs/prds/arrows-puzzle.md` |

## 6. Not covered

- Live two-device playtest of race conditions and RTT feel
- Per-theme contrast pass for trap tells (once designed)
- Full `review-a-game` checklist on other reflex titles
