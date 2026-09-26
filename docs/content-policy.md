# Content policy — party decks and the moderation denylist

**Version 2 (2026-09).** Game Night is a party game for friends, family and mixed-age groups. Anything a game deals, reveals or lets another player see should be fine on a shared screen.

This policy covers:

- the **party decks** in `src/lib/decks/` (Spyfair, Wavelength and the other party decks);
- the **moderation denylist** in `src/lib/moderationDenylist.js`.

Word-game dictionaries are out of scope here. Word Hunt, the Wordle lists and Anagrams are owned separately.

## Moderation denylist (`src/lib/moderationDenylist.js`)

The denylist is a pure module that exports:

- `DENYLIST`: a Set of normalized lowercase words;
- `isDenied(word)`;
- `normalizeForDenylist(word)`.

It is meant for chat and display-name moderation. Any word list can reuse it. It is not wired into any game yet.

**What goes in:** slurs (racial, ethnic, homophobic, transphobic, ableist, misogynist), strong profanity, and explicit sexual terms.

- If a word is ambiguous but is used mostly as a slur ("coon", "chink"), it goes in.
- Mild words ("crap", "hell", "damn", "sex") and anatomical terms stay out. A consumer that needs a stricter bar layers its own list on top.

**How matching works:**

- `isDenied` compares **whole words**. It ignores case, accents, punctuation, look-alike characters (`sh1t`, `a$$hole`) and stretched letters (`fuuuck`).
- It never matches substrings, so "therapist", "cocktail" and "Scunthorpe" pass.
- A caller moderating a sentence splits it into words first.
- Every inflection that should be blocked is listed explicitly. There is no suffix stripping, because a generic rule makes "spicy", "spiced" and "japes" false positives.

**Adding a term:** add it and its inflections to the right group (`SLURS`, `PROFANITY`, `SEXUAL`). Keep each entry lowercase a–z. The test suite checks normalization and a list of innocent look-alikes that must keep passing. Add any new near-miss you find to that list.

## Party decks (`src/lib/decks/`)

Deck content (locations, roles, spectra, prompts) follows these rules:

- **No denylisted or crude content.** Keep it suitable for a mixed-age table.
- **Common, recognisable content.** Every player should understand every card without looking anything up.
- **Short labels that fit the UI:**
  - Spyfair location names: at most 16 characters, A–Z and spaces only.
  - Spyfair roles: at most 24 characters.
  - Wavelength end labels: at most 16 characters, uppercase.
- **Clues can name real people and places.** Wavelength clues are hints, not answers. Spyfair location names must not appear in the bot chat templates (`src/lib/decks/spyfairChat.js`); a test enforces this.

### Stability: append, don't reorder

Rooms store an **index** into these decks:

- Spyfall uses `locationIndex`;
- Wavelength uses `spectrumIndex`.

If an index changes meaning, live rooms break. Therefore:

- Append new entries at the end.
- Never delete or reorder existing entries.
- To retire an entry, overwrite it in place with a replacement of the same shape.
- Tests pin anchor indexes.

### Minimum counts (enforced by tests)

| Deck | Floor | Shape |
|---|---|---|
| Spyfair (`spyfair.js`) | 50 locations | `{ name, roles }`: at least 6 distinct roles (ship 7) |
| Wavelength (`wavelength.js`) | 100 spectra | `{ left, right, clueBank }`: at least 3 clues with integer `pos` 0–100, reaching both halves of the dial. No duplicate or mirrored spectra. |

## Adding deck content

1. Append the entry to the deck using the same shape.
2. Run `npx vitest run src/lib/decks src/lib/wavelengthLogic.test.js src/lib/partyBots.test.js`. These tests enforce counts, uniqueness, schema, label length, index anchors and the chat-template check.
3. Record any change to these rules by bumping the version at the top of this file.
