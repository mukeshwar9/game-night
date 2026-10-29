# DUST KICK

A Wild West SIDE KICK: up to four riders on horses race a pseudo-3D trail, buck the rider beside them, spur on hay,
and rope a rival. It is not a second engine. `createWorld({ dust: true })` in `src/lib/sideKickLogic.js` switches the
Western rules on (they live in `src/lib/dustKickLogic.js`), and the room, results, cup, wire format and renderer are
SIDE KICK's. The plan and the eight answered design questions are in the design board's report (Canyon lead,
SPURS = speed, rope-coil lasso, five tiered obstacles, new game on the same engine, theme-mapped colours, chase camera first).

## What differs from SIDE KICK

| | SIDE KICK | DUST KICK |
|---|---|---|
| Mount | bike | horse; it bucks to kick (rump drops, hind leg lashes out) |
| A landed kick | x0.82 speed, shove, stagger, pip | x0.75 speed, shove, stagger, pip, and the victim is spooked (0.8 s at 85% top); the kicker's meter gains 0.20 |
| Three kicks | throw the rider | same (GRUDGE and PAYBACK stay) |
| Meter | near misses and slipstream | SPURS: hay bales (+1/3 each), landed kicks (+0.20), riding in a rival's dust; one tap spends it, as BOOST does |
| Hay | | rows of 1 to 3 on straights; personal (every rider can take every bale, nothing is sent); +0.5 s surge of +5% |
| Lasso | | two rope coils a race on posts by the trail, at most one held; LASSO wind-up 0.3 s, then it ropes the nearest rider ahead (within 1400 units and 0.55 across): they run at 70% for 1.2 s, the thrower at 112% for 1.2 s; a shielded or fallen rider slips the loop |
| Obstacles | traffic, oil | tumbleweed (-10%, 0.4 s wobble), mud (= oil), rock (x0.7, stagger, a horseshoe), cactus on the edges (a horseshoe, nudged back), log across two lanes (throws you; a sign 110 segments before it). A horseshoe is a pip, never the last; only a log or kicks unseat you. A remount shield ignores all hazards but takes hay |
| Roads | Meadow, Switchback, Rush Hour | Red Canyon (lead look, dusk), Prairie Line (rail wagons, poles), Main Street (false-front shops, water tower), in that cup order |
| Camera | chase or first person | chase only for now (the horse's-eye view comes later) |

Bots dodge rocks, logs and tumbleweeds, go for hay and for a coil when their hand is empty, and throw the rope at a rider ahead.

## Wire

Nothing new at the transport. A rope is a write-once `k/{n} = "victim|L"` on the thrower's own node, beside kick strings; kicks
and ropes share one counter (`kickCount`) so `k/{n}` never collides, and a kick is refused while a rope winds up.
`parseKick` returns `{ to, side: 0, lasso: true }` for it and `receiveLasso` checks it on the victim's phone with wide slack
(the thrower must be behind and near). The report gains `ro` (roped: 1) and `ks` takes the value 2 for a lasso action, so a
ghost shows the wind-up (`kn` goes up with `ks: 2`). Everything else (hay, coils, mud, weeds) is derived from the seed on each
phone. `database.rules.json` treats `dustkick` like `sidekick` and allows `ro`; see `tests/rules/dustkick.test.js`.

## Where it lives

| Piece | File |
|---|---|
| Numbers, roadside, hazards, hay, coils, weeds (pure) | `src/lib/dustKickLogic.js` (+ test) |
| Rules switched on by `dust` | `src/lib/sideKickLogic.js` (`dustHazards`, `tryLasso`, `receiveLasso`, bots) |
| Western colours, all mixes of the theme tokens | `buildPalette(T, { dust: true, look })` in `src/lib/sideKickPalette.js` (every theme tested) |
| Horse, scenery, sky | `createSideKickRenderer(canvas, { dust: true })` in `src/components/sideKickRender.js` |
| Online room, solo | `src/pages/DustKickGame.jsx` (SideKickGame's `makeGame(true)`), `SideKickDemo.jsx` (`/solo/dustkick`) |
| Two-client flow | `tests/e2e/dustkick.spec.js` |

## Tuning

Every number is a starting value chosen without a playtest, like SIDE KICK's. First look at hay density (`DUST_LOOKS.hay`),
the lasso reach and the roped/reel speeds, the kick fill, and how common the logs are. Lasso fairness at 150 ms of lag has the
same risk as a kick: test on two real phones. Open: a darker theme (MIDNIGHT) makes the verge very dark, so check dark themes
on a phone before more art; the horse's-eye camera, the moonlit road and a FRONTIER theme are later.
