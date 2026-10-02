# New memory games: design brief

Shaped with the impeccable `shape` flow (2026-10-02) for the memory shelf audit
(`games-memory-audit-s1`). PRODUCT.md holds the product truth. There was no
interview round: the captain's request ("make all the recommended changes,
including the games") is the brief, and the assumptions are marked.

## Shared direction

- **Visual authority: the established Game Night world.** These are features inside
  an existing surface, so they inherit it: theme tokens, pixel lettering, the
  `retro-*` component vocabulary, and the Pairs-style fixed palette wherever an
  object must look the same on every theme. No new identity.
- **Mode: Experience.** The board leads. Chrome is limited to a one-line status and
  a score strip, as in the existing memory runs.
- **One authored moment per game:** the reveal (the instant the thing to remember
  appears or changes). It gets the motion budget; everything else stays still.
- **Shared engine.** Every game ships a solo run (3 lives, beat your best, kept on
  the account) and an online duel built on the same rules as Chimp and Visual
  Memory. Both players get the same seeded deal after a shared 3-2-1, and
  `resolveLevelRace` (or a score race for the stream games) decides the round.
  Same deal, same clock, same information.
- **Phone first:** 390 px portrait, touch targets of 44 px or more, colour never
  the only cue, and reduced motion respected (the shuffle shows its swaps as
  steps instead of slides).

## The seven games

### 1. Verbal Memory (`verbalmemory`): SEEN or NEW
- **Job:** a 2-minute word-memory run. A word appears; tap SEEN if it has come up
  before in this run, NEW if not.
- **Focal moment:** the word card flips in. Feedback is a short green or red edge
  on the card plus a sound.
- **Rules:** 3 lives; the score is the number of correct answers; repeats grow more
  likely as the run goes on. Words come from the family-safe deck lists.
- **Duel:** the same seeded stream. Each player plays until out of lives and the
  higher score wins (a score race).
- **Reference:** Human Benchmark, Verbal Memory.

### 2. N-Back (`nback`): MATCH or not
- **Job:** a stream of lit cells on a 3×3 grid; tap MATCH when the lit cell is the
  same as the one *n* steps back.
- **Focal moment:** each step's cell lights with a short pulse; the current *n* is
  always visible.
- **Rules:** blocks of 20 steps. Six or more hits with at most 2 errors raises *n*
  (starting at 1). An error is a miss or a false alarm, and each error costs a
  life (3 lives). The score is the steps survived, weighted by *n*.
- **Duel:** the same seeded stream and a score race.
- **Reference:** dual n-back (Jaeggi et al., 2008), reduced to position only.

### 3. Cup Shuffle (`cupshuffle`): follow the ball
- **Job:** a ball is shown under one of 3–5 cups, the cups swap, and you tap the cup
  with the ball.
- **Focal moment:** the shuffle itself. Cups slide to each other's places along a
  short arc; with reduced motion they swap in place, step by step.
- **Rules:** each level adds swaps and speed, and cups go from 3 to 4 to 5. A
  wrong cup costs a life.
- **Duel:** a level race on the same shuffle.

### 4. What Changed? (`whatchanged`): spot the difference from memory
- **Job:** a small grid of pixel objects (the Pairs faces) is shown, blinks out,
  and comes back with one thing changed: moved, swapped for another object, or
  gone. Tap where the change is.
- **Focal moment:** the blink. A short blank between the two scenes is what makes
  it memory rather than visual search.
- **Rules:** objects grow from 4 to 12; 3 lives.
- **Duel:** a level race; the faster correct tap breaks ties through the clear-time
  tiebreak.
- **Reference:** the change-blindness flicker paradigm (Rensink, O'Regan & Clark,
  1997).

### 5. Lost & Found (`kimsgame`): Kim's Game
- **Job:** a tray of objects is shown, covered, and shown again with one missing.
  Pick the missing object from six choices.
- **Focal moment:** the cover sliding over the tray.
- **Rules:** the tray grows from 5 to 14 objects and the viewing time shrinks a
  little; 3 lives.
- **Duel:** a level race.
- **TypeSafe Jev:** not in this build. A typed-recall party mode ("name everything
  you remember") is where a Jev Noul judgment fits: textMatchLogic first, Jev only
  on code misses, a room vote as the fallback. It needs a server-side call with a
  key, so it is a follow-up and documented in the audit report.
- **Reference:** Kim's Game (Kipling, *Kim*; scouting).

### 6. Name Tags (`nametags`): faces and names
- **Job:** avatar-kit faces are shown with names, then the faces are shuffled.
  Match each name to its face.
- **Focal moment:** the name tags peeling off the faces when the study time ends.
- **Rules:** 3 faces at first, one more per level; a wrong match costs a life.
- **Duel:** a level race.
- **Assumption:** names come from a short family-safe first-name list. Using the
  players' real friends needs consent and is out of scope.

### 7. Split Signal (`splitsignal`): co-op
- **Job:** two players see different halves of one lit pattern. Rebuild the whole
  pattern together on a shared board; each player taps the tiles they saw.
- **Focal moment:** the shared board filling with both colours as the halves meet.
- **Rules:** co-op with 3 shared lives. Each cleared level adds tiles. The score is
  the levels cleared together (registry `coop: true`). Chat and emotes are allowed
  but not needed.
- **Solo:** none; it is a two-player game.

## Constraints and open decisions
- Room state for the duels lives under one `mem` node with honest-client deals.
  Each deal is seeded per level, the same as Pairs' deck, and documented, not
  hidden.
- Not decided here: the catalogue thumbnails (pixel art for new types is made
  with `npm run art:pixel`, a separate art pass) and rule-media stills. The
  rule-media manifest lists the new types as skipped until a capture pass runs.
