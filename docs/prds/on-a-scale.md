# PRD: ON A SCALE (inspired by ito)

## Summary

Each player gets a secret number from 1 to 100 and the team gets a theme, for example "Things
to bring to a desert island: 1 = useless, 100 = essential". Each of you types an answer that
expresses your number on that scale. Then, together, you put all the answers in order from
lowest to highest. Every answer that lands out of order costs a life.

- **The twist:** you are calibrating to your partner's sense of scale. Is "a hammock" a 40 or
  a 75? Hidden numbers stop one player from ordering everything alone, and the reveal is a
  shared laugh ("you thought a spoon was an 80?").
- Players: 2 (co-op; the same logic scales to 3–8 later). Category: `word`. Netcode: RTDB
  event-based.
- Effort: **S–M**. The real cost is writing about 150 theme prompts.

## Rules

1. A game is a ladder of three levels. Level 1 deals 1 number to each player, level 2 deals 2,
   level 3 deals 3. Numbers are drawn from 1–100 without repeats.
2. Each level draws one theme card: a prompt plus labelled ends (1 = …, 100 = …).
3. Each player types one answer per number (2–30 characters, family-safe). Answers lock in when
   the player taps READY; nobody sees the other's answers until both are ready.
4. Ordering: both see every answer as a chip. Either player drags chips into a single row; the
   row is shared live. When both tap CONFIRM on the same order, numbers are revealed.
5. Scoring: count the chips that sit in a position where the sequence breaks (a chip higher than
   its right neighbour). Each break costs one of 3 shared lives.
6. Clearing a level with no breaks earns back one life (max 3). Reaching 0 lives loses the game;
   finishing level 3 with at least 1 life wins it.
7. No saying numbers aloud. Talking about the answers is encouraged.

## Data model & architecture

`custom: true, coop: true, hidePlayerCards: true` registry entry (`gameType: 'onascale'`), page
`src/pages/OnAScaleGame.jsx`, logic `src/lib/onAScaleLogic.js`, deck `src/lib/decks/onAScale.js`.
Add `'onascale'` to `COOP_GAMES` in `src/lib/matchRules.js`.

All state under `round` (no `FIELD_NULLS` or rules changes):

```
round: {
  phase: 'setup' | 'write' | 'order' | 'reveal' | 'done',
  level: 1..3, lives: 0..3, themeIndex, usedThemes: number[],
  numbers: { X: number[], O: number[] },   // plaintext; co-op honour system
  answers: { X: string[], O: string[] }, ready: { X, O },
  order: [{ seat, i }],                     // shared chip order
  confirm: { X, O }, breaks: number | null,
  result: { outcome, level } | null,
}
```

Lanterns/Docking pattern: `freshGameState` returns `round: null`; the page deals level 1 in a
`runTransaction` on first view (SetupChoices: STANDARD / GENTLE, where GENTLE starts with 4
lives). Every write (answer, ready, reorder, confirm) is a transaction through pure helpers
(`applyAnswer`, `applyOrder`, `applyConfirm`, `scoreOrder`). A reorder clears both confirms.
A win adds +1 to both `scores`. Reuse `TeamRoundShell.jsx` for header, setup and end actions.

**Deck.** `src/lib/decks/onAScale.js` exports ~150 `{ prompt, low, high }` entries, all
original. Every entry must pass `isFamilySafe` and none may trip `isBannedWord`
(`src/lib/wordDenylist.js`); a vitest check enforces both. Copy the bundle-leak caveat comment
from `src/lib/decks/fibbage.js` to the top of the deck file. Player answers go through
`sanitizeDisplayName`-style trimming and `isBannedWord` before they are written. Load the deck
lazily with the page chunk (it must not enter the entry bundle).

## UI/UX

- 390 px portrait. Theme card at the top in a `border-retro-cta` frame with its two ends.
- Write phase: your number(s) as big pixel digits with a "SECRET" label, one text field per
  number, READY (LOCKING…). Partner status shows WRITING / READY.
- Order phase: chips in a vertical list (easier than horizontal at 390 px), drag handles plus
  ▲/▼ buttons for keyboard and one-thumb use. Each chip shows the author's seat badge (X/O
  letter, not colour alone).
- Reveal: numbers flip in order, 300 ms apart; a break shows a "✕" glyph between chips and a
  heart drops from the lives row.
- Hearts row uses glyphs (♥ / ♡) plus a count.

## AI / demo mode

`/demo/onascale` pairs you with a bot partner that answers from a small hand-written table of
reference answers per theme (low/mid/high) and orders chips by your number estimate. Keep it
optional; the game's appeal is the human partner.

## Trust model & edge cases

- Numbers are in the world-readable room. In co-op, peeking only spoils your own game.
- Answers are user-generated text shown to the partner: run the denylist, cap length at 30,
  and reuse the room chat's moderation path for reports.
- Partner offline: the level pauses; no CLAIM WIN. A partner who never readies can be waited on
  or the room can switch games.
- Reorder races: last transaction wins and both confirms reset, so no stale confirm lands.

## Testing

Vitest: number deal has no repeats and the right count per level; `scoreOrder` counts breaks
correctly on fixtures (sorted, one swap, fully reversed, equal-adjacent impossible); lives and
life refund; win and loss conditions; confirm reset on reorder; deck entries all family-safe and
unique. E2E (`tests/e2e/on-a-scale.spec.js`): both write, both confirm, both see the same
reveal and lives.

## Milestones

1. Logic + tests (half day).
2. Deck writing and review (1 day; the main cost).
3. Page with write/order/reveal and a touch-friendly reorder (1 day).
4. Registry, icon, rules text, e2e (half day).

## IP notes

ito (Arclight, 2019) is a brand and its theme cards are its content. Use the ON A SCALE name,
write every theme ourselves, and do not reuse ito's card list, the "ito" wordmark or its art.
Do not frame it as "ito online". The mechanic (hidden numbers expressed through a theme) is free.

## Open questions

- Ship a 3–8 player party variant from day one (the logic already generalises) or keep 2P?
- Should a level's theme be pickable from two draws? Lean: yes, a small "SWAP THEME" once per
  game keeps odd prompts from stalling a round.
