# Knife Thrower → PINWHEEL: research, Game Night design, twists and prototype

Task `games-jb-knifethrower-s1`, scout report, 10 Oct 2026. One of eight parallel studies of mini-games from JindoBlu's "1 2 3 4 Player Games" (Play Store id `com.JindoBlu.FourPlayers`). This report covers only Knife Thrower.

## Summary

- The source game is a turn-based, one-button timing game: a target spins in the middle, each player taps their own corner button to throw a blade straight at it, rim prizes score one point and hitting a blade already stuck in the target costs one point.
- The Game Night version is **PINWHEEL** (alternatives: STICK 'EM, CLINK): pins and stars instead of knives and produce, 2–4 players on one phone and in online rooms, solo against a bot, three wheels per match, about 90 seconds.
- It fits the existing turn-based, deterministic-replay pattern used by Archery and Animal Stack, so it needs only the Realtime Database, no peer-to-peer link and no new server code. Effort: **medium**.
- Five twists are designed and all five are switchable in the playable prototype. Recommended for the first build: **T1 Close Shave** and **T2 Rim Items** inside the base game, then **T3 Scramble** (everyone throws at once) on one phone only.
- Deliverables: the Lavish board with a playable prototype at `.lavish/pinwheel/index.html` in the task worktree (session `http://100.97.248.126:4387/session/49e12a9dacfce84f`), and this report. No app code was changed.
- Four decisions wait on the captain: which twists, player counts for v1, the name, and the theme (pins and stars, or knives).

## 1. What I did

1. Read the repo for fit: `README.md`, `docs/STATUS.md`, `TODO.md`, `CLAUDE.md`, `.claude/rules/*.md`, the `GAME_TYPES` registry in `src/lib/games.js`, the Archery, Puck Rush, Chop Chop and Animal Stack entries and pages, and the GLASS theme tokens in `src/index.css`.
2. Researched the source game from the Play Store listing, web search, and YouTube gameplay videos. The app was not installed or decompiled, and no art, audio, names or code were taken from it.
3. Designed the Game Night version, five twists and a name.
4. Built a self-contained board with a playable prototype and verified it in a headless browser at phone width and inside the Lavish session.

## 2. Source research

### How the evidence was gathered

- `curl` of the Play Store page (1.2 MB of HTML), with the description, download count, rating and visible reviews extracted by a small script. The `WebFetch` tool returned only a truncated placeholder for this page.
- Four web searches found no written rules for this mini-game anywhere (no wiki, no walkthrough text).
- A YouTube results search (`curl` of `youtube.com/results?search_query=…`) found videos of the game. No video downloader is installed, so I read each video through its **preview storyboard strip** (the grid of small still frames YouTube serves for scrubbing), one frame per second for the short clips, plus each video's full-size thumbnail. This is enough to see rules, layout and turn flow, but frames are small (81×180 pixels for the key clip), so exact numbers and speeds are approximate.

### Sources

| Tag | Source | What it gave |
|---|---|---|
| S1 | Play Store listing, "1 2 3 4 Player Games – Offline", JindoBlu — `https://play.google.com/store/apps/details?id=com.JindoBlu.FourPlayers&hl=en_IN` (fetched 10 Oct 2026) | Description (1–4 players on one device, PvP, 2v2, vs AI), "10Cr+" downloads, 4.3 stars from 1.73 lakh reviews, updated 9 Oct 2026, three visible reviews |
| V1 | YouTube `oh9ACUkPeps`, "4 player game knife throw difficult game", channel Genz art and games, Jan 2024, 1:28 | The in-app rule card and a whole turn-based match against the AI |
| V2 | YouTube `Dd-n5SZyH3w`, "2 Player Games: Knife Thrower", Apr 2022, 1:35 | The publisher's two-player app version |
| V3 | YouTube `mtTaqYrHxs0`, "2 Player Games: the Challenge – Knife Thrower", 1:50 | Same two-player version, round resets |
| V4 | YouTube `mLudO_sQHE4`, "234 Player Mini Game · Mini Tournament · Knife Throwing", Sep 2026, 13:47 | Game menu, TOURNAMENT button, four corner buttons in other mini-games (the knife section itself was not in the frames I sampled) |
| S2 | `https://mwm.ai/apps/1-2-3-4-player-games/1635978552` | A screenshot caption describing a knife hitting a central target decorated with carrots, with per-player input circles |

### Findings

| # | Finding | Status | Source |
|---|---|---|---|
| 1 | The rule card reads, as far as the small frame can be read: "KNIFE THROWER. Tap to throw knives. Each carrot gives one point. If you hit a knife, one point is deducted." | Confirmed (text read from an upscaled 81-pixel-wide frame) | V1 |
| 2 | Turn-based: a "RED STARTS!" splash, then a "Your turn!" wedge beside the active player's corner button | Confirmed | V1 |
| 3 | One round button per player in their own corner with their score next to it; the blade flies in a straight line from that player's end to the target centre | Confirmed | V1 |
| 4 | Blades stay stuck in the target, coloured by thrower, and act as obstacles; a blade that hits one bounces away | Confirmed | V1 (thumbnail shows the bounce) |
| 5 | Rim prizes are re-dealt in new positions as they are collected; scores in the clip stay between 0 and 3 and go down as well as up | Confirmed | V1 |
| 6 | Vs-AI has a difficulty slider (the card shows EASY and "drag to adjust difficulty") | Confirmed | V1 |
| 7 | The app has a tournament mode, 2v2, and four corner buttons for four players | Confirmed for the app | S1, V4 |
| 8 | The two-player sibling app plays it differently: both ends throw at the same time at a plain ringed target, with a shared score pill ("10 • 11" in the thumbnail) and coloured plus grey blades | Confirmed that it differs; its exact rules are not | V2, V3 |
| 9 | With 3 or 4 players each uses a screen corner | **Assumption** — no footage of this mini-game with more than two players was found; inferred from the app's other four-player games | V4 |
| 10 | The score that ends a match | **Unknown** | — |
| 11 | Whether a score can go below zero; exactly when stuck blades are cleared | **Unknown** | — |
| 12 | The target's speed changes or reverses during a match | **Assumption** from blade positions between frames | V1 |

### What makes it fun, and what frustrates

- Fun: learned in one throw; a tense wait for the gap to come round; every throw changes the target for the next player; a mistake is loud and visible.
- Frustrating (my reading of the footage plus reviews): with four players three of them are waiting; late in a round the rim is so crowded that most throws are losses; a throw with no prize in reach has no purpose.
- From the visible store reviews of the whole app (S1): touch controls that are too small ("precisely the size of the tip of my thumb"), and a hard AI that "doesn't actually … play better, it makes sure it has an unfair advantage". Neither review is about this mini-game specifically, but both are design constraints worth taking: large pads, and a bot that is only handicapped by its timing.

## 3. How it fits Game Night

- The registry is `GAME_TYPES` in `src/lib/games.js` (2,602 lines). A custom game is one entry with `custom: true` and a lazy `Page`; an N-player game adds `nPlayer`, `minPlayers`, `maxPlayers` and a `startRound` hook; a same-device page is a `LocalPage` with `localMaxPlayers` (Archery at `src/lib/games.js:1409-1419`, Archery Range 4P at `:1420-1437`, Animal Stack at `:1470-1481`).
- Archery is the closest structural template. `src/lib/archeryLogic.js:1-2`: "Archery stores only bounded integer aim inputs. Wind, impact, WA scoring, turn order and tie-breaks are replayed identically on every client." PINWHEEL can do the same with one integer per throw.
- Solo pattern: a `*Demo.jsx` page running the same logic against a bot with EASY / NORMAL / HARD and a stored win record (`src/pages/PuckRushDemo.jsx:1-20`), which also hosts "two players at opposite ends of one phone".
- Per-match room keys must be listed in `FIELD_NULLS` (`src/lib/games.js:2150-2155` shows Archery's), each needs a rule in `database.rules.json` and a test in `tests/rules/`, and a multi-client flow needs an e2e spec (`.claude/rules/adding-a-game-rules.md`).
- The app has no Firestore; all room state is in the Realtime Database. Peer-to-peer WebRTC exists for two-player real-time games only (`src/lib/realtime/rtc.js`).
- Look: light GLASS / MATCHA tokens (`src/index.css:931-998`), Press Start 2P labels, hard ledge shadows; glass goes on chrome and never on boards (`src/index.css:3206-3218`). Motion: game pieces may use the stepped pixel grammar, anything under the finger uses the press spring (`.claude/rules/motion-rules.md`).

### Closest existing games

| Game | Shared | Different |
|---|---|---|
| Archery / Archery Range 4P | Turns, 2–4 on one phone, stored-throw replay | You aim at a still target; in PINWHEEL the target moves and the only input is timing |
| Aim Trainer | Hit-the-target reflex | Parallel private boards; no shared target that fills up |
| Animal Stack | 2–4 seats, turns, each move changes a shared object | Physics tower, long turns |
| Pulp Rush | Produce-and-blade theme | The reason PINWHEEL avoids that theme |

No current game is about timing one tap against a spinning, filling target, so PINWHEEL does not duplicate anything.

## 4. Game Night design: PINWHEEL

### Rules

- A wheel spins at the centre. Stars sit on its rim: 5 with two players, 6 with three or four.
- Each player has one pad at their own edge or corner and a straight lane from it to the hub. Tapping throws one pin along the lane. The pin lands on whatever part of the rim is facing that lane when it arrives (about 0.15–0.25 s after the tap, so players lead the target slightly).
- **Star:** +1, the star is removed and the pin stays in its place.
- **Clink:** landing on any pin, yours or anyone's, bounces the pin off and costs 1 point, never below zero.
- **Bare rim:** the pin sticks and scores nothing; it is now an obstacle for everyone.
- A wheel ends when its stars are gone, or when the rim holds 16 pins. Pins are cleared and the next wheel deals in.
- Three wheels: steady spin; faster with a speed wobble; slower with reversals. Most stars after wheel 3 wins. A tie plays one sudden-death star.

### Turn and match flow

- Turns go round the table, one pin each. The starting player rotates every wheel.
- A 7-second shot clock passes the turn (no penalty) so nobody can stall; online it runs on the server clock.
- A match is about 90 seconds with two players and about two minutes with four.
- In a room, PLAY AGAIN, SWITCH GAME and the night scoreboard come from the shared shell.

### Controls

- One pad per player, 76 CSS pixels across (the source's small-control complaint), showing that player's score turned to face them, with a ring and a "GO" count while it is their turn.
- Throw fires on pointer-down, not on release, and the sound and haptic fire on contact, per the motion rules.

### Player counts

| Mode | Layout |
|---|---|
| 2 on one phone | Pads at the bottom and top centre, phone flat between the players |
| 3 on one phone | Two bottom corners and top centre |
| 4 on one phone | One per corner |
| Online, 2–4 | Each client rotates the view so its own lane is at the bottom; other players' pads become score badges |
| Solo | Player at the bottom, bot at the top, EASY / NORMAL / HARD |

Every lane points at the hub, so every seat reaches every rim position equally; no seat has an advantage.

### Online model

- The wheel's angle is a pure function of (seed, wheel number, time since the turn began). The thrower's client records one integer, the milliseconds into the turn at which the pad was pressed, and appends it to a throws list. Every client replays that throw on the same wheel and gets the same result. No clock synchronisation is needed for the result; the server clock is only used for the shot clock.
- This is turn-based over the Realtime Database, like Archery. No WebRTC.
- Suggested keys, all per-match and all in `FIELD_NULLS`: `pinSeed`, `pinThrows` (append-only integers 0–7000, normalised on read because Firebase drops empty arrays), `pinTurnStartedAt`, `pinSeatUids`.

### Bot

The bot finds the next moment a star will be under its lane with no pin near it and taps then, plus a random timing error: about 130 ms standard deviation on EASY, 60 ms on NORMAL, 20 ms on HARD. It has no other advantage, which answers the source's "unfair AI" complaint. In the prototype a HARD bot beat random tapping 12–0 in a 39-second match.

### Edge cases

- Two stars closer together than a pin's width: the deal keeps items at least 0.52 radians apart.
- Rim too full to finish: the 16-pin cap ends the wheel.
- A clink at zero points costs nothing; acceptable, since it still wastes the turn. An alternative is to allow negative scores (captain's call only if it matters).
- A player disconnects online: the shot clock passes their turns; the existing presence and CLAIM WIN machinery handles a player who never returns.
- A late joiner spectates until the next match, as in other N-player rooms.
- Reduced motion: the wheel must still turn (it is the game), but the screen shake and bounce animation are replaced by a flash.
- Colour is not the only signal: each player's pins also sit beside their own pad's lane colour and the pads carry the scores; pin heads should get a per-seat shape in the real build.

### What the build needs

| Part | Detail |
|---|---|
| Logic | `src/lib/pinwheelLogic.js` with tests: seeded wheel angle over time (using `detMath.js`), throw resolution, scoring, wheel deal, match end, bot timing |
| Screens | `PinwheelBoard` component, `PinwheelGame.jsx` (room, 2–4 seats), `PinwheelDemo.jsx` (solo bot, and a `LocalPage` for 2–4 on one phone), icon, registry entry, HOW TO PLAY text with number checks |
| Data | Realtime Database keys above, a rule for each in `database.rules.json`, a rules test, a two-client e2e spec |
| Realtime | None for the base game |
| Assets | None; drawn from theme tokens, existing sound set |
| Effort | **Medium** for base + T1 + T2 + solo + one phone + online turns |

## 5. Twists

| # | Twist | What changes | Why it is more fun | Risk | Build cost |
|---|---|---|---|---|---|
| T1 | **Close Shave** | A pin that lands in the narrow band right beside another pin, without touching, scores +1 | Removes the source's dead throws: with no star in reach there is still something brave to try, and the best spot is the most dangerous | The band must be shown clearly; too wide and it out-scores stars | Small |
| T2 | **Rim Items** | Each wheel also deals a gold star (+3), a bomb (blows every pin off the rim) and a reverse arrow | One moment per wheel worth fighting over; the bomb un-jams a crowded rim, the source's weakest phase | Gold can decide a match alone; one per wheel | Small (seeded with the wheel, so it replays online) |
| T3 | **Scramble** | No turns; everyone throws at will for 30 seconds; a clink greys your pad for 1.3 seconds | No waiting with four players; the loudest way to play on one phone | Online it needs live sync for up to four players, which today's peer-to-peer link only does for two | Small on one phone, large online |
| T4 | **Underdog Sight** | Whoever is strictly last sees a marker on the rim showing where a pin thrown now would land | A comeback rule that helps the weakest player without taking anything from the leader | Strong players could sandbag to keep it | Small (drawing only) |
| T5 | **Clear the Wheel** (co-op) | One team, three shared hearts, clear three wheels; a clink costs a heart | Game Night already pairs games with co-op modes (Pulp Harvest, Updraft Co-op); players coach each other's timing | Needs more wheel patterns to stay interesting | Medium (a second registry entry as a mode) |

**Recommended first:** T1 and T2 as part of the base game (both are cheap, both fix a weakness seen in the source), then T3 on one phone only. T4 and T5 can follow once the base game has been played.

Things that come free with the room and are not counted as twists: the night scoreboard across game switches, winner-stays seating from a party room, reactions and chat, spectators, the arrival countdown.

## 6. Name

- Recommended: **PINWHEEL** — pins in a wheel, an existing friendly word, nothing violent.
- Alternatives: **STICK 'EM**, **CLINK**.
- None of these is the source app's title. The theme change (pins and stars instead of knives) is recommended because Game Night is family-safe and Pulp Rush already uses blades and produce; the captain can choose knives and a log instead.

## 7. The board and prototype

- File: `.lavish/pinwheel/index.html` in the task worktree (`/Users/mukeshwarvarmaspurge/.treehouse/games-platform-ca14c8/32/games-platform`). It is one self-contained file of about 70 KB: inline styles, inline script, the pixel font embedded as base64, no storage use and no network requests. `index.src.html` beside it is the same file before the font is inlined. The worktree is disposable, so the board file must be copied out if it should outlive this task.
- Design source: Game Night's own GLASS / MATCHA tokens copied from `src/index.css`, because the board previews a Game Night game.
- Contents: one-screen summary; the source mechanic drawn and a confirmed/assumed table; PINWHEEL's four outcomes and seating as diagrams; the playable prototype; five twist cards, each with a TRY IT button that switches the twist on in the prototype; fit and build tables; a decisions form; sources.
- Prototype: 2 players, vs bot (three levels), 3 players and 4 players; turn play with shot clock and three wheels; all five twists as switches; multi-touch pads.
- Prototype limits: one screen only, simple beeps, a tie is shown as a draw.

### Verification

Run with `chrome-devtools-axi` (session `pinwheel`) against the file at 390×844 and inside the Lavish session at 1280×900:

- No console errors in either; no horizontal overflow at 390 px (`scrollWidth - innerWidth = 0`).
- Scripted play through `window.__pw`:
  - 2-player turns: wheel advanced from 1 to 2 within 9 s of random tapping.
  - Vs HARD bot, full match: ended after 38.6 s, result screen shown, "BOT WINS / P1 0 · BOT 12".
  - 4 players with T1, T2 and T4: items dealt as `star×6, gold, bomb, flip`; scores 1, 2, 0, 2 and wheel 2 reached in 9 s.
  - 3-player Scramble: scores 2, 5, 7 after 4 s, timer counting down.
  - Co-op: ended "OUT OF HEARTS" after three clinks.
  - Idle: the shot clock passed the turn from P1 to P2 after 7 s.
- Not verified: real multi-finger play on a physical phone, and play by clicking inside the Lavish frame (the page rendered there with its font and no errors, but my browser tool cannot drive a sandboxed frame).

## 8. Decisions for the captain

All four are on the board's form, keyed to this task id.

1. **Twists in the first build.** Recommended: T1, T2, and T3 on one phone. Options: any subset of T1–T5, and whether Scramble should also work online (large).
2. **Player counts for v1.** Recommended: 2–4 on one phone and online, plus solo bot. Options: one phone and solo first with online later; two players only.
3. **Name.** Recommended: PINWHEEL. Options: STICK 'EM, CLINK, or another.
4. **Theme.** Recommended: pins and stars. Option: knives and a wooden log.

## 9. Recommendation

Build PINWHEEL as a medium-sized game on the Archery pattern, with T1 and T2 in the base rules, solo bot, 2–4 on one phone and turn-based online rooms. Add one-phone Scramble in the same build if the captain wants the party mode; leave online Scramble, Underdog Sight and co-op for after it has been played.

## 10. Round 2: realistic look and animation (steering message 001, 10 Oct 2026)

Ask, relayed by firstmate: the design "needs to look realistic and animated", using the game-design and game-engine skills, and impeccable if useful. I loaded `game-design` (the 5-Component Filter and Numbers Policy) and read the `game-engine` skill at `.agents/skills/game-engine/SKILL.md` (game loop, Canvas 2D rendering, particles). I did not load impeccable: the change is to the game field, not the page's interface.

### What changed on the board

- A new **LOOK AND MOTION** section before the prototype, describing the materials, impacts and idle life.
- The prototype's play field was redrawn; the rules and every mode are unchanged.
- A fifth decision on the form: **Look** (realistic lit table in every theme, realistic but recoloured per theme, or flat theme-token look).
- The script now lives in `.lavish/pinwheel/proto.js` and is inlined into `index.html` at build time, so the board is still one self-contained file (about 97 KB).

### Materials, light and depth

| Object | How it is drawn |
|---|---|
| Wheel | A sawn log slice: wobbly growth rings, drying cracks, a ragged bark edge, and red and blue paint multiplied into the grain. The wood sprite rotates; a separate highlight-and-shade layer does not, so the wheel reads as lit from the top-left while it turns. A steel hub cap with a slot shows the spin. |
| Pins | Steel needle, brass collar and a glossy bead in the seat colour. Chosen over a dart shape so the game does not look like the sibling Darts design. |
| Prizes | Bevelled metal stars on brass pegs; a larger gold star with slow light rays; a domed bomb with a brass cap and lit fuse; an enamel reverse token. |
| Table | Dark woven cloth with grain, a faint chalk ring and a vignette. Seat colours are the four `--c-portal-*` tokens because the matcha player green disappears on a dark table. |
| Shadows | Soft shadows under the wheel, every pin and every prize, all offset the same way. A pin in flight casts a shadow that closes in as it drops. |
| Pads | Domed arcade buttons in a dark bezel; they sink 7% on press, and the active one breathes. |

### Animation

- **Stick:** the pin shivers (a damped 42 rad/s wobble) and settles; wood chips and dust fly from the entry point; the wheel recoils on a spring.
- **Clink:** a 60 ms freeze, sparks, a shock ring and screen shake; the thrown pin tumbles off under gravity and the struck pin shivers too.
- **Star / gold / reverse / bomb:** each has its own burst (gold sparks and ring; a larger burst and flash; a blue ring round the whole wheel; flash, smoke and every pin blown off).
- **Flight:** a light streak behind the pin, which shrinks as it drops onto the wheel.
- **Idle life:** stars bob and glint in turn, the gold star's rays turn, the fuse sputters, dust drifts through the light, the live lane's chalk dashes march toward the wheel.
- **Easing:** new wheels and prizes pop in with overshoot, staggered; call-outs punch in and lift away with a dark outline for legibility; the wheel banner is a glass plate that slides in; the score on a pad pops when it changes.
- **Sound:** throw whoosh, a low thunk on stick, a bright clink, rising chimes for stars, a low boom. Synthesised in the prototype.
- **Reduced motion:** no shake and no freeze, a third of the particles, no pad animations.

### 5-Component check (game-design skill)

| Component | State after this round |
|---|---|
| Response | Throw fires on pointer-down; the pad sinks at once; no input is blocked by animation. The 60 ms freeze happens after the result is decided. |
| Clarity | The live lane and pad are lit; a clink, a stick and a star now look and sound different. Still weak: the Close Shave band is not shown before the throw. |
| Satisfaction | Every outcome fires at least three channels (motion, particles, sound; plus shake on a clink). |
| Fit | Weight is carried by the recoil spring and the low thunk; the fuse and glints keep the table alive between turns. |
| Motivation | Unchanged: three wheels, most stars. |

### Performance and what "phone-smooth" rests on

- Every textured object (table, wheel, light layer, shadow, hub, four pins, prizes, glint) is painted once to an offscreen canvas at 3× and reused with `drawImage`. Per frame the game draws about 30 images and at most 220 particles; there are no per-frame blur filters.
- Measured: in headless desktop Chrome at 390×844, 197 frames in 5.2 s during 4-player play with all items, 3 of them over 30 ms. Headless frame pacing is not a phone, so this shows only that nothing is pathologically slow. **Not measured on a real phone.**

### Numbers (Numbers Policy)

Every gameplay and feel number in the prototype is a **starting value** chosen by me for a first playtest, not sourced and not measured: clink width 0.17 rad, star catch width 0.16 rad, Close Shave band 0.11 rad, pin speed 900 px/s, 7 s shot clock, 16-pin cap, 30 s Scramble, 1.3 s stun, bot timing error 130/60/20 ms, 60 ms freeze, recoil spring 420/17. Test: five two-player matches on a phone. Pass: a new player scores at least one star on wheel 1 and matches end between 60 and 120 seconds. If stars are too hard, widen the catch width first; if clinks dominate, narrow the clink width before touching wheel speed.

### Verification this round

One browser batch, then the browser was stopped:

- No console errors after one fix (the seat colour tokens were missing from the board's CSS, which made the first build fail with `rgba(230,NaN,NaN,1)`; added and rebuilt).
- 4 players with T1, T2 and T4: six pins stuck, scores 0, 3, 0, 1, no horizontal overflow.
- Vs HARD bot: full match to the result screen, "BOT WINS", 1–13.
- 3-player Scramble: running, scores 0, 0, 4 after 8 s. Co-op: ended "OUT OF HEARTS".
- Screenshot checked by eye: wood, beads, stars, bomb, shadows, lit pad and call-outs all render.
- Still not verified: a real phone, and clicking inside the Lavish frame.

### Consequence for the real build

The realistic field breaks one repo rule on purpose: `.claude/rules/theming-rules.md` routes all colours through `--c-*` tokens. Wood, steel and brass cannot follow a theme and still look real, so the build would need the same kind of written exception that avatars already have (a fixed palette module), with seat colours and all chrome still on tokens. That is decision 5 on the board. It adds no image files and does not change the effort estimate (still medium), but adds about a day for sprites and effects.

## 11. Round 3: captain's board feedback — no turns, limited arrows, simultaneous (steering message 002)

Captain's words, from the board (`state/procevent-inbox/lavish-49e12a9dacfce84f.1.result`): "not turn based. both get limited set of arrows, and then shoot simultaneosly". No element annotations and no form answers came with it.

**This supersedes sections 4, 5, 6 and 8 wherever they describe turns, pins or the name.** Sections 1–3 (research and fit) stand. The captain's version is close to the publisher's two-player app variant (finding 8: both ends throw at once), which the first design had set aside in favour of the turn-based four-player variant.

### The base game now

- **No turns.** After the countdown everyone shoots whenever they like. Reload is 0.4 s.
- **Limited arrows per wheel:** 8 each with two players, 6 with three, 5 with four. The remaining arrows are fanned out beside each player's button and counted on it.
- **Star +1. Clink −1** (never below zero): the arrow bounces off and is lost, and the shooter's button locks for 0.8 s. **Bare rim:** the arrow sticks and is a wall for everyone.
- **A wheel ends** when its stars are gone, when every quiver is empty, or after **15 seconds**. The time limit was added after testing: without it a careful player (or the bot) holding arrows keeps a player who has emptied their quiver waiting. Unused arrows score nothing.
- **Three wheels**, most stars wins; a tie plays one sudden-death star with one arrow each.
- **Projectiles are arrows** (steel broadhead, wooden shaft, fletching in the seat colour), as the captain called them. The theme decision is removed from the form.
- **Working name: QUIVER**, because the game is now about spending a limited quiver; PINWHEEL and CLINK stay as alternatives. Game Night already has a game called ARCHERY, so the name deliberately avoids "archery" and "arrow".

### Twists after the change

| # | Twist | Status |
|---|---|---|
| T1 | Close Shave | Unchanged, recommended first |
| T2 | Rim Items | Unchanged, recommended first |
| T3 | **Take Turns** (was Scramble) | The old turn-based base game kept as an optional calmer mode: one arrow each in turn, no arrow limit, 7 s shot clock, 16-arrow rim cap. Small cost. The old Scramble twist is gone because simultaneous play is now the base. |
| T4 | Underdog Sight | Unchanged |
| T5 | Clear the Wheel (co-op) | Unchanged; now also simultaneous |

### What it changes for the build

- **One phone and solo:** no harder than before.
- **Online is harder than the turn-based plan.** Shots from different phones now interact within fractions of a second, so all phones must agree on one order. Proposed model, still Realtime Database only and no WebRTC:
  - The wheel angle is a pure function of (seed, wheel number, server time since the wheel started), using the existing server clock (`useServerClock`).
  - A shot is one integer (milliseconds since wheel start, validated as recent by the rules) appended to the wheel's shot list inside a `runTransaction`. The transaction order is the canonical order. Every client resolves the list in that order against the same wheel.
  - The shooter's phone shows its own result immediately and corrects it in the rare case another shot was committed to the same spot first. This needs a visible "corrected" state so a reversal does not look like a bug.
  - Risk: with four players and poor connections, corrections become noticeable. Fallback: the online-aware coordinator (`src/lib/coordinator.js`) resolves shots and the others wait for its verdict, at the cost of 100–300 ms before feedback.
- **Effort:** medium for base + T1 + T2 + solo + one phone; **medium-plus** with online simultaneous play (the ordering, correction and its e2e test).
- Database keys become `quiverSeed`, `quiverWheelStartedAt`, `quiverShots` (append-only, normalised on read), `quiverSeatUids`; all per-match and in `FIELD_NULLS`.

### Numbers added this round (all starting values, per the Numbers Policy)

Quiver 8/6/5, reload 0.4 s, clink lock 0.8 s, wheel time 15 s. Test as in section 10; additionally a wheel should usually end by stars or empty quivers, not by the clock. If most wheels time out, raise the time before cutting arrows.

### Board and prototype changes

- Headline, summary, fact tiles, outcome cards, match flow, closest-games table, build table and the decisions form were rewritten for the new base game. The form now has four calls: twists, player counts, name, look.
- Prototype: simultaneous shooting with quivers and the wheel clock is the default; TAKE TURNS is a switch; arrow sprite; quiver fan beside each pad. Round-2 copies of the files are kept as `proto.round2.js` and `index.round2.src.html`.

### Verification this round

Browser batches (browser stopped after each):

- 2 players, simultaneous, random tapping: full match ended after 24.4 s on wheel 3, both quivers at 0.
- 4 players with T1, T2 and T4: quivers 4/3/3/2 after 6 s, scores 0/3/7/0, wheel 2 reached; screenshot checked (arrows, quiver fans, items).
- Co-op: ended "OUT OF HEARTS". Take Turns: turn passed to P2 with quivers untouched.
- Found by test: against the bot, a player who emptied the quiver waited indefinitely while the bot held 7 arrows. Fixed with the 15-second wheel clock and a shorter bot planning horizon.
- No console errors.
- Second defect found by test: the HARD bot scored 0 with 24 arrows, because a 0.3 s delay was being added after it had already computed its shot time. Removed. Re-run: full match in 29.5 s, bot 14, random tapper 0.
- Idle match (nobody shoots): ends after 48.4 s, three wheels timed out at 15 s each, shown as a draw.
- Still not verified: a real phone, real multi-finger simultaneous play, and clicking inside the Lavish frame.

## 12. Round 4: captain's board feedback — follow the selected theme (steering message 003)

Captain's words, from the board (`state/procevent-inbox/lavish-49e12a9dacfce84f.2.result`): "can you try to match the design based on the theme selected? this looks good". No annotations and no form answers came with it.

Reading: the simultaneous limited-arrows game and the realistic animated look are approved in principle ("this looks good"); the look must follow the player's chosen Game Night theme instead of one fixed dark table. This answers the Look call (section 10's decision 5) in favour of "realistic objects, coloured from the theme", so that option is now pre-selected on the form. It also removes the theming-rule exception section 10 said the build would need.

### What changed

- The prototype has a **THEME** picker with nine real Game Night themes, their tokens copied from `src/index.css`: MATCHA, GLASS NIGHT, SYNTHWAVE, CARTRIDGE, SHORELINE, 1-BIT MONO, AMBER CRT, C64, NOTEBOOK. (GLASS NIGHT and MIDNIGHT share their colour tokens, so only one is listed.)
- Shapes, lighting, shadows and animation are unchanged. Every colour is now derived from the picked theme's tokens:

| Object | Colour source |
|---|---|
| Table cloth | `surface` → `bg` → a darker edge; light themes get a light cloth with a softer vignette and lighter shadows |
| Player buttons, fletching, lanes | `p1`–`p4` (the app's own player colours, replacing the portal colours used in round 2); the label turns dark on a bright button |
| Stars / gold star | `cta` / `win` |
| Painted rings on the wheel | `danger` and `dim` or `structure` |
| Reverse token | `structure` mixed with `p2` |
| Wood, brass pegs, sparks, chips | A fixed "real material" colour pulled toward the theme: lightly tinted for a multi-colour theme, soaked in the theme's hue when all its accents share one hue (AMBER CRT), and reduced to grey when the theme has no colour (1-BIT MONO) |
| Call-outs and banner | Theme text and `card`/`bg` outline, so they stay readable on light and dark |
| Phone frame, result overlay | `text`, `bg`, `cta` |

- Glow effects use additive blending on dark themes and normal blending with darker colours on light themes, because additive light disappears on a pale cloth.
- All sprites are repainted once when the theme changes (a few milliseconds), then reused as before.

### Consequence for the real build

- No fixed-palette exception to `.claude/rules/theming-rules.md` is needed: the game reads `--c-*` tokens and derives the rest. Steel (arrowheads, hub) stays neutral grey in every theme, which the rule's ban on hard-coded hex still allows as RGB triplets but should be stated in the game's comments.
- New work: a small palette module with a test that every one of the app's 31 themes yields readable contrast between seat colours, stars and the cloth (the repo already recomputes contrast from tokens in `src/lib/contrast.test.js`). I checked nine themes by eye, not all 31.
- Known weak spots seen in the screenshots: on C64 the painted ring is faint against the wood; on 1-BIT MONO the four players differ only by grey level, so the real build needs the per-seat fletching shape already listed under edge cases.

### Verification this round

- Six themes (MATCHA, SYNTHWAVE, 1-BIT MONO, AMBER CRT, CARTRIDGE, C64) played with four players and items, screenshotted and checked by eye in one composite.
- Bot match on SHORELINE ran to the result screen, bot 8, random tapper 0; no horizontal overflow at 390 px; no console errors.
- Defect found and fixed: a local variable named `fx` shadowed the new colour helper and threw `fx is not a function` on every frame with a bomb on the wheel.
- Still not verified: a real phone, the other 22 themes, clicks inside the Lavish frame.

## 13. Round 5: captain's board feedback — all twists except Take Turns (steering message 006)

Captain's words, from the board (`state/procevent-inbox/lavish-49e12a9dacfce84f.3.result`): "add all the twists except take turns implement". No annotations and no form answers came with it; the adapter's keyed `answers` output for this round was empty, so this is a freeform message, not a recorded form answer.

### How I read it, and what I did not assume

- **Taken as decided:** the twist list. In: Close Shave, Rim Items, Underdog Sight, and the co-op mode Clear the Wheel. Out: Take Turns.
- **Not assumed:** the trailing word "implement". It can mean "put those twists into the design" (done on the board) or "go and build the game". Building the real game is outside this scout task's brief, which forbids changes to the app's code, so I did not start it. This is flagged to firstmate in the status line; if the captain means build, the task needs promoting.

### Decisions now settled by the captain's own notes

| Call | Answer | Captain's words |
|---|---|---|
| Turn structure | No turns; limited arrows each; everyone shoots at once | "not turn based. both get limited set of arrows, and then shoot simultaneosly" |
| Look | Realistic and animated, coloured from the selected theme | "can you try to match the design based on the theme selected? this looks good" |
| Twists | All except Take Turns | "add all the twists except take turns implement" |

Still open: **player counts for the first build** and **the name** (QUIVER recommended; PINWHEEL and CLINK listed).

### What changed on the board

- A "DECIDED SO FAR" card under the summary listing the three settled calls and the two still open.
- Prototype: Close Shave, Rim Items and Underdog Sight are on by default as rules of the main game (each can still be switched off to compare); co-op is a mode switch; the Take Turns switch and card are removed.
- The twists section now shows the four that are in, with Take Turns listed as dropped.
- The decisions form is reduced to the two open calls, plus the free-text box.
- Effort updated: **medium** for the main game with its three rule twists, solo bot and one phone; **large** in total once the co-op mode and online simultaneous play are added.

### Open design points this choice raises

- Close Shave is still not signposted before the shot. With it now a core rule, the real build should show the scoring band as a faint glow beside each stuck arrow.
- Underdog Sight with simultaneous play shows continuously for the last-place player; in a two-player game that is half the table for much of the match. Worth a playtest: if it flattens skill, limit it to wheels 2 and 3.
- Co-op with a 15-second wheel clock and three hearts has not been balanced at all; the prototype usually ends in "OUT OF HEARTS" under random tapping.

### Verification this round

- **No browser run.** The new machine-load rule (steering message 005) requires taking `~/.cache/fm-chrome-axi.lock` with `mkdir` first. That path already exists as an empty regular file dated 8 Oct 22:26, so `mkdir` can never succeed and my wait loop would have run forever. I stopped the loop before any browser started and did not delete the file, because the lock is shared between workers and is not mine to clear.
- Checked without a browser instead: the built page's script passes `node --check`; every element id the script looks up exists in the page; the only remaining TRY button targets the co-op switch; the form's fields are `pc`, `nm`, `note`.
- So this round's changes (twist defaults, removed Take Turns switch, reduced form) are **not** confirmed in a running page. The rules code itself is unchanged from round 4, which was browser-tested.
