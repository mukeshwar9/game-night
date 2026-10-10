# Game Night — work status

**As of 2026-09-27.** What is live, what is merged but not yet deployed, what is paused on
branches, and what is waiting on a decision. Commit ids come from the git log of local `main`
and the `fm/*` branches; the live site is <https://game-night-91464.web.app>.

## Done and live (pushed to `origin/main`, deployed)

| Change | Commit | Notes |
|---|---|---|
| Retro background music | `beab8ab` | On by default, starts on the first tap, mute toggle. |
| Animal Stack | `6dd9e0b` | 1–4 player physics stacking game: solo, same-device 2–4, online 2–4. Solo at `/solo/animalstack`. |

`origin/main` ends at `6dd9e0b`.

## Done, merged on local `main`, not pushed or deployed yet

| Change | Commit | Notes |
|---|---|---|
| UPDRAFT | `8aba4fc`, `5d70217` | Ghost-race climber with CHAOS sabotage and a Twin Towers co-op mode (`8aba4fc` is its climber sim). |
| Archery PRD | `2b3ae38` | `docs/prds/archery.md` with three UI directions and screenshots. The game is not built; the UI direction and decisions D1–D10 are pending (NEON RANGE is recommended). |
| Puck Rush, Yacht, Face Off, Chop Chop | this branch, `fm/games-twoplayer-ideas-s1` | Four games from the two-player ideas review, one commit each, with solo pages and two-client e2e specs. No database rule changes. Designs: `.lavish/twoplayer-ideas/`. Lands on `main` when this branch is merged. |
| Steady Hand (darts) | this branch, `fm/games-jb-darts-s1` | Darts for 2–4 players: Countdown and Turf, Nerves, hold-and-aim or one-button throw, a board painted from the active theme, solo vs a bot and pass-and-play. Every dart is an integer landing point under the room's `round` node that every client replays, so no database rule changes. Design, prototype and review rounds: `.lavish/darts/`. Lands on `main` when this branch is merged. |
| Sticky Fingers | this branch, `fm/games-jb-moneygrabber-s1` | Money Grabber study built as a game: a 60-second grab-and-stash table with a dye-pack and a LAST CALL twist. One phone for 2–4 (`/local/stickyfingers`), solo against 1–3 bots (`/solo/stickyfingers`) and an online 2-player duel on the peer-to-peer stack. No database rule changes; online 3–4 needs a host-to-many transport and is not built. Design and prototype: `.lavish/sticky-fingers/`. Lands on `main` when this branch is merged. |
| Bonk Buggies | this branch, `fm/games-jb-crashit-s1` | Two-player side-view buggy duel (first to 5 points) on the vendored planck.js: spare lid for the trailer, hop jet, loser picks the arena, tide that ends stalled rounds; room page, one-phone / vs-bot page, two-client e2e. Adds room keys `bonkScoreX`/`bonkScoreO` (rules + rules test). Not yet tried on two real devices. Design and report: `.lavish/bonk-buggies/`. Lands on `main` when this branch is merged. |
| Fender Bender | this branch, `fm/games-jb-trafficjam-s1` | Top-down road brawl for 2–4 cars: solo against bots, 2–4 people on one phone, online two-player duel. HORN and GHOST TRUCK twists; the canvas arena follows the selected theme. No database rule changes. Design board and prototype: `.lavish/fender-bender/`. Lands on `main` when this branch is merged. |
| Lazy Susan | this branch, `fm/games-jb-lastsashimi-s1` | One turning plate, 2–4 players: online room (write-once piece claims under `round/lsClaims`, rules and rules tests added), 2–4 on one phone and solo vs a bot at three levels. Twists THE TURN, HOT CHILI, LAST BITE. Canvas arena themed from the `--c-*` tokens. Design and prototype: `.lavish/last-sashimi/`. Lands on `main` when merged. |
| Bamboozle | `fm/games-jb-spikeattack-s1` | A pole-dodging survival game from the Spike Attack study: online 2–8 race on one seeded garden, solo against 1–3 bots, 2–4 on one phone. Twists CRUMBLE, BAIT and GRAB (one phone and solo). Canvas garden that follows the app theme. No database rule changes. Design board: `.lavish/bamboozle/`. Lands on `main` when this branch is merged. |
| Wire Crossed levels PRD | this branch, `fm/games-wirecrossed-levels-s1` | `docs/prds/wire-crossed-levels.md`: a 15-level ladder plan, new modules, and the 0:00 timer freeze bug with its fix. Lands on `main` when this branch is merged. |

## In progress on branches, paused

Builds run one at a time because the laptop overloads.

| Work | Branch | State |
|---|---|---|
| Minigolf | `fm/games-minigolf-design-s1` (2 commits ahead of `main`) | Sim, 9 courses, replay, bot, screens, solo/pass-and-play and online room pages committed. Not merged. |
| Pulp Rush (fruit slicing) | `fm/games-fruit-ninja-2p-s1` (1 commit ahead) | Slice race, co-op harvest and one-phone split screen committed. Not merged. |
| Solo difficulty picker for every game that lacks one | — | Survey started, no code yet. |
| Wire Crossed 15-level ladder and timer fix | — | Implementation stopped by the captain; the PRD above was written instead. The timer fix is a 10-line change described in the PRD. |
| Typing Race (Monkeytype-style) and Mental Math improvements | — | Research paused, no report yet. |

## Pending captain decisions / not started

- **Deploy UPDRAFT** (merged locally, see above).
- **Build Archery** after picking its UI direction.
- **Land or drop older finished branches:**
  - Arrows fixes — `fm/games-arrows-fix-ac-s1` (1 commit ahead of `main`).
  - Four solo modes — Anagrams (`fm/games-anagrams-solo-s1`), Word Race
    (`fm/games-wordrace-solo-s1`), Word Co-op (`fm/games-wordcoop-solo-s1`), Password
    (`fm/games-password-solo-s1`); each 1–2 commits ahead of `main`.
  - Word-games review.
  - Co-op B/C — per git, `fm/games-coop-b-s1` and `fm/games-coop-c-s1` have no commits that are
    not already on `main` (their work, including WIRE CROSSED and the ten co-op PRDs, is merged),
    so these two can simply be deleted.
- **Ideas never designed:** Air Hockey, Chess, Penalty Kicks, Guess the Person, Yazy.
- **Dropped:** Lost Lanes (Temple Run-style runner).
