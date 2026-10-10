# SIDE KICK

A motorbike sprint for up to four riders on a pseudo-3D road. You steer, the throttle is automatic, and you
can kick the rider beside you. Three hits unseat a rider; too many kicks in a row tire you out and throw you
off your own bike. A match is a three-race cup: places score 3 / 2 / 1 / 0 points and the best total wins.

The design board (study of the classic's mechanic, view comparison, the playable prototype and the rounds
of review) is in `.lavish/side-kick/`. The classic it studies is Electronic Arts' Road Rash; this is Game
Night's own game with its own name, art, tracks and rules, and nothing is copied from it.

## Where it lives

| Piece | File |
|---|---|
| Pure rules: tracks, rider step, kicks, bots, ghosts and their wire format, cup points | `src/lib/sideKickLogic.js` (+ `.test.js`) |
| Scene colours derived from the `--c-*` theme tokens (every theme is tested) | `src/lib/sideKickPalette.js` (+ `.test.js`) |
| The road scene on a canvas: lit, shaded, animated; riders are the players' avatars from behind | `src/components/sideKickRender.js` |
| Canvas + glass HUD + thumb pad | `src/components/SideKickBoard.jsx`, `sideKickSeats.js` |
| The play surface; full screen is the shared `FocusFrame` (registry `focusPage: true`: room header button and the `/solo` corner button) | `src/components/SideKickPlay.jsx` |
| Frame loop: fixed 60 Hz step, renderer, sounds, HUD snapshot | `src/hooks/useSideKickRun.js` |
| Touch and keyboard controls | `src/hooks/useSideKickControls.js` |
| Sounds | `src/lib/sideKickSound.js`, `sideKick*` in `src/lib/sounds.js` |
| Avatar from behind | `back` view in `src/lib/avatarKit/character.js` |
| Online room (a race inside `RaceShell`) | `src/pages/SideKickGame.jsx` |
| Cup support in the shared race code | `raceChampions`, `CUP_RACES_BY_GAME`, `decorate`, `maxRacers` in `src/lib/raceLogic.js`; `cup`-aware headings in `src/components/RaceShell.jsx` |
| Solo against three bots (`/solo/sidekick`) | `src/pages/SideKickDemo.jsx` |
| Rules for the new keys | `database.rules.json` (`round/stats/*/*` for `sidekick`, `cupRaces`, `raceResult.grid`), `tests/rules/sidekick.test.js` |
| Two-client flow | `tests/e2e/sidekick.spec.js` |

## How a race works

- The road is a list of pieces `[enter, hold, leave, curve, hill]` plus how busy and how wooded it is
  (`TRACKS`). Scenery and traffic come from the seed, so every phone grows the same roadside; a car's
  position is a pure function of race time. The online cup rides MEADOW RUN, SWITCHBACK PASS and RUSH HOUR in
  turn; RANDOM ROAD is solo only.
- A race ends when every person has finished, 20 s after the first rider (a bot counts) crosses the line, or
  at 120 s. The grid for the next race puts last place in front.
- Balance: three pips, one back every 4 s, one lost per hit (a second hit from the same attacker inside 1 s
  shoves but takes no pip). Kick strain builds 0.30 a hit / 0.40 a miss, holds 0.4 s, drains 0.25 a second,
  and a kick that takes it past 1.0 throws the kicker off. Boost: hold for about 2 s, refills in about 8 s.
- Fall: 1.9 s on the ground and a slow remount for the leader; 1.2 s, 55 % speed and a catch-up boost that
  ends once the gap is what it was for anyone who falls with a rider ahead. A remount shield (1.5 s) blocks
  kicks, traffic and oil. Slipstream: 0.5 s in a wake gives +10 % top speed.
- Grudge: the rider who last knocked you off is marked on your screen. Knocking them off in return is a
  PAYBACK, worth one more cup point.

## Online sync

Nothing new at the transport: the room is the party-room model (`players` keyed by uid) and `RaceShell` runs
the lobby, READY, the countdown and the results.

- Each phone simulates only its own bike at 60 Hz and writes a ~14-field report of small integers
  (`encodeRider`) to `round/stats/{round}/{uid}` about every 100 ms, at once on a fall, a remount, a swing
  or the flag. Other riders are ghosts: placed from the last report, carried forward by its age (at most
  0.4 s) and eased in. Everything read is re-validated (`decodeRider`), because stats are client-written.
- A kick is judged on the kicker's phone against the ghost it sees and written as `k/{n} = "victim|side"`
  on the kicker's own node. The victim's phone applies the shove, the pip and the stagger
  (`receiveKick`): dropped if the victim is shielded, down or finished (the kicker sees a CLANG) or if the
  kicker's ghost is nowhere near. The kicker also sees the blow at once, so a kick never feels dead.
- Bots fill empty seats up to four. The room coordinator's phone (`isRoomCoordinator`, online-aware) runs
  them and reports under `bot1`..`bot3`; if the coordinator drops, the next one promotes the bots from their
  last reports.
- Race time is the shared server clock (`goAt` from the round), so traffic and finish times agree across
  phones.
- Results rank people only (the shell's `raceResult`), but the cup points come from the place among all four
  riders, bots included (`decorateRound`).

## Tuning

Every number in `sideKickLogic.js` is a starting value chosen without a playtest; none is measured.
Move these first: kick reach (`REACH_X`, `REACH_Z`), the cooldown (`KICK_CD`), the strain costs, the fall
time and the catch-up boost. The one open risk is kick fairness at 150 ms or more of lag; test it on two
real phones before changing the art.
