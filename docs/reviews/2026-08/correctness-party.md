# Party / Word / Trivia games review

Games covered: Wavelength, Fibbage (+demo), Spyfair (+demo), Two Truths, Bluff Battle, Herd Mind (+demo), Trivia Blitz (+demo), Word Duel, Word Hunt, Hangwoman, Sketch.

## Ranked findings

| # | Game | Finding | Severity | Effort |
|---|------|---------|----------|--------|
| 1 | Word Hunt | Unfiltered 125k-word list (`public/wordhunt-dict.txt`) includes slurs and profanity as scoreable words — spot-check found `nigger`, `cunt`, `fuck`, `shit`, `slut`, `whore` all present and valid | broken | medium |
| 2 | Herd Mind | No commit-reveal for round answers — plaintext is written to `round/answers/{uid}` the instant a player submits, before the 45s answering window ends for everyone else. A player with devtools/network tab open mid-round can read others' answers and conform before their own deadline, defeating the entire "guess the majority" premise | weak-broken | medium |
| 3 | Fibbage / Word Duel decks | Fibbage deck is only 26 prompts; Trivia deck is 60 questions (10/match ⇒ deck exhausted in 6 matches) — both decks' own header comments admit they're "starter" sets meant to expand. Fastest to feel repetitive of anything in this set | weak | small (content only) |
| 4 | Sketch | `commitment.salt` is published to Firebase the instant the artist picks a word (not withheld to reveal like Hangwoman/Wavelength/Bluff). With only 3 candidate words offered per round, a player can hash all 3 against the public hash client-side and read the word before/while drawing. **Already documented and consciously accepted** in `sketchLogic.js`/`decks/sketch.js` as a necessary tradeoff (guessers need client-side guess verification with no server) — flagging for completeness per the captain's ask, not a fresh bug | polish (documented) | large (would need a trusted server to actually fix) |
| 5 | Fibbage bot | `pickBotLie` always answers from a fixed 2–3 preset `decoys` array per prompt (never generates freeform text). With a small deck, a repeat group will start recognizing "that's always the bot's lie for this prompt" after a couple of sessions | polish | medium |
| 6 | Two Truths | No dedicated logic module or `.test.js` — all commit-reveal/scoring logic lives inline in the 535-line `TwoTruthsGame.jsx`. Only game in this set with zero unit coverage | weak (test gap) | medium |
| 7 | Word Hunt | Shared words found by both players still each score independently — no cancel-on-overlap like classic 2-player Boggle. Rewards "type common short words fast," a fairly shallow dominant strategy | polish | small |
| 8 | Word Duel / Word Hunt | `dictionary.js`'s answer list (`Google 20k ∩ 5-letter words`) also carries a handful of crude words (`bitch`, `whore`, `dicks`, `penis`, `nazis`, `fucks`, `kills`, `boobs`) a setter could deliberately choose as the secret word in Word Duel | polish | small |
| 9 | Bluff Battle | Strictly 2-player, no bot/demo — can't be tried solo, unlike every other game in this set except Word Duel/Word Hunt/Sketch/Two Truths | polish | medium (would need a bot) |

## Detail

**#1 Word Hunt — unfiltered word list** (`public/wordhunt-dict.txt`, loaded by `src/lib/wordhuntDictionary.js`). The list is a raw ~125k-entry Scrabble-style corpus with no profanity/slur filter. Because Word Hunt scores *any* word a player can trace and find on the shared grid (`wordhuntLogic.js:81` `findPath`, `scoreWord` at `:111`), a slur or crude word landing on the board is directly playable and displayed in the found-words list to both players — not opt-in the way Hangwoman's player-set word is. Fix: filter the word list once at build/asset-prep time (a standard denylist pass), no logic change needed.

**#2 Herd Mind — live answer leak** (`herdLogic.js` header comment claims "hidden by the UI until reveal"; `src/pages/HerdGame.jsx:185` writes `round/answers/{mySeat}` on submit). Unlike every other hidden-info game in this set (Hangwoman `hangmanLogic.js`, Wavelength `WavelengthGame.jsx:184-190`, Bluff Battle `BluffBattleGame.jsx:140`, Word Duel `WordDuelGame.jsx:284`) which all use salted commit-reveal so the secret never touches the DB before reveal, Herd Mind writes the plaintext answer live. A player watching the Firebase console during the 45s window sees every submitted answer as it lands, in time to change their own before the deadline. Fix: same commit-reveal pattern as the other games — commit a hash on submit, reveal-and-verify once everyone's answered.

