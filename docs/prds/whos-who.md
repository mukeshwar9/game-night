# PRD: WHO'S WHO (inspired by Similo)

## Summary

Twelve pixel characters sit on the table. One of them is the secret, known only to the
clue-giver. The clue-giver may not speak about it; each round they play a single character
card from a private hand and mark it **ALIKE** or **UNLIKE** the secret. The guesser must then
send characters home, 1, then 2, then 3, then 4, then 1, and wins if the secret is still on
the table at the end.

- **The twist:** the clue channel is one card. A shared hat colour, a similar grin or the same
  background can each be "alike", so both players are reading the same picture through two
  different minds. Roles swap every game.
- Players: 2 (co-op). Category: party-lite / deduction (`board`). Netcode: RTDB turn-based.
- Effort: **S–M**. Zero art cost: the characters are the app's own procedural avatars.

## Rules

1. Deal 12 characters face up in a 4×3 grid from a seeded draw of avatar keys. One is the
   secret, chosen at random and visible only on the clue-giver's screen.
2. The clue-giver holds a private hand of 5 more characters (never the secret, never one on the
   table). After each clue they draw back up to 5 from a seeded 20-card pool.
3. A round: the clue-giver plays one hand card face up beside the grid, marked ALIKE (it shares
   something with the secret) or UNLIKE (it does not). ALIKE cards sit vertically, UNLIKE
   horizontally, so the history reads at a glance.
4. The guesser then removes exactly N characters from the grid: N = 1, 2, 3, 4, 1 across the
   five rounds. Removed characters stay visible, greyed, so both can reason about them.
5. If the guesser removes the secret at any point, the game ends as a loss. If the secret
   survives round 5, it is the last character standing (12 − 11 = 1) and the team wins.
6. No talking about the secret. The guesser may think aloud; the clue-giver may only play cards.
7. PLAY AGAIN swaps roles. A match is three games; the team score is games won.

## Data model & architecture

`custom: true, coop: true, hidePlayerCards: true` registry entry (`gameType: 'whoswho'`), page
`src/pages/WhosWhoGame.jsx`, logic `src/lib/whosWhoLogic.js`. Add `'whoswho'` to `COOP_GAMES`
in `src/lib/matchRules.js` (the matchRules test keeps it in sync with the registry flag).

All state lives under `round`, so `FIELD_NULLS` and `database.rules.json` need no change:

```
round: {
  phase: 'setup' | 'clue' | 'cut' | 'done',
  seed, giver: 'X' | 'O',
  table: string[12],        // avatar keys, fixed positions
  secret: number,           // index into table (plaintext; co-op honour system)
  hand: string[5], pool: string[], // giver's hand and remaining draw pile
  removed: boolean[12],
  clues: [{ card, alike: boolean }],
  roundNo: 1..5,
  result: { outcome: 'win' | 'loss', at } | null,
}
```

Follow the Lanterns/Docking pattern: `freshGameState('whoswho')` returns `round: null`; the page
shows `SetupChoices` (NORMAL · 12 characters / EASY · 9 characters on a 3×3) and deals inside a
`runTransaction` on first view. Each clue and each removal is a transaction guarded by
`applyClue` / `applyRemove` from the logic module (turn, count and phase checks). A win adds +1
to both `scores` in the same transaction. Reuse `TeamHeader`, `RoundEndActions` and
`SetupChoices` from `src/components/TeamRoundShell.jsx`.

Characters render with `Avatar` / `avatarSprites.js` (`src/lib/avatars.js` keys). The seeded draw
should prefer visually varied keys: pick across sprite families so every table has several
shared features and several distinct ones.

## UI/UX

- 390 px portrait, `max-w-md`. Top: `TeamHeader` with a role chip (CLUE-GIVER / GUESSER).
- Middle: the 4×3 grid, ~80 px tiles. The clue-giver's secret gets a dashed `border-retro-cta`
  frame **and** a "★ SECRET" label on their screen only (never colour alone).
- Clue strip: played cards in a horizontal scroller, each with an ALIKE "≈" or UNLIKE "≠" glyph
  badge and rotation (vertical vs horizontal) as a second cue.
- Guesser: tap tiles to mark for removal, a counter "REMOVE 2 · 1 MARKED", then SEND HOME
  (busy label SENDING…). Removed tiles grey out with a strike glyph.
- Clue-giver: hand of 5 at the bottom; tap a card, then ALIKE or UNLIKE (PLAYING…).
- Loss reveal: the secret's tile flips with a `shadow-neon-danger` ring and "THAT WAS THE ONE".

## AI / demo mode

`/demo/whoswho` with a bot clue-giver: score each hand card by the number of sprite features
(hat, hair, palette family, accessory) it shares with the secret; play the highest-overlap card
as ALIKE or the lowest-overlap card as UNLIKE, whichever is more extreme. A bot guesser removes
the tiles with the lowest feature-agreement with the clue history. Both bots are pure functions
in `whosWhoLogic.js`.

## Trust model & edge cases

- Rooms are readable by any signed-in user, so the secret sits in plaintext. In co-op, peeking
  only ruins your own game; state this in the HOW TO PLAY text.
- Partner offline: the table waits; no CLAIM WIN (coop games are exempt in `useAbandonRecovery`).
- Double tap on SEND HOME: the transaction rejects a removal whose count does not match the
  round's N.
- Spectators see the grid and clue strip but not the secret marker.

## Testing

Vitest (`whosWhoLogic.test.js`): seeded deal is deterministic and never puts the secret in the
hand or pool; removal counts 1/2/3/4/1 enforced; removing the secret ends in a loss at once; the
survivor after round 5 is always the secret on a win; clue legality (only hand cards, only in
the `clue` phase); role swap on PLAY AGAIN; bot scoring picks the expected card on a fixture.
E2E (`tests/e2e/whos-who.spec.js`): two contexts, giver plays ALIKE, guesser removes one, both
clients see the removal and the next clue phase.

## Milestones

1. Logic + tests + feature tagging of sprite keys (half day).
2. Page, grid, clue strip, removal flow (1 day).
3. Registry, icon, rules text, e2e spec, demo bots (half day).

## IP notes

Similo (Horrible Guild, 2019) is a published design and its card art is protected. Use our own
name (WHO'S WHO), our procedural avatars, our own round schedule wording and rules text. Do not
copy Similo's character sets (fairy tales, myths, animals), card frames or icons, and never use
"Similo" in UI or store copy.

## Open questions

- Should the clue-giver be allowed a single "pass" (discard and redraw) per game? Lean: yes,
  once, because an unlucky hand of look-alikes can make round 1 a coin flip.
- Offer a 3-player mode (two guessers must agree) later, or keep it strictly 2P?
