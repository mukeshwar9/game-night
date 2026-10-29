# SIDE KICK

A motorbike sprint for up to four riders on a pseudo-3D road. You steer (by tilting the phone, or with the buttons), the
throttle is automatic, and you can kick the rider beside you. Three hits unseat a rider; too many kicks in a row tire you out and throw you
off your own bike. A match is a three-race cup: places score 3 / 2 / 1 / 0 points and the best total wins.

The design board (study of the classic's mechanic, view comparison, the playable prototype and the rounds
of review) is in `.lavish/side-kick/`. The classic it studies is Electronic Arts' Road Rash; this is Game
Night's own game with its own name, art, tracks and rules, and nothing is copied from it.

DUST KICK, the Wild West version, runs on this same engine with a `dust` rules option: see `docs/DUST-KICK.md`.

## Where it lives

| Piece | File |
|---|---|
| Pure rules: tracks, rider step, kicks, bots, ghosts and their wire format, cup points | `src/lib/sideKickLogic.js` (+ `.test.js`) |
| Scene colours derived from the `--c-*` theme tokens (every theme is tested) | `src/lib/sideKickPalette.js` (+ `.test.js`) |
| The road scene on a canvas: lit, shaded, animated; riders are the players' avatars from behind | `src/components/sideKickRender.js` |
| Canvas + glass HUD + thumb pad | `src/components/SideKickBoard.jsx`, `sideKickSeats.js` |
| The play surface; full screen is the shared `FocusFrame` (registry `focusPage: true`: room header button and the `/solo` corner button) | `src/components/SideKickPlay.jsx` |
| Frame loop: fixed 60 Hz step, renderer, sounds, HUD snapshot | `src/hooks/useSideKickRun.js` |
| Tilt, touch and keyboard controls | `src/hooks/useSideKickControls.js`; tilt maths `src/lib/tiltLogic.js`, sensor + iOS permission `src/lib/tiltSensor.js` |
| Camera and steering choice (saved on the device) | `src/lib/sideKickPrefs.js`, `src/hooks/useSideKickPrefs.js`, panel `src/components/SideKickPrefs.jsx` (solo setup sheet and online lobby via the shell's `Prefs` hook) |
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
  and a kick that takes it past 1.0 throws the kicker off.
- Boost: the meter starts empty and nothing but two things fills it. A **near miss** passes a traffic vehicle
  without touching it: the closest approach while level with the car must be outside the hit distance
  (`CAR_HIT_X` 0.235) and within `NEAR_MISS_X` 0.36 of its middle, at a speed above the car's, and is worth
  `NEAR_MISS_FILL` 0.20 with a CLOSE! cue (once per car; a shielded rider scores nothing). A **slipstream** is
  riding behind a riding opponent inside the wake cone (150 to 1000 ahead, 0.10 wide at the tail growing to
  0.20 at the far end); after 0.5 s in it the meter fills at 0.20 a second while you stay (not while
  boosting), with wind lines. **One tap** on BOOST (or Space) spends the whole meter at once: a burst of
  +25 % top speed lasting `meter x BOOST_SECS` (2.6 s for a full meter, at least `BOOST_MIN` 0.12 to light);
  the meter reads empty at once and the HUD bar drains with the time left. A tap on an empty meter says BOOST
  EMPTY. A fall ends a burst. Bots tap once their meter is half full on a straight with a rider to chase.
- Oil: riding over a slick takes 15 % of your speed at once, caps top speed at 60 % for `OIL_T` 1.5 s (easing
  back over the last 0.3 s) and makes the bike wander left and right; never a pip or a fall, and kicking still
  works. Bots get the same. A remount shield ignores oil.
- Fall: 1.9 s on the ground and a slow remount for the leader; 1.2 s, 55 % speed and a catch-up boost that
  ends once the gap is what it was for anyone who falls with a rider ahead. A remount shield (1.5 s) blocks
  kicks, traffic and oil. Slipstream: 0.5 s in a wake gives +10 % top speed.
- Grudge: the rider who last knocked you off is marked on your screen. Knocking them off in return is a
  PAYBACK, worth one more cup point.

## Online sync

Nothing new at the transport: the room is the party-room model (`players` keyed by uid) and `RaceShell` runs
the lobby, READY, the countdown and the results.

- Each phone simulates only its own bike at 60 Hz and writes a ~16-field report of small integers
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

## Tilt steering and the camera

- Tilt is the default on a phone with a tilt sensor (a coarse pointer and `DeviceOrientationEvent`); a desktop
  keeps keyboard and buttons. The reading is the sideways pull of gravity on the screen (`leanDeg`), so it works
  held upright and turned like a wheel, laid back and rolled, and in landscape, with no gimbal lock. Straight
  ahead is learned during the 3.2 s countdown (neutral follows the phone, steer is zero) and is fixed at GO;
  tapping the TILT gauge re-centres. Dead zone 2.5 degrees, full lock at 18, smoothing 60 ms. A pressed steer
  button or key always overrides the tilt.
- iOS gives readings only after a tap: the setup sheet (solo) and the lobby (online) show ENABLE TILT STEERING,
  and the play surface shows the same button if tilt is still waiting for it. If the sensor is missing, no
  reading arrives within 2.5 s, or the player says no, steering falls back to the buttons, with a note. The
  STEERING setting (TILT / BUTTONS) is saved on the device.
- Two cameras: the chase view and a first-person view (camera at the rider's eyes; own bike hidden; handlebars,
  gloved hands and a gauge pod whose five lamps are the boost meter; the boot swings out on a kick). In first
  person an opponent in kick range lights that edge of the screen in their colour with a chevron (dimmed while
  the kick is cooling down), and the mirrors stay. The switch is on the HUD, in the settings, and on the C key,
  and is saved on the device.
- Boost is felt: the field of view widens (about 20 %) and pulses at the tap, streaks pour out of the middle of
  the screen, the bike or bars shake, and a thump-and-sweep sound plays. Online, other phones see a rider's
  burst and oil wobble from the `bo` and `ol` report flags; the meter itself (`bm`) is only read back on a
  reload.

## Tuning

Every number in `sideKickLogic.js` is a starting value chosen without a playtest; none is measured.
Move these first: kick reach (`REACH_X`, `REACH_Z`), the cooldown (`KICK_CD`), the strain costs, the fall
time and the catch-up boost, then the boost economy (`NEAR_MISS_X`, `NEAR_MISS_FILL`, `SLIP_FILL`, `BOOST_SECS`,
`BOOST_TOP`) and the oil (`OIL_TOP`, `OIL_T`). Tilt needs a real phone: check the dead zone and full lock on iOS and Android. The one open risk is kick fairness at 150 ms or more of lag; test it on two
real phones before changing the art.