**#3 Content volume** — `decks/fibbage.js:18` ships 26 prompts (comment: "v1"), `decks/trivia.js:9` ships 60 questions at 10/match (comment: "expand toward 200+ later"). Both already flagged by their own authors as starter content; a group playing more than a handful of matches in one evening will start seeing repeats. Wavelength (31 pairs) and Herd Mind (150+ prompts) are in much better shape by comparison.

**#4 Sketch salt-reveal timing** — see table; this is an already-documented, deliberate tradeoff (`sketchLogic.js:18-23`, `decks/sketch.js:9-20`), included here only because the captain's brief specifically asked to compare hidden-info handling across Spyfair/Bluff/Fibbage/Sketch. No action needed beyond what the team already knows.

**#5 Fibbage bot predictability** — `partyBots.js:120-126` `pickBotLie` draws only from each prompt's fixed `decoys` list (2-3 entries, see `decks/fibbage.js`). Combined with the small deck (#3), a bot's lie for a given prompt is one of at most 3 fixed strings across every play session — a repeat group will start memorizing "the bot always says X for this one."

**#6 Two Truths test gap** — `src/pages/TwoTruthsGame.jsx` (535 lines) contains all commit/reveal/score logic inline; there is no `twoTruthsLogic.js` and no test file. Every other hidden-info game in this set (Hangwoman, Wavelength, Bluff Battle, Word Duel, Sketch, Fibbage) has its core logic extracted to a pure, unit-tested module. Worth extracting the commit/score/round-advance logic the same way.

**#7 Word Hunt shared-word scoring** — `wordhuntLogic.js` has no concept of "found by both players" cancellation; `scoreWords` (`:123`) just sums independently. Classic multiplayer Boggle cancels overlapping finds specifically to reward players for finding *different* words, not just fast ones. Current implementation rewards typing speed on common short words over vocabulary breadth. Not wrong, just shallower than it could be.

**#8 Word Duel/dictionary crude words** — see table. Lower severity than #1 because it requires a setter to deliberately type the word (not auto-generated), same as Hangwoman's free-text setter word — arguably acceptable player-agency the way Hangwoman's is, listed as polish rather than broken.

**#9 Bluff Battle no bot** — confirmed via `src/pages/BluffBattleGame.jsx`: no bot logic, no `BluffDemo` page exists. Purely 2-player PvP.

## Games found genuinely good (no action needed)

- **Wavelength** (`wavelengthLogic.js`) — clean commit-reveal, well-tested seat rotation/online-guesser edge cases, 31 solid content pairs, no first-mover bias (clue-giver rotates).
- **Hangwoman** (`hangmanLogic.js`) — reference implementation for this whole codebase's hidden-info pattern; already covered in CLAUDE.md.
- **Bluff Battle** (`bluffLogic.js`) — correct Perudo-lite rules (documented simplification: no switch-to-ones), full commit-reveal on both dice cups, thorough tests, clean endgame/dice-loss wiring.
- **Fibbage** (`fibbageLogic.js`) — anonymized ballot + withheld author map is a careful design; self-vote is properly blocked in the UI (`FibbageGame.jsx:494`); only the deck size (#3) holds it back.
- **Trivia Blitz** (`triviaLogic.js`) — speed/streak scoring is well-specified and well-tested; only content volume (#3) is a gap.
- **Spyfair** — 24-location classic Spyfall set, documented residual-leak model consistent with the rest of the codebase, role assignment is fair and collision-free up to 8 players.

## Test coverage gaps

- Two Truths: no logic module, no tests at all (see #6).
- Everything else in this set (Wavelength, Fibbage, Bluff, Herd, Trivia, Word Duel, Word Hunt, Hangwoman, Sketch, Spyfair decks) has thorough, targeted `.test.js` coverage — ran all 12 relevant suites read-only, 340/340 passing.

## Could not assess by reading

- **Actual bot "feel"/convincingness** in live play (Fibbage lie plausibility, Spyfair questioning flow, Herd Mind demo pacing) — logic was inspected but no dev server/browser was used per instructions, so subjective game-feel (animation timing, whether a round's ending "lands") is untested.
- **Real-world group-size behavior** at the configured extremes (3 vs 8 for Wavelength/Fibbage/Spyfair/Herd) — `minPlayers`/`maxPlayers` are enforced in `games.js`, but I didn't run a live 8-player room to check for UI crowding or pacing problems at the max.
- Accessibility (colour-only state, timing adjustability) was not deeply audited — a pass focused specifically on contrast/ARIA in these 11 games would need the browser, which was out of scope here.

## One-line shell note

Not otherwise in scope, but noticed in passing: `GamePicker`'s per-game badges (`WL`, `FB`, `SF`, etc.) are the only place several of these games' identity shows on the "switch game" screen — outside `UX-IMPROVEMENTS.md`'s territory, not chasing further.
