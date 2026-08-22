# Source Reviews — August 2026

This directory holds the sixteen independent review reports behind [`docs/REVIEW-2026-08.md`](../../REVIEW-2026-08.md), copied byte-for-byte from the review session. Every finding in the consolidated document traces back to one of these files.

These reports are a snapshot taken on 22 August 2026. Findings describe the code as it stood that day. **Verify any finding against the current code before acting on it** — a fixed bug still reads as broken here. Start from `docs/REVIEW-2026-08.md`; read an individual report only when working on what it covers.

**Start with [`docs/REVIEW-2026-08.md`](../../REVIEW-2026-08.md)** — it synthesizes, ranks, and cross-references all sixteen. Read a source file directly only when you need a specific finding's full context or file:line detail.

## Files

| File | Lens | Covers | Roughly found |
|---|---|---|---|
| `correctness-strategy.md` | Correctness | Turn-based strategy games (TTT+4×4, Ultimate TTT, Connect Four variants, Gomoku, Reversi, Order and Chaos, Hex, Dots and Boxes, SOS, Chain Reaction, Blockade, Battleship, Mancala) | Reversi freeze bug, TTT 4×4 bot logic error, Mancala pit-corruption bug, `npm test` failures |
| `correctness-arcade.md` | Correctness | Real-time arcade (Pong, Snake, Tron, Sumo, Space Duel, PAC MAC, Paint Turf, Mine Race) — logic/arenas/pages/demos | Mine Race keyboard-unreachable board, other ranked findings |
| `correctness-party.md` | Correctness | Party/word/trivia (Wavelength, Fibbage, Spyfair, Two Truths, Bluff Battle, Herd Mind, Trivia Blitz, Word Duel, Word Hunt, Hangwoman, Sketch) | Word Hunt dictionary has no profanity/slur filter, other ranked findings |
| `correctness-solo.md` | Correctness | Solo/reflex/memory (Simon, Chimp Test, Visual Memory, Number Memory, Reaction Time, Aim Trainer, Typing Race, Mental Math, Pairs, Dice) + Daily Challenge + Leaderboard | Ranked findings across the skill games and the retention layer |
| `design-chain-reaction-ttt-connect4.md` | Game design | Chain Reaction, Tic Tac Toe (+4×4, Ultimate), Connect Four (+variants) | Cut candidates identified (TTT 4×4, Connect Four 5-in-a-row) as depth-free duplicates |
| `design-strategy.md` | Game design | Gomoku, Reversi, Order and Chaos, Hex, Dots and Boxes, SOS, Blockade, Battleship, Mancala | Ranked best-to-worst as games |
| `design-arcade.md` | Game design | Real-time arcade logic files | Ranked best-to-worst as games |
| `design-party.md` | Game design | Party/word/trivia games | Design verdicts per game |
| `design-solo.md` | Game design | Solo/reflex/memory games + Daily Challenge + Leaderboard as retention features | No depth-free duplicates found (unlike strategy set); retention layer flagged as broken |
| `design-platform-loop.md` | Game design (retention lens) | Platform as a product — Game.jsx, GameStatus.jsx, WinEffect.jsx, profile.js, leaderboard.js, daily.js, DailyGame.jsx, Onboarding.jsx, social.js, games.js registry | 5-Component Filter applied at platform level |
| `engine-arena.md` | Engine implementation | Real-time arena games — logic, arenas, controls hooks, pages, demos | Ranked engine findings |
| `engine-board.md` | Engine implementation | Turn-based board game engines — Board components, `src/lib/` logic modules, Game.jsx, games.js | Ranked engine findings |
| `interface-entry.md` | UX/interface | Home, Onboarding, Demo, DailyGame, NotFound, catalogue components, `/solo/:type` | New findings beyond the already-implemented UX-IMPROVEMENTS/MOBILE-UX-AUDIT ground |
| `interface-game-room.md` | UX/interface | Game.jsx shell, room furniture, invite trio, input helpers, end-of-match path, WaitingRoom.jsx | Back-gesture/modal-history regression, other room-level findings |
| `interface-social.md` | UX/interface | Profile, Friends, Avatar/AvatarCustomizer, social/avatars/leaderboard/favorites data, AuthContext, NavBar/BottomTabBar | Social layer findings, notes stale doc references (NavBar profile chip superseded by BottomTabBar) |
| `interface-accessibility.md` | UX/interface (cross-cutting) | Shared foundations (index.css, tailwind.config.js), 15+ sampled components, hooks, loading components | `--c-dim` contrast failure across themes, TicTacToe missing focus ring, other a11y findings |

## A note on the files

Each file above is an unedited, byte-identical copy of its source `report.md`. Every one already opens with its own lens and scope statement, so no header was added — adding one would have duplicated what the report already says. None of the reports carry an explicit date; treat "August 2026" (the review cycle name) as the date for all sixteen.

## The gap

**The input, timing, audio, and hooks layer was never reviewed.** A seventeenth reviewer (`ge-input-s1`), scoped to `src/hooks/`, the sound layer, `src/components/loading/`, and `EmoteBar.jsx`, was torn down before it produced a report. There is no file for it in this directory because none exists — this is not an omission from the archive, it's a gap in the review itself.

Treat every reflex/timing game's actual feel, and every game's audio/input-latency behavior, as **unverified**, not as passing. See `docs/REVIEW-2026-08.md` §7 for the same note in context.
