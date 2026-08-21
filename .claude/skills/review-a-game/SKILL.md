---
name: review-a-game
description: Checklist for reviewing any game in this repo — win detection, stalemate/pass conditions, host/guest fairness in real-time games, hidden-info leaks, client-reported scores, content volume, color-only state, keyboard reachability. Distilled from four past review passes across the whole games platform. Use when asked to review, audit, or check a game for bugs before or after it ships.
user-invocable: true
---

# review-a-game

A checklist distilled from four review passes covering every game on the platform (arcade/real-time, party/word/trivia, solo/reflex/memory, turn-based strategy). Each item below is a recurring theme those passes actually found real bugs under — check it every time, don't skip because a game "looks fine."

## 1. Win detection against the real rules

Trace `getWinner`/the equivalent against the actual rules of the game being implemented, not just against its own test fixtures. Two concrete ways this has gone wrong here:
- A board's win-checker reused from a differently-shaped board (a 4×4 game's bot used the 3×3 win-checker — silently wrong for cells 9–15, and had zero test coverage to catch it).
- A doc comment describing the logic's behavior that doesn't match what the code does (an AI's "retreats near the edge" comment vs. code that always pushes toward the opponent).
Read the implementation, don't trust the comment or the variable names.

## 2. Stalemate and pass conditions

For any game where a player can legally have **zero moves** while the game isn't over (no legal move but opponent still has one), check there's an actual pass/skip path that advances `currentTurn` — not just a `getWinner` check that only runs *after* a move is submitted. A board that renders zero clickable cells for the player to move, with no auto-pass and no pass button, freezes the game indefinitely. This exact bug has shipped in this codebase (a board with correct "no moves for either side ends the game" logic, but with no proactive pass when only one side is stuck).

## 3. Host-versus-guest fairness in real-time games

Any game with `custom: true` / host-authoritative real-time sync (Pong-style, off the standard turn-based path) gets extra scrutiny:
- **Tie-break/contention resolution**: does simultaneous action resolution (two players hitting the same cell/target/pellet in the same tick) have a fixed iteration order that structurally favors the host (X) every time? (`for (const side of ['X','O'])` is the exact pattern to look for.)
- **Local prediction**: does the guest get local dead-reckoning of its own actor, or does every one of its own inputs round-trip through the host before rendering? On a tick-discrete/fatal-per-cell game (grid-based, not continuous-physics), a full round-trip before your own move renders is a real fairness and feel bug, not just a nicety.
- **Serve/first-move initiative**: does the round always start the same way relative to host/guest (e.g. always serving toward the guest), giving the host a repeatable opening edge?
- **Disconnect recovery**: does this game type get the same abandoned-opponent claim-win recovery every other game type has, or is it excluded by a `!isCustom`-style gate? If excluded, the only escape from a vanished opponent may be self-forfeit — which hands the vanished opponent the win.

## 4. Hidden information — genuinely hidden or merely not displayed?

For any game with a secret (a word, a role, a hand, a set of dice) check *where* the secret lives, not just whether the UI shows it:
- Is it committed via the salted-hash commit-reveal pattern (`src/lib/commit.js`, `sha256.js`) before being written to Firebase, the way Hangwoman/Wavelength/Bluff Battle/Battleship do it? Or is the plaintext written to a public RTDB node the instant it's chosen/submitted, readable by anyone with devtools open on the network tab (a real bug found in exactly this shape — a "hidden" answer field written live, before the reveal window)?
- If a `commit.salt` (or equivalent) is published before reveal, the commitment can potentially be brute-forced against a small closed set of candidates (e.g. a small fixed word list) — flag it, but check first whether it's already a documented, deliberate tradeoff (client-side guess verification needs no server) before writing it up as a fresh bug.
- Don't restate an already-documented, accepted tradeoff as a new finding — note it only if asked to compare hidden-info handling across games, and say plainly that no action is needed.

## 5. Client-reported scores

Does the client compute and write its own final score/stat directly (`increment()`, a raw WPM/accuracy calc, a raw hit count) with no server-side or opponent-side recheck? Contrast with games that keep the puzzle/seed server-side and only accept a position index or a transaction-recomputed result from a shared seed — those can't be trivially spoofed via devtools; games that let the client just declare victory can. For a friends-and-family product this is often low-severity, but name it plainly whenever found — it's an easy thing to silently accumulate across many games.

## 6. Content volume

For any deck/word-list/question-bank driven game, check the actual count against how fast a session burns through it (questions-per-match × expected matches-per-sitting). A deck whose own header comment says "starter set" or "v1, expand later" is worth flagging by count, not just by the comment — a repeat group will start seeing exact repeats within a handful of matches for anything under roughly 100 entries at typical per-match consumption.

Separately, for any large **imported word list** (dictionary, Scrabble corpus) — check whether it's been filtered for slurs/profanity before being made directly scoreable/visible to both players. An unfiltered list is a different class of problem than a small "not enough content yet" deck, and needs a denylist pass, not more content.

## 7. Color-only state

Scan board components for player/state distinctions that rely on color alone (e.g. two colored discs/stones/pieces with no letter, glyph, or shape difference). Games in this codebase that use a letter glyph (X/O, S/O) are the reference pattern; games that render plain colored circles/pieces are the ones to flag. This is a real accessibility gap for colorblind players, not just polish — call it out even when severity is scored "polish."

## 8. Keyboard reachability

For any interactive game surface (grid cells, targets, cards), check that elements are real focusable/keyboard-operable controls (`<button>`, or a `div` with correct `role`, `tabIndex`, and `onKeyDown`) — not a `div` with only `onClick` and an ARIA role that has no keyboard path and, if using a `role="gridcell"`-style role, no correct ancestor structure (`role="grid"` etc.). Compare the live multiplayer game against its own `/demo` bot-play page if one exists — a regression where the demo does this correctly and the real game doesn't has happened here before.

## Reporting findings

- State the concrete failure scenario (what input/state produces the wrong output or hang), not just "logic looks off."
- Distinguish a real bug from a documented, deliberate design choice (a house-rule tie-break, an accepted trust-model tradeoff) — read for an existing comment or test asserting the behavior before flagging it as a finding.
- Note test-coverage gaps for anything you couldn't verify by tracing the code, and say explicitly what you could not assess without running the app in a browser (real-time feel, animation timing, actual two-network P2P behavior) — this review method is read-only and does not substitute for live testing on those axes.
