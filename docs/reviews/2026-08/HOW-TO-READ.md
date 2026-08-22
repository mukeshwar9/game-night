# How To Read This Archive

A new agent should not open sixteen reports and act on the first bug it finds. Read in this order.

1. **`AGENTS.md`** (repo root), first, always. Data model, conventions, how to add a game — the only file here that is always current.
2. **`.claude/rules/`**, before writing any code. Short and enforceable: never hardcode a colour, Firebase deletes nulls, every logic module ships with tests.
3. **[`docs/REVIEW-2026-08.md`](../../REVIEW-2026-08.md), the executive summary only.** One page says what is worth doing. Never start from the full source set below.
4. **One report from this directory, only when working on what it covers.** Fixing Word Hunt means reading `correctness-party.md` and `design-party.md` — nothing else. The other fourteen are reference, not reading.
5. **[`UX-IMPROVEMENTS.md`](../../UX-IMPROVEMENTS.md) and [`MOBILE-UX-AUDIT.md`](../../MOBILE-UX-AUDIT.md)**, to avoid redoing finished work. Both are fully implemented; their value now is showing what has already been decided.

## Verify before acting

A report says a file has a bug — open the file. If it is fixed, the report is history, not a task. These are dated findings, not a live issue tracker. See the note at the top of [`README.md`](README.md).

## Which report covers what

Four lenses, four-to-five files each:

| Lens | Question | Files |
|---|---|---|
| Correctness | Is it broken? | `correctness-strategy.md`, `correctness-arcade.md`, `correctness-party.md`, `correctness-solo.md` |
| Design | Is it worth playing? | `design-chain-reaction-ttt-connect4.md`, `design-strategy.md`, `design-arcade.md`, `design-party.md`, `design-solo.md`, `design-platform-loop.md` |
| Engine | Loops, rendering, latency | `engine-arena.md`, `engine-board.md` |
| Interface | Accessibility, contrast, touch, focus | `interface-entry.md`, `interface-game-room.md`, `interface-social.md`, `interface-accessibility.md` |

Full file-to-game mapping is in `README.md`'s table.

## The gap

The input, timing, audio, and hooks layer was never reviewed. Its silence is a gap, not a pass — treat every reflex/timing game's feel and every game's audio/input-latency behavior as unverified.
